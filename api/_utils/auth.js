import { supabase } from './supabase.js'

export const ROLES = {
  SUPER_ADMIN: 'super_admin', // global — Trilogy Digital agency staff, not tenant-scoped
  ADMIN:       'admin',       // per-tenant
  READ_ONLY:   'read_only',   // per-tenant
}

/**
 * Verifies a Supabase Auth bearer token and returns the caller's identity.
 * Returns { id, email, isSuperAdmin } or null if the token is missing/invalid.
 */
export async function verifyToken(authHeader) {
  const jwt = (authHeader || '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null

  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data?.user) {
    console.error('[verifyToken] getUser failed:', error?.message, error?.status, 'jwt length:', jwt.length)
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', data.user.id)
    .single()

  return {
    id: data.user.id,
    email: data.user.email,
    isSuperAdmin: !!profile?.is_super_admin,
  }
}

/** True if the resolved session can write in whatever tenant it's scoped to. */
export function canWrite(session) {
  return !!session && (session.isSuperAdmin || session.tenantRole === ROLES.ADMIN)
}

/** True if the resolved session is a Trilogy Digital (global) Super Admin. */
export function isSuperAdmin(session) {
  return !!session?.isSuperAdmin
}
