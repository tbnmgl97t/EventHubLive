/**
 * GET /api/hls-watcher-ssai-url?id=<streamId> -> the SSAI-enabled preview URL
 * for a stream's chosen ad_config_id, for the monitoring/tracker screen's
 * embedded player.
 *
 * JW live stream manifest URLs are always of the form
 * https://cdn.jwplayer.com/live/broadcast/{media_id}.m3u8 -- media_id is
 * extracted from the stream's own manifest_url rather than requiring a
 * separate JW lookup. The SSAI manifest URL itself
 * (https://cdn.jwplayer.com/v2/sites/{site_id}/media/{media_id}/ssai.m3u8?ad_config_id=...)
 * is a public JW delivery endpoint (like the one media-renditions.js already
 * calls) -- no API secret needed to construct or fetch it, only to have
 * looked up ad_config_id in the first place (done at stream-creation time).
 */

import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'
import { hlsParserDb } from './_utils/supabase.js'

const LIVE_BROADCAST_ID_RE = /\/live\/broadcast\/([^/.]+)/

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id is required' })

  const { data: stream, error } = await hlsParserDb
    .from('hls_streams')
    .select('manifest_url, ad_config_id')
    .eq('id', id)
    .eq('tenant_id', session.tenantId)
    .single()
  if (error || !stream) return res.status(404).json({ error: 'Stream not found' })
  if (!stream.ad_config_id) return res.status(400).json({ error: 'This stream has no ad config selected' })

  const match = stream.manifest_url.match(LIVE_BROADCAST_ID_RE)
  if (!match) {
    return res.status(422).json({ error: 'Could not determine a JW media id from this stream\'s manifest URL' })
  }
  const mediaId = match[1]

  const jw = await getTenantJwCreds(session.tenantId)
  if (!jw) return res.status(400).json({ error: 'JW Player is not configured for this tenant' })

  const ssaiUrl = `https://cdn.jwplayer.com/v2/sites/${jw.siteId}/media/${mediaId}/ssai.m3u8?ad_config_id=${encodeURIComponent(stream.ad_config_id)}`
  return res.status(200).json({ url: ssaiUrl })
}
