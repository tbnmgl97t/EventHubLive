/**
 * DELETE /api/delete-vod-media
 * Deletes a VOD media asset from JW Platform without touching the live channel record.
 * Body: { media_id: string }
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

  const { media_id } = req.body || {}
  if (!media_id) return res.status(400).json({ error: 'media_id is required' })

  const jw = await getTenantJwCreds(session.tenantId)
  if (!jw) return res.status(400).json({ error: 'JW Player is not configured for this tenant yet' })

  // Defense-in-depth: vod_media is backfilled by GET /api/channels the first
  // time it observes an asset under the caller's own tenant. Assets that
  // predate that backfill, or that no tenant has polled channels for yet,
  // won't have a row and will 403 here — see supabase/schema.sql.
  const { data: owned } = await supabase
    .from('vod_media')
    .select('id')
    .eq('jw_media_id', media_id)
    .eq('tenant_id', session.tenantId)
    .single()
  if (!owned) return res.status(403).json({ error: 'VOD asset does not belong to this tenant' })

  try {
    const r = await fetch(
      `https://api.jwplayer.com/v2/sites/${jw.siteId}/media/${media_id}/`,
      {
        method: 'DELETE',
        headers: {
          Authorization: jw.apiSecret,
          Accept: 'application/json',
        },
      }
    )

    // 404 means it's already gone — treat as success
    if (!r.ok && r.status !== 404) {
      const body = await r.text()
      return res.status(r.status).json({ error: `JW API error ${r.status}`, detail: body })
    }

    try {
      await supabase.from('vod_media').delete().eq('jw_media_id', media_id)
    } catch (_) { /* non-fatal */ }

    return res.status(200).json({ ok: true, media_id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
