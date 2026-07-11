/**
 * POST /api/encoder-go-live
 * Body: { encoder_id, destinations: ["website" | "youtube" | "facebook" | "app", ...] }
 *
 * Orchestrates routing an encoder's always-on JW channel to public
 * destinations, in parallel. Each destination is independent — one failing
 * does not abort the others. Returns a per-destination result map so the UI
 * can show which succeeded and which need attention.
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'
import { youtubeRequest }       from './_utils/youtube.js'

// TODO: Replace with real BrightSpot publish API call
// The BrightSpot REST endpoint to publish a live stream article is not yet confirmed.
// Expected call: POST {brightspot_cms_url}/api/editorial/live-streams with the JW channel embed code.
// For now, log the intent and return success so the rest of orchestration proceeds.
async function publishToBrightSpot(tenant, encoder) {
  console.log(`[BrightSpot STUB] Would publish stream "${encoder.name}" to ${tenant.brightspot_cms_url}`)
  // When real API is known, call brightspot-proxy with the correct endpoint + payload
  return { success: true, stub: true }
}

// TODO: Replace with real BrightSpot MRSS enable call
// Expected: PUT/PATCH {brightspot_cms_url}/api/editorial/mrss-feeds/{feedId} to set enabled=true
// The feedId likely maps to the JW channel_id stored on the encoder.
async function enableMRSSFeed(tenant, encoder) {
  console.log(`[BrightSpot MRSS STUB] Would enable MRSS feed for channel ${encoder.channel_id}`)
  return { success: true, stub: true }
}

async function goLiveYouTube(tenant, encoder) {
  if (!tenant.youtube_refresh_token) throw new Error('YouTube account not connected. Connect it in Settings first.')
  if (!encoder.youtube_broadcast_id) throw new Error('No YouTube broadcast configured for this encoder. Set it in the encoder\'s settings.')

  await youtubeRequest(tenant.youtube_refresh_token, '/liveBroadcasts?part=status', {
    method: 'PUT',
    body: { id: encoder.youtube_broadcast_id, status: { privacyStatus: 'public' } },
  })
  return { success: true }
}

// TODO: Facebook simulcast for always-on encoders isn't fully wired yet — the
// physical encoder only pushes RTMP to JW. Going live on Facebook would
// require the JW channel's additional_outputs to already include a persistent
// Facebook RTMP destination (bound once at simulcast setup, same idea as
// youtube_broadcast_id above), which isn't tracked per-encoder yet.
// For now, log the intent and return success so the rest of orchestration proceeds.
async function goLiveFacebook(tenant, encoder) {
  console.log(`[Facebook STUB] Would go live on Facebook for "${encoder.name}" (page: ${tenant.facebook_page_name || tenant.facebook_page_id || 'not connected'})`)
  return { success: true, stub: true }
}

const HANDLERS = {
  website:  publishToBrightSpot,
  app:      enableMRSSFeed,
  youtube:  goLiveYouTube,
  facebook: goLiveFacebook,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { encoder_id, destinations } = req.body || {}
  if (!encoder_id) return res.status(400).json({ error: 'encoder_id is required' })
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return res.status(400).json({ error: 'destinations must be a non-empty array' })
  }

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

  const results = {}
  await Promise.all(destinations.map(async dest => {
    const fn = HANDLERS[dest]
    if (!fn) { results[dest] = { success: false, error: `Unknown destination: ${dest}` }; return }
    try {
      const outcome = await fn(tenant || {}, encoder)
      results[dest] = { success: true, ...outcome }
    } catch (err) {
      console.error(`[encoder-go-live] ${dest} failed:`, err.message)
      results[dest] = { success: false, error: err.message }
    }
  }))

  const anyFailed = Object.values(results).some(r => !r.success)
  return res.status(200).json({ ok: true, results, any_failed: anyFailed })
}
