/**
 * /api/tenant
 * GET — public;  returns current tenant config
 * PUT — auth;    partial update
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'

const DEFAULT_TENANT = {
  id:         'default',
  title:      'EventHub Live',
  subtitle:   null,
  logo_url:   null,
  timezone:   'America/New_York',
  colors:     { primary: '#e65d2c', secondary: '#0a205a', background: '#0a0f1e', paper: '#111827' },
  components: {},
}

async function readTenant(tenantId = 'default') {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()
    if (error || !data) return { ...DEFAULT_TENANT, id: tenantId }
    return {
      ...DEFAULT_TENANT,
      ...data,
      colors:     { ...DEFAULT_TENANT.colors,     ...(data.colors     || {}) },
      components: { ...DEFAULT_TENANT.components, ...(data.components || {}) },
    }
  } catch {
    return { ...DEFAULT_TENANT, id: tenantId }
  }
}

// Fields safe to expose to unauthenticated viewers (this endpoint is public —
// it backs the branding fetch on the public-facing player page). Everything
// else on the tenants row (JW/YouTube/Facebook credentials and tokens) must
// never appear here.
const PUBLIC_FIELDS = ['id', 'slug', 'title', 'subtitle', 'logo_url', 'timezone', 'colors', 'components']

function toPublicTenant(tenant) {
  return Object.fromEntries(PUBLIC_FIELDS.map(k => [k, tenant[k]]))
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const tenantId = req.headers['x-tenant-id'] || 'default'
    const tenant = await readTenant(tenantId)
    const publicTenant = toPublicTenant(tenant)

    // Callers authenticated as this tenant's own admin (or a Super Admin)
    // additionally get the JW credentials — still never exposed to anonymous
    // viewers, since this same endpoint backs the public branding fetch.
    const session = await resolveTenantSession(req)
    if (session?.tenantId === tenantId && canWrite(session)) {
      publicTenant.jw_site_id    = tenant.jw_site_id    || null
      publicTenant.jw_api_secret = tenant.jw_api_secret || null
      publicTenant.brightspot_cms_url   = tenant.brightspot_cms_url   || null
      publicTenant.brightspot_site_url  = tenant.brightspot_site_url  || null
      publicTenant.brightspot_api_key   = tenant.brightspot_api_key   || null
    }

    return res.status(200).json(publicTenant)
  }

  if (req.method === 'PUT') {
    const session = await resolveTenantSession(req)
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    if (!session.tenantId || !canWrite(session)) return res.status(403).json({ error: 'Forbidden' })
    try {
      const current = await readTenant(session.tenantId)
      const body    = req.body || {}
      const updated = {
        ...current,
        ...body,
        colors:     { ...current.colors,     ...(body.colors     || {}) },
        components: { ...current.components, ...(body.components || {}) },
      }
      const { error } = await supabase
        .from('tenants')
        .upsert({ id: session.tenantId, ...updated })
      if (error) throw error
      return res.status(200).json(updated)
    } catch (err) {
      console.error('[tenant]', err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).end()
}
