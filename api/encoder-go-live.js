/**
 * POST /api/encoder-go-live
 * Body: { encoder_id, destinations: ["website" | "youtube" | "facebook" | "app" | "fast", ...] }
 *
 * Orchestrates routing an encoder's always-on JW channel to public
 * destinations, in parallel. Each destination is independent — one failing
 * does not abort the others. Returns a per-destination result map so the UI
 * can show which succeeded and which need attention.
 */

import { resolveTenantSession, getTenantBrightspotCreds } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'
import { youtubeRequest }       from './_utils/youtube.js'
import { patchSchedule }        from './_utils/fast-channels.js'
import { randomUUID }           from 'node:crypto'
import {
  getEncoderBrightspotPages,
  getEventHubVideoPageTitle,
  updateEventHubVideoPageTitle,
  updateEventHubVideo,
} from './_utils/brightspot.js'

// Overwrites the encoder's assigned BrightSpot ViewNexaVideo's sponsorText
// with the broadcast title, and its VideoPage title, stashing the VideoPage's
// current title on the encoder row first so encoder-stop.js can restore it
// once the broadcast ends.
async function publishToBrightSpot(tenant, encoder, title) {
  const creds = await getTenantBrightspotCreds(encoder.tenant_id)
  if (!creds) {
    console.log(`[BrightSpot] Skipping publish for encoder ${encoder.id} — not configured for this tenant`)
    return { success: true, skipped: true }
  }

  const { pageId, videoPageId } = await getEncoderBrightspotPages(encoder.tenant_id, encoder)
  console.log(`[BrightSpot] encoder "${encoder.name}" (${encoder.id}) -> brightspot_page_id=${pageId} brightspot_video_page_id=${videoPageId}`)

  if (pageId) {
    const { ok, status, body } = await updateEventHubVideo(creds, pageId, { standaloneWeather: false, title })
    if (!ok) console.error(`[BrightSpot] update-video failed (${status}):`, body)
  }

  if (!videoPageId) {
    console.log(`[BrightSpot] Skipping video page publish for encoder ${encoder.id} — no video page assigned`)
    return { success: true, skipped: !pageId }
  }

  const { ok: readOk, status: readStatus, title: originalTitle } = await getEventHubVideoPageTitle(creds, videoPageId)
  if (!readOk) {
    console.error(`[BrightSpot] get-video-page-by-id failed (${readStatus}) for encoder ${encoder.id}`)
  } else {
    await supabase.from('encoders').update({ brightspot_original_headline: originalTitle }).eq('id', encoder.id)
  }

  const { ok, status, body } = await updateEventHubVideoPageTitle(creds, videoPageId, title)
  if (!ok) console.error(`[BrightSpot] update-videopage-heading failed (${status}):`, body)
  return { success: ok, stub: false }
}

// TODO: Replace with real BrightSpot MRSS enable call
// Expected: PUT/PATCH {brightspot_cms_url}/api/editorial/mrss-feeds/{feedId} to set enabled=true
// The feedId likely maps to the JW channel_id stored on the encoder.
async function enableMRSSFeed(tenant, encoder, title) {
  console.log(`[BrightSpot MRSS STUB] Would enable MRSS feed "${title}" for channel ${encoder.channel_id}`)
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
async function goLiveFacebook(tenant, encoder, title) {
  console.log(`[Facebook STUB] Would go live on Facebook as "${title}" (page: ${tenant.facebook_page_name || tenant.facebook_page_id || 'not connected'})`)
  return { success: true, stub: true }
}

// Breaks in to a FAST (Pop-up Channels) linear channel by inserting a
// live_247 schedule item pointed at this encoder's own JW channel. The
// target FAST channel must be channel_type: 1 (Scheduled) with live_mixing
// enabled, or the schedule change has no visible effect on playout.
// end_time is a short (10 min) safety ceiling, not the real end — the real
// end is an explicit delete (see endFASTBreakIn in encoder-stop.js). The
// fast-renew-breakin cron (see vercel.json) pushes this ceiling forward every
// few minutes for as long as the break-in stays active, so a normal
// broadcast never actually reaches it; the short ceiling only matters if the
// cron stops running, in which case the break-in self-heals away within at
// most ~10 minutes instead of running forever unattended.
const BREAKIN_CEILING_MS = 10 * 60 * 1000

async function breakInToFAST(tenant, encoder) {
  if (!tenant.fast_api_key) throw new Error('Pop-up Channels API key not configured for this tenant')
  if (!encoder.fast_channel_id) throw new Error('No FAST channel configured for this encoder')

  const creds = { apiKey: tenant.fast_api_key }
  const now = new Date()
  const ceiling = new Date(now.getTime() + BREAKIN_CEILING_MS)
  // The API doesn't assign ids on insert — the client supplies one, even for
  // a brand-new item — so we mint one here and it comes back unchanged.
  const itemId = randomUUID()
  const [created] = await patchSchedule(creds, encoder.fast_channel_id, {
    add: [{
      id: itemId,
      item_type: 'live_247',
      media_id: encoder.channel_id,
      start_time: now.toISOString(),
      end_time: ceiling.toISOString(),
    }],
  })

  await supabase.from('encoders').update({ fast_schedule_item_id: created?.id || itemId }).eq('id', encoder.id)
  return { success: true, schedule_item_id: created?.id || itemId }
}

const HANDLERS = {
  website:  publishToBrightSpot,
  app:      enableMRSSFeed,
  youtube:  goLiveYouTube,
  facebook: goLiveFacebook,
  fast:     breakInToFAST,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { encoder_id, destinations, title } = req.body || {}
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
    .select('brightspot_cms_url, brightspot_site_url, brightspot_api_key, youtube_refresh_token, facebook_page_access_token, facebook_page_id, facebook_page_name, fast_api_key')
    .eq('id', session.tenantId)
    .single()

  const results = {}
  await Promise.all(destinations.map(async dest => {
    const fn = HANDLERS[dest]
    if (!fn) { results[dest] = { success: false, error: `Unknown destination: ${dest}` }; return }
    try {
      const outcome = await fn(tenant || {}, encoder, title || encoder.name)
      results[dest] = { success: true, ...outcome }
    } catch (err) {
      console.error(`[encoder-go-live] ${dest} failed:`, err.message)
      results[dest] = { success: false, error: err.message }
    }
  }))

  const anyFailed = Object.values(results).some(r => !r.success)
  return res.status(200).json({ ok: true, results, any_failed: anyFailed, started_by: session.email || null })
}
