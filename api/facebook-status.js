/**
 * GET /api/facebook-status
 * Returns the current Facebook Page connection status.
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { supabase }             from './_utils/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }

  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('facebook_page_access_token, facebook_page_id, facebook_page_name, facebook_page_picture')
      .eq('id', session.tenantId)
      .single()

    const connected = !!tenant?.facebook_page_access_token

    return res.status(200).json({
      connected,
      page_id:      tenant?.facebook_page_id      || null,
      page_name:    tenant?.facebook_page_name     || null,
      page_picture: tenant?.facebook_page_picture  || null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
