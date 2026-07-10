/**
 * DELETE /api/delete-ingest-point
 * Body: { id }
 *
 * Deletes a JW static ingest point.
 * JW returns 204 on success.
 */

import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'
import { canWrite } from './_utils/auth.js'
import { supabase } from './_utils/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { id } = req.body || {}
  if (!id) return res.status(400).json({ error: 'id is required' })

  const jw = await getTenantJwCreds(session.tenantId)
  if (!jw) return res.status(400).json({ error: 'JW Player is not configured for this tenant yet' })

  const { data: owned } = await supabase
    .from('ingest_points')
    .select('id')
    .eq('jw_ingest_id', id)
    .eq('tenant_id', session.tenantId)
    .single()
  if (!owned) return res.status(403).json({ error: 'Ingest point does not belong to this tenant' })

  try {
    const r = await fetch(
      `https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/ingest/${encodeURIComponent(id)}/`,
      {
        method:  'DELETE',
        headers: { Authorization: jw.apiSecret, Accept: 'application/json' },
      }
    )

    if (!r.ok) {
      const body = await r.text()
      return res.status(r.status).json({ error: `JW API error ${r.status}`, detail: body })
    }

    try {
      await supabase.from('ingest_points').delete().eq('jw_ingest_id', id)
    } catch (_) { /* non-fatal */ }

    return res.status(200).json({ ok: true, id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
