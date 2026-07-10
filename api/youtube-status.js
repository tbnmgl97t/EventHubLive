/**
 * GET /api/youtube-status
 * Returns the connected YouTube account info (no token exposed to client).
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { supabase }             from './_utils/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }

  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('youtube_refresh_token, youtube_channel_id, youtube_channel_name, youtube_channel_thumbnail')
      .eq('id', session.tenantId)
      .single()

    if (error) throw error

    // Connected as long as we have a refresh token — channel info is optional display data
    const connected = !!data?.youtube_refresh_token
    return res.status(200).json({
      connected,
      channel_id:        data?.youtube_channel_id        || null,
      channel_name:      data?.youtube_channel_name      || null,
      channel_thumbnail: data?.youtube_channel_thumbnail || null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
