import { createHmac, timingSafeEqual } from 'crypto'
import { verifyToken } from './auth.js'
import { supabase } from './supabase.js'

const OAUTH_TICKET_TTL_MS = 2 * 60 * 1000 // 2 minutes — just long enough to cover the redirect

/**
 * Resolves the caller's identity plus their role within the tenant named by
 * the X-Tenant-Id request header. Super Admins are treated as 'admin' in any
 * tenant they act as (they're not members of tenant_members rows).
 *
 * Returns null if the bearer token itself is invalid/missing. Otherwise
 * returns { id, email, isSuperAdmin, tenantId, tenantRole } — tenantRole is
 * null if the header is missing or the caller isn't a member of that tenant;
 * callers must check for that before proceeding.
 */
export async function resolveTenantSession(req) {
  const session = await verifyToken(req.headers.authorization)
  if (!session) return null

  const tenantId = req.headers['x-tenant-id'] || null
  if (!tenantId) return { ...session, tenantId: null, tenantRole: null }

  if (session.isSuperAdmin) {
    return { ...session, tenantId, tenantRole: 'admin' }
  }

  const { data: member } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', session.id)
    .single()

  return { ...session, tenantId, tenantRole: member?.role || null }
}

/**
 * Mints a short-lived signed ticket carrying a resolved tenant session.
 *
 * Full-page browser navigations (plain <a href>) can't attach an
 * Authorization or X-Tenant-Id header, so endpoints that must be reached via
 * navigation (e.g. the OAuth kickoff redirects) accept this ticket as a
 * `?ticket=` query param instead. The frontend mints it up front with an
 * authenticated fetch (which *can* send those headers), then navigates with
 * the ticket attached.
 */
export function mintOAuthTicket(session) {
  const payload = Buffer.from(JSON.stringify({
    id: session.id,
    isSuperAdmin: !!session.isSuperAdmin,
    tenantId: session.tenantId,
    tenantRole: session.tenantRole,
    exp: OAUTH_TICKET_TTL_MS, // relative to iat, filled in below
    iat: Date.now(),
  })).toString('base64url')
  const signature = createHmac('sha256', process.env.ADMIN_SECRET || 'fallback')
    .update(payload)
    .digest('hex')
  return `${payload}.${signature}`
}

/** Verifies and decodes an OAuth ticket minted by mintOAuthTicket. Returns a session-shaped object, or null if missing/invalid/expired. */
export function resolveTicketSession(ticket) {
  if (!ticket || typeof ticket !== 'string') return null

  const dotIndex = ticket.lastIndexOf('.')
  if (dotIndex === -1) return null
  const payload   = ticket.slice(0, dotIndex)
  const signature = ticket.slice(dotIndex + 1)

  const expected = createHmac('sha256', process.env.ADMIN_SECRET || 'fallback')
    .update(payload)
    .digest('hex')
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!decoded?.tenantId || !decoded?.iat || !decoded?.exp) return null
    if (Date.now() > decoded.iat + decoded.exp) return null
    return {
      id: decoded.id,
      isSuperAdmin: decoded.isSuperAdmin,
      tenantId: decoded.tenantId,
      tenantRole: decoded.tenantRole,
    }
  } catch {
    return null
  }
}

/** Fetches a tenant's JW Player credentials, or null if not configured yet. */
export async function getTenantJwCreds(tenantId) {
  const { data } = await supabase
    .from('tenants')
    .select('jw_site_id, jw_api_secret')
    .eq('id', tenantId)
    .single()
  if (!data?.jw_site_id || !data?.jw_api_secret) return null
  return { siteId: data.jw_site_id, apiSecret: data.jw_api_secret }
}

/** Fetches a tenant's BrightSpot credentials, or null if not fully configured yet. */
export async function getTenantBrightspotCreds(tenantId) {
  const { data } = await supabase
    .from('tenants')
    .select('brightspot_cms_url, brightspot_site_url, brightspot_api_key, brightspot_client_id')
    .eq('id', tenantId)
    .single()
  if (!data?.brightspot_client_id || !data?.brightspot_api_key || !(data?.brightspot_site_url || data?.brightspot_cms_url)) return null
  return {
    cmsUrl:    data.brightspot_cms_url  || null,
    siteUrl:   data.brightspot_site_url || null,
    apiKey:    data.brightspot_api_key,
    clientId:  data.brightspot_client_id,
  }
}
