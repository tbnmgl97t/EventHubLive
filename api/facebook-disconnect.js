/**
 * DELETE /api/facebook-disconnect
 * Clears all Facebook credentials from the tenant row.
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end()

  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  try {
    const { error } = await supabase.from('tenants').update({
      facebook_page_access_token: null,
      facebook_page_id:           null,
      facebook_page_name:         null,
      facebook_page_picture:      null,
    }).eq('id', session.tenantId)

    if (error) throw error
    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
