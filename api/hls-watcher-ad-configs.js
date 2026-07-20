/**
 * GET /api/hls-watcher-ad-configs -> list this tenant's JW Player ad configs,
 * for the Add Stream form's "Ad Config" picker. Read-only against JW's
 * Management API — https://api.jwplayer.com/v2/sites/{site_id}/ad_configs —
 * same auth pattern as every other JW call in this app (jwFetch + the
 * tenant's stored site_id/api_secret).
 */

import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'
import { jwFetch } from './_utils/jw.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }

  const jw = await getTenantJwCreds(session.tenantId)
  if (!jw) return res.status(200).json({ ad_configs: [] })

  const r = await jwFetch(jw, `https://api.jwplayer.com/v2/sites/${jw.siteId}/ad_configs/`)
  if (!r.ok) return res.status(r.status).json({ error: `JW API error ${r.status}` })

  const data = await r.json()
  return res.status(200).json({ ad_configs: data?.ad_configs || data?.results || [] })
}
