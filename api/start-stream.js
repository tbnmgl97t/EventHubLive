import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'
import { canWrite } from './_utils/auth.js'
import { supabase } from './_utils/supabase.js'

/**
 * POST /api/start-stream
 * Body: { id }
 *
 * Sends a go-live signal to a 24/7 broadcast stream.
 * Only valid for stream_type = '24/7' channels in idle state.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { id } = req.body || {}
  if (!id) return res.status(400).json({ error: 'id is required' })

  const jw = await getTenantJwCreds(session.tenantId)
  if (!jw) return res.status(400).json({ error: 'JW Player is not configured for this tenant yet' })

  const { data: owned } = await supabase
    .from('streams')
    .select('id')
    .eq('jw_stream_id', id)
    .eq('tenant_id', session.tenantId)
    .single()
  if (!owned) return res.status(403).json({ error: 'Stream does not belong to this tenant' })

  const url = `https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/streams/${id}/start/`
  console.log('[start-stream] PUT', url)

  try {
    const r = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization:  jw.apiSecret,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify({}),
    })

    const text = await r.text()
    console.log('[start-stream] JW response', r.status, text.slice(0, 300))

    if (!r.ok) {
      return res.status(r.status).json({
        error:   `JW API error ${r.status}`,
        detail:  text,
        url_hit: url,
        site_id: jw.siteId,
      })
    }

    return res.status(200).json({ ok: true, id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
