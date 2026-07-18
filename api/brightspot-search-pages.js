/**
 * GET /api/brightspot-search-pages?q=<term>&kind=page|video
 *
 * Search BrightSpot for pages to assign to an encoder (Encoder Page /
 * Encoder Video Page). Backs the search dropdown in EncoderForm.
 *
 * Backed by BrightSpot's custom EventHubLive endpoints on the tenant's own
 * CMS host, which return the tenant's full list rather than accepting a
 * search term — so this endpoint fetches that list and filters it by `q`
 * itself to give the frontend autocomplete-style suggestions:
 *   kind=page  -> GET {cmsUrl}/eventhublive/get-all-live-videos  (Encoder Page)
 *   kind=video -> GET {cmsUrl}/eventhublive/get-all-video-pages  (Encoder Video Page)
 */

import { resolveTenantSession, getTenantBrightspotCreds } from './_utils/tenant.js'
import { brightspotEventHubFetch, mapEventHubItems } from './_utils/brightspot.js'

const ENDPOINT_BY_KIND = {
  page:  '/eventhublive/get-all-live-videos',
  video: '/eventhublive/get-all-video-pages',
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })

  const q = (req.query?.q || '').trim()
  if (!q) return res.status(200).json({ available: true, pages: [] })

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
    const qLower = q.toLowerCase()
    const pages = mapEventHubItems(body).filter(p => p.name.toLowerCase().includes(qLower))
    return res.status(200).json({ available: true, pages })
  } catch (err) {
    return res.status(200).json({ available: false, pages: [], error: err.message })
  }
}
