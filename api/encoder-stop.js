/**
 * POST /api/encoder-stop
 * Body: { encoder_id, started_at, ended_at, destinations, title }
 *
 * 1. Reverses the go-live actions on every destination that was active.
 * 2. Triggers a JW clip covering the broadcast window.
 * 3. Records the broadcast in broadcast_history, including the clip ID once
 *    JW returns one.
 */

import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'
import { youtubeRequest }       from './_utils/youtube.js'

// TODO: Replace with real BrightSpot unpublish API call — mirror of the
// publish stub in encoder-go-live.js, once that endpoint is confirmed.
async function unpublishFromBrightSpot(tenant, encoder) {
  console.log(`[BrightSpot STUB] Would unpublish stream "${encoder.name}" from ${tenant.brightspot_cms_url}`)
  return { success: true, stub: true }
}

// TODO: Replace with real BrightSpot MRSS disable call — mirror of the
// enable stub in encoder-go-live.js.
async function disableMRSSFeed(tenant, encoder) {
  console.log(`[BrightSpot MRSS STUB] Would disable MRSS feed for channel ${encoder.channel_id}`)
  return { success: true, stub: true }
}

async function makeYouTubePrivate(tenant, encoder) {
  if (!tenant.youtube_refresh_token) throw new Error('YouTube account not connected')
  if (!encoder.youtube_broadcast_id) throw new Error('No YouTube broadcast configured for this encoder')

  await youtubeRequest(tenant.youtube_refresh_token, '/liveBroadcasts?part=status', {
    method: 'PUT',
    body: { id: encoder.youtube_broadcast_id, status: { privacyStatus: 'unlisted' } },
  })
  return { success: true }
}

// TODO: mirror of the Facebook go-live stub — see encoder-go-live.js.
async function stopFacebook(tenant, encoder) {
  console.log(`[Facebook STUB] Would stop Facebook live for "${encoder.name}"`)
  return { success: true, stub: true }
}

const STOP_HANDLERS = {
  website:  unpublishFromBrightSpot,
  app:      disableMRSSFeed,
  youtube:  makeYouTubePrivate,
  facebook: stopFacebook,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { encoder_id, started_at, ended_at, destinations, title } = req.body || {}
  if (!encoder_id) return res.status(400).json({ error: 'encoder_id is required' })

  const activeDests = Array.isArray(destinations) ? destinations : []

  const { data: encoder } = await supabase
    .from('encoders')
    .select('*')
    .eq('id', encoder_id)
    .eq('tenant_id', session.tenantId)
    .single()
  if (!encoder) return res.status(404).json({ error: 'Encoder not found' })

  const { data: tenant } = await supabase
    .from('tenants')
    .select('brightspot_cms_url, brightspot_site_url, brightspot_api_key, youtube_refresh_token, facebook_page_access_token, facebook_page_id, facebook_page_name')
    .eq('id', session.tenantId)
    .single()

  // ── 1. Reverse go-live actions ────────────────────────────────────────────
  const results = {}
  await Promise.all(activeDests.map(async dest => {
    const fn = STOP_HANDLERS[dest]
    if (!fn) { results[dest] = { success: false, error: `Unknown destination: ${dest}` }; return }
    try {
      const outcome = await fn(tenant || {}, encoder)
      results[dest] = { success: true, ...outcome }
    } catch (err) {
      console.error(`[encoder-stop] ${dest} teardown failed:`, err.message)
      results[dest] = { success: false, error: err.message }
    }
  }))

  // ── 2. Trigger JW clip ────────────────────────────────────────────────────
  const jw = await getTenantJwCreds(session.tenantId)
  const clipDate = new Date(ended_at || Date.now())
  const clipTitle = title || `${encoder.name} — ${clipDate.toLocaleString()}`

  let jwClipId  = null
  let clipError = null

  if (!jw) {
    clipError = 'JW Player is not configured for this tenant yet'
  } else if (!encoder.channel_id || !started_at || !ended_at) {
    clipError = 'Missing channel or broadcast timestamps for clipping'
  } else {
    const clipUrl = `https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/streams/${encoder.channel_id}/clip/`
    try {
      const r = await fetch(clipUrl, {
        method: 'PUT',
        headers: {
          Authorization:  jw.apiSecret,
          'Content-Type': 'application/json',
          Accept:         'application/json',
        },
        body: JSON.stringify({
          title:       clipTitle,
          start_time:  started_at,
          end_time:    ended_at,
          description: `Broadcast by ${encoder.name}. Destinations: ${activeDests.join(', ') || 'none'}. Recorded ${clipDate.toLocaleDateString()}.`,
          tags:        ['live-broadcast', encoder.name, clipDate.toISOString().slice(0, 10)],
        }),
      })
      const text = await r.text()
      console.log('[encoder-stop] JW clip response', r.status, text.slice(0, 300))

      if (!r.ok) {
        clipError = `JW clip API error ${r.status}: ${text}`
      } else {
        const data = text ? JSON.parse(text) : {}
        jwClipId = data.id || null
      }
    } catch (err) {
      clipError = err.message
    }
  }

  if (clipError) console.error('[encoder-stop] Clipping failed:', clipError)

  // ── 3. Save broadcast_history ─────────────────────────────────────────────
  const { data: historyRow, error: historyError } = await supabase
    .from('broadcast_history')
    .insert({
      encoder_id,
      tenant_id:  session.tenantId,
      title:      clipTitle,
      started_at: started_at || null,
      ended_at:   ended_at   || null,
      destinations: activeDests,
      jw_clip_id: jwClipId,
      clip_title: jwClipId ? clipTitle : null,
      clip_metadata: {
        encoder_name: encoder.name,
        destinations: activeDests,
        started_at:   started_at || null,
        ended_at:     ended_at   || null,
        ...(clipError ? { clip_error: clipError } : {}),
      },
    })
    .select()
    .single()

  if (historyError) console.error('[encoder-stop] Failed to save broadcast history:', historyError.message)

  const anyFailed = Object.values(results).some(r => !r.success)
  return res.status(200).json({
    ok: true,
    results,
    any_failed: anyFailed,
    jw_clip_id: jwClipId,
    clip_error: clipError,
    history: historyRow || null,
  })
}
