/**
 * GET /api/brightspot-search-pages?kind=page|video
 *
 * Lists BrightSpot pages to assign to an encoder (Encoder Page / Encoder
 * Video Page). Backs the picker dropdown in EncoderForm.
 *
 * BrightSpot's custom EventHubLive endpoints don't accept a search term —
 * they always return the tenant's full list — so this endpoint just proxies
 * that full list back as-is. The frontend Autocomplete filters it locally
 * as the user types.
 *   kind=page  -> GET {cmsUrl}/api/eventhublive/get-all-live-videos  (Encoder Page)
 *   kind=video -> GET {cmsUrl}/api/eventhublive/get-all-video-pages  (Encoder Video Page)
 */

import { resolveTenantSession, getTenantBrightspotCreds } from './_utils/tenant.js'
import { brightspotEventHubFetch, mapEventHubItems } from './_utils/brightspot.js'

const ENDPOINT_BY_KIND = {
  page:  '/api/eventhublive/get-all-live-videos',
  video: '/api/eventhublive/get-all-video-pages',
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })

  const endpoint = ENDPOINT_BY_KIND[req.query?.kind] || ENDPOINT_BY_KIND.page

  const creds = await getTenantBrightspotCreds(session.tenantId)
  if (!creds) {
    return res.status(200).json({ available: false, pages: [], error: 'BrightSpot is not fully configured for this tenant yet' })
  }

  try {
    const { ok, status, body } = await brightspotEventHubFetch(creds, endpoint)
    if (!ok) {
      const detail = typeof body === 'string' ? body : body?.error || JSON.stringify(body)
      return res.status(200).json({ available: false, pages: [], error: `BrightSpot ${status}: ${detail}` })
    }
    return res.status(200).json({ available: true, pages: mapEventHubItems(body) })
  } catch (err) {
    return res.status(200).json({ available: false, pages: [], error: err.message })
  }
}
