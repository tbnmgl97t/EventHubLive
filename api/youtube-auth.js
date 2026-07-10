/**
 * GET /api/youtube-auth
 * Redirects the browser to Google's OAuth consent screen.
 * After approval Google redirects to /api/youtube-callback.
 */

import { createHmac, randomBytes } from 'crypto'
import { resolveTenantSession, resolveTicketSession } from './_utils/tenant.js'
import { canWrite }                from './_utils/auth.js'

const SCOPES = [
  'https://www.googleapis.com/auth/youtube',           // Manage your YouTube account (required for Live API)
  'https://www.googleapis.com/auth/youtube.force-ssl', // Manage videos, ratings, comments (belt + suspenders)
].join(' ')

// Signed `state` param: carries the tenant id (+ a CSRF nonce) through the
// OAuth round trip so youtube-callback.js knows which tenant row to update,
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

  const CLIENT_ID    = process.env.YOUTUBE_CLIENT_ID
  const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI

  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).json({ error: 'YouTube OAuth not configured. Check YOUTUBE_CLIENT_ID and YOUTUBE_REDIRECT_URI env vars.' })
  }

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',   // required to get a refresh token
    prompt:        'consent',   // force re-consent so we always get a refresh token
    state:         signState(session.tenantId),
  })

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
