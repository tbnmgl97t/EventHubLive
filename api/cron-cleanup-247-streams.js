import { supabase }       from './_utils/supabase.js'
import { youtubeRequest } from './_utils/youtube.js'
import { fbRequest }      from './_utils/facebook.js'

const MAX_AGE_MS = 48 * 60 * 60 * 1000 // testing-phase cap — 24/7 streams older than this get deleted automatically

/** Deletes one JW 24/7 stream plus its linked YouTube/Facebook resources and Supabase rows. */
async function deleteStream({ tenant, jw, streamId, streamName }) {
  const warnings = []

  // YouTube cleanup (non-fatal)
  if (tenant.youtube_refresh_token) {
    try {
      const { data: yt } = await supabase
        .from('youtube_streams')
        .select('broadcast_id, stream_id')
        .eq('jw_stream_id', streamId)
        .single()

      if (yt?.broadcast_id) {
        const rt = tenant.youtube_refresh_token
        try {
          const bc = await youtubeRequest(rt, `/liveBroadcasts?part=status&id=${encodeURIComponent(yt.broadcast_id)}`)
          const lifeCycle = bc?.items?.[0]?.status?.lifeCycleStatus
          if (lifeCycle === 'live' || lifeCycle === 'testing') {
            await youtubeRequest(rt, `/liveBroadcasts/transition?broadcastStatus=complete&id=${encodeURIComponent(yt.broadcast_id)}&part=status`, { method: 'POST' })
          }
        } catch (e) { warnings.push(`youtube status/transition: ${e.message}`) }

        try {
          await youtubeRequest(rt, `/liveBroadcasts?id=${encodeURIComponent(yt.broadcast_id)}`, { method: 'DELETE' })
        } catch (e) { warnings.push(`youtube broadcast delete: ${e.message}`) }

        if (yt.stream_id) {
          try {
            await youtubeRequest(rt, `/liveStreams?id=${encodeURIComponent(yt.stream_id)}`, { method: 'DELETE' })
          } catch (e) { warnings.push(`youtube stream delete: ${e.message}`) }
        }
      }
    } catch (e) { warnings.push(`youtube lookup: ${e.message}`) }
  }

  // Facebook cleanup (non-fatal)
  if (tenant.facebook_page_access_token) {
    try {
      const { data: fb } = await supabase
        .from('facebook_streams')
        .select('live_video_id')
        .eq('jw_stream_id', streamId)
        .single()

      if (fb?.live_video_id) {
        try {
          await fbRequest(tenant.facebook_page_access_token, `/${fb.live_video_id}`, { method: 'POST', body: { end_live_video: true } }).catch(() => {})
          await fbRequest(tenant.facebook_page_access_token, `/${fb.live_video_id}`, { method: 'DELETE' })
        } catch (e) { warnings.push(`facebook live video delete: ${e.message}`) }
      }
    } catch (e) { warnings.push(`facebook lookup: ${e.message}`) }
  }

  // Supabase registry cleanup (non-fatal)
  try {
    await Promise.all([
      supabase.from('streams').delete().eq('jw_stream_id', streamId),
      supabase.from('youtube_streams').delete().eq('jw_stream_id', streamId),
      supabase.from('facebook_streams').delete().eq('jw_stream_id', streamId),
    ])
  } catch (e) { warnings.push(`supabase cleanup: ${e.message}`) }

  // Flag (but don't null out — channel_id is NOT NULL) any encoder left pointing at the deleted channel
  try {
    const { data: orphaned } = await supabase
      .from('encoders')
      .select('id, name')
      .eq('channel_id', streamId)
    if (orphaned?.length) {
      warnings.push(`orphaned encoder(s) now pointing at a deleted channel: ${orphaned.map(e => `${e.name} (${e.id})`).join(', ')}`)
    }
  } catch (_) { /* non-fatal */ }

  // Delete the JW media/broadcast stream itself
  const r = await fetch(`https://api.jwplayer.com/v2/sites/${jw.siteId}/media/${streamId}/`, {
    method: 'DELETE',
    headers: { Authorization: jw.apiSecret, Accept: 'application/json' },
  })
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`JW delete failed (${r.status}): ${body}`)
  }

  return { streamId, streamName, warnings }
}

/**
 * GET/POST /api/cron-cleanup-247-streams
 *
 * Testing-phase safety net: JW 24/7 ("always on") streams are meant to run
 * forever, which racks up JW costs if left behind after a test. This scans
 * every tenant's 24/7 streams and deletes any older than 48 hours — no
 * exceptions, including ones currently assigned to an encoder (which will
 * need reassigning to a new channel afterward).
 *
 * Triggered by Vercel Cron (see vercel.json), which sends
 * `Authorization: Bearer $CRON_SECRET` — reject anything else so this
 * destructive endpoint can't be hit by the public internet.
 */
export default async function handler(req, res) {
  const authHeader = req.headers.authorization || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: tenants, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, jw_site_id, jw_api_secret, youtube_refresh_token, facebook_page_access_token')
    .not('jw_site_id', 'is', null)
    .not('jw_api_secret', 'is', null)

  if (tenantErr) return res.status(500).json({ error: tenantErr.message })

  const deleted = []
  const errors  = []

  for (const tenant of (tenants || [])) {
    const jw = { siteId: tenant.jw_site_id, apiSecret: tenant.jw_api_secret }

    let streams
    try {
      const r = await fetch(`https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/streams/?page_length=50`, {
        headers: { Authorization: jw.apiSecret, Accept: 'application/json' },
      })
      if (!r.ok) { errors.push({ tenant_id: tenant.id, error: `JW list failed (${r.status})` }); continue }
      const data = await r.json()
      streams = data.streams || data.broadcast_streams || data.items || data.results || []
    } catch (e) {
      errors.push({ tenant_id: tenant.id, error: `JW list failed: ${e.message}` })
      continue
    }

    const now = Date.now()
    const stale = streams.filter(s => {
      if (s.stream_type !== '24/7') return false
      const createdAt = s.created || s.created_at
      if (!createdAt) return false
      return now - new Date(createdAt).getTime() >= MAX_AGE_MS
    })

    for (const s of stale) {
      try {
        const result = await deleteStream({ tenant, jw, streamId: s.id, streamName: s.metadata?.title || s.id })
        deleted.push({ tenant_id: tenant.id, ...result })
      } catch (e) {
        errors.push({ tenant_id: tenant.id, stream_id: s.id, error: e.message })
      }
    }
  }

  return res.status(200).json({ ok: true, deleted_count: deleted.length, deleted, errors })
}
