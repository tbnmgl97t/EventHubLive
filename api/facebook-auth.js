/**
 * GET /api/facebook-auth
 * Redirects the browser to Facebook's OAuth consent screen.
 * After approval Facebook redirects to /api/facebook-callback.
 *
 * Required Meta app permissions (request in Meta App Dashboard → App Review):
 *   - pages_manage_posts   — create live videos on a Page
 *   - pages_read_engagement — read Page data / verify connection
 *   - pages_show_list       — list Pages the user manages
 */

import { createHmac, randomBytes } from 'crypto'
import { resolveTenantSession, resolveTicketSession } from './_utils/tenant.js'
import { canWrite }                from './_utils/auth.js'

const SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
].join(',')

// Signed `state` param: carries the tenant id (+ a CSRF nonce) through the
// OAuth round trip so facebook-callback.js knows which tenant row to update,
// and can trust that the request wasn't forged/tampered with in transit.
function signState(tenantId) {
  const payload = Buffer.from(JSON.stringify({
    tenantId,
    nonce: randomBytes(16).toString('hex'),
  })).toString('base64url')
  const signature = createHmac('sha256', process.env.ADMIN_SECRET || 'fallback')
    .update(payload)
    .digest('hex')
  return `${payload}.${signature}`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Reached via a full-page browser navigation, which can't carry custom
  // headers — so a signed ticket (minted by /api/oauth-ticket) stands in for
  // the Authorization/X-Tenant-Id headers resolveTenantSession expects.
  const session = req.query.ticket
    ? resolveTicketSession(req.query.ticket)
    : await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !canWrite(session)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const APP_ID       = process.env.FACEBOOK_APP_ID
  const REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI

  if (!APP_ID || !REDIRECT_URI) {
    return res.status(500).json({
      error: 'Facebook OAuth not configured. Check FACEBOOK_APP_ID and FACEBOOK_REDIRECT_URI env vars.',
    })
  }

  const params = new URLSearchParams({
    client_id:     APP_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    state:         signState(session.tenantId),
  })

  return res.redirect(`https://www.facebook.com/v18.0/dialog/oauth?${params}`)
}
