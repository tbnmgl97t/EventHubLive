/**
 * GET /api/brightspot-search-pages?q=<term>&kind=page|video
 *
 * Search BrightSpot for pages to assign to an encoder (Encoder Page /
 * Encoder Video Page). Backs the search dropdown in EncoderForm.
 *
 * STATUS: BrightSpot's REST Management API currently rejects every request
 * from this tenant's client with "Insufficient client permissions" (confirmed
 * not an IP/hostname/format issue — see api/_utils/brightspot.js). Until
 * that's resolved, this endpoint always returns `available: false` so the
 * frontend can fall back to manual entry instead of erroring.
 *
 * The exact query syntax for text search + type filtering below is a
 * best-effort guess (BrightSpot doesn't publicly document it) — needs
 * verifying against a real response once permissions are sorted out.
 */

import { resolveTenantSession, getTenantBrightspotCreds } from './_utils/tenant.js'
import { brightspotCmaFetch } from './_utils/brightspot.js'

function mapItem(item) {
  return {
    id:   item._id || item.id || item['cms.content._id'] || null,
    name: item['cms.content.searchTitle'] || item.name || item.title || item.label || null,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })

  const q = (req.query?.q || '').trim()
  if (!q) return res.status(200).json({ available: true, pages: [] })

  const creds = await getTenantBrightspotCreds(session.tenantId)
  if (!creds) {
    return res.status(200).json({ available: false, pages: [], error: 'BrightSpot is not fully configured for this tenant yet (missing Client ID)' })
  }

  try {
    const { ok, status, body } = await brightspotCmaFetch(
      creds,
      `/api/rest/cma/contents?query=${encodeURIComponent(q)}&limit=20`
    )
    if (!ok) {
      const detail = typeof body === 'string' ? body : body?.result || JSON.stringify(body)
      return res.status(200).json({ available: false, pages: [], error: `BrightSpot ${status}: ${detail}` })
    }
    const items = body?.result?.items || body?.items || (Array.isArray(body?.result) ? body.result : [])
    const pages = items.map(mapItem).filter(p => p.id)
    return res.status(200).json({ available: true, pages })
  } catch (err) {
    return res.status(200).json({ available: false, pages: [], error: err.message })
  }
}
