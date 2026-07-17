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
import { patchSchedule }        from './_utils/fast-channels.js'

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
    body: { id: encoder.youtube_broadcast_id, status: { privacyStatus: 'private' } },
  })
  return { success: true }
}

// TODO: mirror of the Facebook go-live stub — see encoder-go-live.js.
async function stopFacebook(tenant, encoder) {
  console.log(`[Facebook STUB] Would stop Facebook live for "${encoder.name}"`)
  return { success: true, stub: true }
}

// Removes the live_247 schedule item inserted by breakInToFAST
// (encoder-go-live.js), restoring the FAST channel's regular schedule
// (or filler playlist, if configured) for whatever gap is left behind.
async function endFASTBreakIn(tenant, encoder) {
  if (!tenant.fast_api_key) throw new Error('Pop-up Channels API key not configured for this tenant')
  if (!encoder.fast_channel_id) throw new Error('No FAST channel configured for this encoder')
  if (!encoder.fast_schedule_item_id) {
    return { success: true, note: 'No active break-in schedule item to remove' }
  }

  const creds = { apiKey: tenant.fast_api_key }
  await patchSchedule(creds, encoder.fast_channel_id, { delete: [encoder.fast_schedule_item_id] })
  await supabase.from('encoders').update({ fast_schedule_item_id: null }).eq('id', encoder.id)
  return { success: true }
}

const STOP_HANDLERS = {
  website:  unpublishFromBrightSpot,
  app:      disableMRSSFeed,
  youtube:  makeYouTubePrivate,
  facebook: stopFacebook,
  fast:     endFASTBreakIn,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { encoder_id, started_at, ended_at, destinations, title, started_by } = req.body || {}
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
    .select('timezone, brightspot_cms_url, brightspot_site_url, brightspot_api_key, youtube_refresh_token, facebook_page_access_token, facebook_page_id, facebook_page_name, fast_api_key')
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

  // ── 2. Trigger clip creation ──────────────────────────────────────────────
  const jw = await getTenantJwCreds(session.tenantId)
  const clipDate = new Date(ended_at || Date.now())
  const clipTitle = title || `${encoder.name} — ${clipDate.toLocaleString()}`

  // Generic broadcast context — not tied to any one clipping provider — sent
  // as custom metadata on the created asset and also stored on our own row.
  const tz = tenant?.timezone || 'America/New_York'
  const startedDate = started_at ? new Date(started_at) : null
  const endedDate    = ended_at   ? new Date(ended_at)   : null
  const fmtTzDateTime = d => d ? d.toLocaleString('en-US', {
    timeZone: tz, timeZoneName: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }) : null
  const customParams = {
    encoder:     encoder.name,
    date:        startedDate ? startedDate.toLocaleDateString('en-CA', { timeZone: tz }) : null,
    startTime:   fmtTzDateTime(startedDate),
    endTime:     fmtTzDateTime(endedDate),
    userStart:   started_by || null,
    userEnd:     session.email || null,
    destination: activeDests.join(', '),
  }
  // JW's custom_params requires string values only — drop anything null/undefined
  // rather than send a value type it'll reject.
  const customParamsForJw = Object.fromEntries(
    Object.entries(customParams).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
  )

  let providerAssetId = null
  let assetUrl         = null
  let clipError        = null

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
          title:          clipTitle, // deprecated top-level field, but still required by the API
          trim_in_point:  started_at,
          trim_out_point: ended_at,
          // title/description/tags/custom_params only take effect nested under
          // metadata — the top-level fields above don't set the visible asset title.
          metadata: {
            title:         clipTitle,
            description:   `Broadcast by ${encoder.name}. Destinations: ${activeDests.join(', ') || 'none'}. Recorded ${clipDate.toLocaleDateString()}.`,
            tags:          ['live-broadcast', encoder.name, clipDate.toISOString().slice(0, 10)],
            custom_params: customParamsForJw,
          },
        }),
      })
      const text = await r.text()
      console.log('[encoder-stop] JW clip response', r.status, text.slice(0, 300))

      if (!r.ok) {
        clipError = `JW clip API error ${r.status}: ${text}`
      } else {
        const data = text ? JSON.parse(text) : {}
        // JW's response is { media_id, legacy_id } — not { id }.
        providerAssetId = data.media_id || data.id || null
        // Link to the asset's management page in the JW dashboard.
        assetUrl = providerAssetId ? `https://dashboard.jwplayer.com/p/${jw.siteId}/media/${providerAssetId}` : null
      }
    } catch (err) {
      clipError = err.message
    }
  }

  if (clipError) console.error('[encoder-stop] Clipping failed:', clipError)

  // ── 3. Save broadcast_history ─────────────────────────────────────────────
  // provider/asset_id/asset_url/started_by/ended_by are intentionally generic —
  // this isn't JW-only long-term, other clipping/CDN integrations may follow.
  const { data: historyRow, error: historyError } = await supabase
    .from('broadcast_history')
    .insert({
      encoder_id,
      tenant_id:  session.tenantId,
      title:      clipTitle,
      started_at: started_at || null,
      ended_at:   ended_at   || null,
      destinations: activeDests,
      provider:   'jwplayer',
      asset_id:   providerAssetId,
      asset_url:  assetUrl,
      started_by: started_by || null,
      ended_by:   session.email || null,
      clip_title: providerAssetId ? clipTitle : null,
      clip_metadata: {
        ...customParams,
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
    asset_id: providerAssetId,
    asset_url: assetUrl,
    clip_error: clipError,
    history: historyRow || null,
  })
}
