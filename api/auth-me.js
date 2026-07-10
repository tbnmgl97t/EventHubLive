import { verifyToken } from './_utils/auth.js'
import { supabase } from './_utils/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await verifyToken(req.headers.authorization)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  if (session.isSuperAdmin) {
    const { data: tenants, error } = await supabase.from('tenants').select('id, slug, title').order('title')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({
      email: session.email,
      isSuperAdmin: true,
      tenants: (tenants || []).map(t => ({ id: t.id, slug: t.slug, name: t.title, role: 'admin' })),
    })
  }

  const { data: memberships, error } = await supabase
    .from('tenant_members')
    .select('role, tenants ( id, slug, title )')
    .eq('user_id', session.id)
  if (error) return res.status(500).json({ error: error.message })

  const tenants = (memberships || [])
    .filter(m => m.tenants)
    .map(m => ({ id: m.tenants.id, slug: m.tenants.slug, name: m.tenants.title, role: m.role }))

  return res.status(200).json({ email: session.email, isSuperAdmin: false, tenants })
}
