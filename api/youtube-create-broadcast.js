/**
 * POST /api/youtube-create-broadcast
 * Body: { title, description, channel_id }
 *
 * Creates a persistent (always-on) YouTube Live broadcast bound to a fresh
 * ingest stream, for simulcasting a 24/7 JW channel. Starts private/unlisted
 * — encoder-go-live.js / encoder-stop.js flip its privacyStatus afterward.
 * channel_id is accepted for traceability only (the JW channel it's linked
 * to); it isn't sent to YouTube.
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'
import { youtubeRequest }       from './_utils/youtube.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { title, description = '', channel_id } = req.body || {}
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' })

  const { data: tenant } = await supabase
    .from('tenants')
    .select('youtube_refresh_token')
    .eq('id', session.tenantId)
    .single()

  if (!tenant?.youtube_refresh_token) {
    return res.status(400).json({ error: 'YouTube not connected' })
  }

  const refreshToken = tenant.youtube_refresh_token
  console.log(`[youtube-create-broadcast] Creating persistent broadcast "${title}" for JW channel ${channel_id || '(none)'}`)

  let broadcast, stream
  try {
    // Far-future scheduledStartTime + enableAutoStart makes this effectively
    // a persistent/always-on broadcast rather than a one-off scheduled event.
    broadcast = await youtubeRequest(refreshToken, '/liveBroadcasts?part=snippet,status,contentDetails', {
      method: 'POST',
      body: {
        snippet: {
          title: title.trim(),
          description,
          scheduledStartTime: '2030-01-01T00:00:00Z',
        },
        status: {
          privacyStatus: 'unlisted',
        },
        contentDetails: {
          enableAutoStart: true,
          enableAutoStop:  false,
          enableDvr:       true,
          recordFromStart: true,
          startWithSlate:  false,
        },
      },
    })

    stream = await youtubeRequest(refreshToken, '/liveStreams?part=snippet,cdn', {
      method: 'POST',
      body: {
        snippet: { title: `${title.trim()} Stream` },
        cdn: { frameRate: 'variable', ingestionType: 'rtmp', resolution: 'variable' },
      },
    })

    await youtubeRequest(
      refreshToken,
      `/liveBroadcasts/bind?id=${encodeURIComponent(broadcast.id)}&part=id,contentDetails&streamId=${encodeURIComponent(stream.id)}`,
      { method: 'POST' }
    )
  } catch (err) {
    console.error('[youtube-create-broadcast] YouTube API error:', err.message)
    // Best-effort cleanup of any partially created resources
    if (broadcast?.id) {
      try { await youtubeRequest(refreshToken, `/liveBroadcasts?id=${encodeURIComponent(broadcast.id)}`, { method: 'DELETE' }) } catch (_) { /* rollback best-effort */ }
    }
    if (stream?.id) {
      try { await youtubeRequest(refreshToken, `/liveStreams?id=${encodeURIComponent(stream.id)}`, { method: 'DELETE' }) } catch (_) { /* rollback best-effort */ }
    }
    return res.status(502).json({ error: 'YouTube broadcast creation failed', detail: err.message })
  }

  const ingestion = stream.cdn?.ingestionInfo

  return res.status(201).json({
    broadcast_id:      broadcast.id,
    stream_id:         stream.id,
    ingest_url:        ingestion?.ingestionAddress || null,
    stream_key:        ingestion?.streamName        || null,
    youtube_watch_url: `https://www.youtube.com/watch?v=${broadcast.id}`,
  })
}
