import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'

export default async function handler(req, res) {
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }

  if (req.method === 'GET') {
    const encoderId = req.query?.encoder_id
    let query = supabase
      .from('broadcast_history')
      .select('*')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (encoderId) query = query.eq('encoder_id', encoderId)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ history: data || [] })
  }

  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'POST') {
    const { encoder_id, title, started_at, ended_at, destinations } = req.body || {}
    if (!encoder_id) return res.status(400).json({ error: 'encoder_id is required' })

    const { data, error } = await supabase
      .from('broadcast_history')
      .insert({
        encoder_id,
        tenant_id: session.tenantId,
        title: title || null,
        started_at: started_at || null,
        ended_at: ended_at || null,
        destinations: destinations || [],
      })
      .select()
      .single()
    if (error) return res.status(400).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).end()
}
