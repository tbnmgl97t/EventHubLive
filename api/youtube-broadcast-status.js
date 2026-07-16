/**
 * GET /api/youtube-broadcast-status?broadcast_id=...
 * Returns the current privacyStatus of a persistent YouTube broadcast, so
 * the UI can reflect real state instead of only inferring it from local
 * go-live/stop state.
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { supabase }             from './_utils/supabase.js'
import { youtubeRequest }       from './_utils/youtube.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }

  const broadcastId = req.query?.broadcast_id
  if (!broadcastId) return res.status(400).json({ error: 'broadcast_id is required' })

  const { data: tenant } = await supabase
    .from('tenants')
    .select('youtube_refresh_token')
    .eq('id', session.tenantId)
    .single()

  if (!tenant?.youtube_refresh_token) {
    return res.status(400).json({ error: 'YouTube not connected' })
  }

  try {
    const data = await youtubeRequest(
      tenant.youtube_refresh_token,
      `/liveBroadcasts?part=status&id=${encodeURIComponent(broadcastId)}`
    )
    const item = data?.items?.[0]
    if (!item) return res.status(404).json({ error: 'Broadcast not found' })
    return res.status(200).json({ privacyStatus: item.status?.privacyStatus || null })
  } catch (err) {
    return res.status(502).json({ error: 'YouTube API error', detail: err.message })
  }
}
