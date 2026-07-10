/**
 * /api/brightspot-proxy
 * POST — auth (tenant admin / Super Admin); proxies a GET request to a
 * BrightSpot CMS endpoint so the browser doesn't hit BrightSpot directly
 * (avoids CORS, keeps the API key off the client's network tab as a bare
 * query param).
 *
 * body: { url, apiKey, endpoint }
 *   url      — BrightSpot host, e.g. https://news9.example.brightspot.cloud
 *   apiKey   — BrightSpot API key
 *   endpoint — path to call, e.g. /api/getAlerts (defaults to /api/getAlerts)
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { url, apiKey, endpoint } = req.body || {}
  if (!url) return res.status(400).json({ error: 'Missing url' })

  let target
  try {
    target = new URL(endpoint || '/api/getAlerts', url)
  } catch {
    return res.status(400).json({ error: 'Invalid url' })
  }
  if (apiKey) target.searchParams.set('api-key', apiKey)

  try {
    const upstream = await fetch(target.toString(), { headers: { Accept: 'application/json' } })
    const text = await upstream.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }

    return res.status(200).json({
      ok: upstream.ok,
      status: upstream.status,
      body,
    })
  } catch (err) {
    console.error('[brightspot-proxy]', err)
    return res.status(502).json({ ok: false, error: err.message })
  }
}
