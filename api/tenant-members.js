import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite } from './_utils/auth.js'
import { supabase } from './_utils/supabase.js'

// Tenant Admin (or Super Admin acting as this tenant) — manage this tenant's
// members. Cannot see or touch the global Super Admin flag at all — that's
// api/super-admins.js, deliberately separate.
export default async function handler(req, res) {
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('tenant_members')
      .select('user_id, role, created_at')
      .eq('tenant_id', session.tenantId)
    if (error) return res.status(500).json({ error: error.message })

    const ids = data.map(m => m.user_id)
    let emailById = {}
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', ids)
      emailById = Object.fromEntries((profiles || []).map(p => [p.id, p.email]))
    }
    return res.status(200).json({
      members: data.map(m => ({
        userId: m.user_id,
        email: emailById[m.user_id] || null,
        role: m.role,
        createdAt: m.created_at,
      })),
    })
  }

  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'POST') {
    const { email, password, role } = req.body || {}
    if (!email?.trim() || !password || !role) {
      return res.status(400).json({ error: 'email, password, and role are required' })
    }
    if (!['admin', 'read_only'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin or read_only' })
    }

    const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const found = existing?.users?.find(u => u.email?.toLowerCase() === email.trim().toLowerCase())

    let userId
    if (found) {
      userId = found.id
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
      })
      if (createErr) return res.status(400).json({ error: createErr.message })
      userId = created.user.id
    }

    await supabase.from('profiles').upsert(
      { id: userId, email: email.trim() },
      { onConflict: 'id', ignoreDuplicates: true }
    )

    const { error: memberErr } = await supabase
      .from('tenant_members')
      .upsert({ tenant_id: session.tenantId, user_id: userId, role }, { onConflict: 'tenant_id,user_id' })
    if (memberErr) return res.status(400).json({ error: memberErr.message })

    return res.status(201).json({ ok: true, userId })
  }

  if (req.method === 'PATCH') {
    const { userId, role } = req.body || {}
    if (!userId || !['admin', 'read_only'].includes(role)) {
      return res.status(400).json({ error: 'userId and a valid role are required' })
    }
    const { error } = await supabase
      .from('tenant_members')
      .update({ role })
      .eq('tenant_id', session.tenantId)
      .eq('user_id', userId)
    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { userId } = req.body || {}
    if (!userId) return res.status(400).json({ error: 'userId is required' })
    const { error } = await supabase
      .from('tenant_members')
      .delete()
      .eq('tenant_id', session.tenantId)
      .eq('user_id', userId)
    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
