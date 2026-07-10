import { verifyToken, isSuperAdmin } from './_utils/auth.js'
import { supabase } from './_utils/supabase.js'

// Super Admin only, global — grant/revoke the platform-wide Super Admin flag.
// Deliberately separate from tenant-members.js so tenant Admins have no path here.
export default async function handler(req, res) {
  const session = await verifyToken(req.headers.authorization)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, created_at')
      .eq('is_super_admin', true)
      .order('created_at')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ superAdmins: data })
  }

  if (req.method === 'POST') {
    const { email, password } = req.body || {}
    if (!email?.trim()) return res.status(400).json({ error: 'email is required' })

    const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const found = existing?.users?.find(u => u.email?.toLowerCase() === email.trim().toLowerCase())

    let userId
    if (found) {
      userId = found.id
    } else {
      if (!password) return res.status(400).json({ error: 'password is required to create a new user' })
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
      })
      if (createErr) return res.status(400).json({ error: createErr.message })
      userId = created.user.id
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, email: email.trim(), is_super_admin: true }, { onConflict: 'id' })
    if (error) return res.status(400).json({ error: error.message })

    return res.status(201).json({ ok: true, userId })
  }

  if (req.method === 'DELETE') {
    const { userId } = req.body || {}
    if (!userId) return res.status(400).json({ error: 'userId is required' })
    if (userId === session.id) return res.status(400).json({ error: "You can't revoke your own Super Admin access" })

    const { error } = await supabase.from('profiles').update({ is_super_admin: false }).eq('id', userId)
    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
