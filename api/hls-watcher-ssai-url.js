/**
 * GET /api/hls-watcher-ssai-url?id=<streamId> -> the SSAI-enabled preview URL
 * for the monitoring/tracker screen's embedded player.
 *
 * TEMPORARY: hardcoded to a known-working example (TBN's real JW site/ad
 * config, not this tenant's) so the preview player can be demoed before
 * every tenant has a real ad config set up. Every macro below — site_id,
 * ad_config_id, media/content_id, and viewer-specific params like
 * ip/ua/lat/lon/cb — needs to go dynamic later: site_id from the tenant's
 * own JW credentials, ad_config_id from the stream's ad_config_id column
 * (already stored at creation time, just unused here for now), media/
 * content_id from the stream's manifest_url, and the viewer params from the
 * actual request.
 */

import { resolveTenantSession } from './_utils/tenant.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id is required' })

  const SITE_ID = 'Yal8cmyO'
  const AD_CONFIG_ID = 'YaUIf6Ur'
  const MEDIA_ID = 'fCGf6ROk'

  const params = new URLSearchParams({
    ad_config_id: AD_CONFIG_ID,
    ip: '66.169.162.242, 15.158.29.111',
    gdpr: '0',
    min_ad_duration: '6',
    max_ad_duration: '60',
    format: 'vast',
    content_cat: 'IAB1-7',
    content_genre: 'entertainment',
    content_rating: 'TV-G',
    content_channel: 'TBN',
    content_network: 'TBN',
    version_player: 'optimus_dsp',
    content_title: 'TBN',
    content_id: MEDIA_ID,
    app_name: 'TBN',
    did: '',
    coppa: '0',
    cb: '26b21785-05a1-42d6-868d-6221de1dada1',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    lat: '32.92610',
    lon: '-97.24860',
    device_type: '',
    ssai_enabled: '1',
    ssai_vendor: 'jwplayer',
    livestream: 'jwplayer',
  })

  const ssaiUrl = `https://cdn.jwplayer.com/v2/sites/${SITE_ID}/media/${MEDIA_ID}/ssai.m3u8?${params.toString()}`
  return res.status(200).json({ url: ssaiUrl })
}
