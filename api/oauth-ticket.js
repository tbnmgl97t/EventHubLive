/**
 * GET /api/oauth-ticket
 * Mints a short-lived signed ticket for the caller's current tenant session.
 *
 * The YouTube/Facebook "Connect" buttons need to reach /api/youtube-auth and
 * /api/facebook-auth via a full-page browser navigation (so those endpoints
 * can in turn redirect to Google/Facebook's consent screen), but a plain
 * navigation can't carry the Authorization/X-Tenant-Id headers those
 * endpoints would otherwise need. This endpoint is called first via a normal
 * authenticated fetch, and returns a ticket that's then passed as a query
 * param on the navigation instead.
 */

import { resolveTenantSession, mintOAuthTicket } from './_utils/tenant.js'
import { canWrite } from './_utils/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !canWrite(session)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  return res.status(200).json({ ticket: mintOAuthTicket(session) })
}
