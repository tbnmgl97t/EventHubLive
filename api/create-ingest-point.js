/**
 * POST /api/create-ingest-point
 * Body: { name, ingest_format }
 *
 * Creates a new JW static ingest point.
 * Supported formats: rtmp, srt, rtp, rtp_fec
 */

import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'
import { canWrite } from './_utils/auth.js'
import { supabase } from './_utils/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { name, ingest_format } = req.body || {}

  if (!name?.trim())    return res.status(400).json({ error: 'name is required' })
  if (!ingest_format)   return res.status(400).json({ error: 'ingest_format is required' })

  const ALLOWED_FORMATS = ['rtmp', 'srt', 'rtp', 'rtp_fec']
  if (!ALLOWED_FORMATS.includes(ingest_format)) {
    return res.status(400).json({ error: `ingest_format must be one of: ${ALLOWED_FORMATS.join(', ')}` })
  }

  const jw = await getTenantJwCreds(session.tenantId)
  if (!jw) return res.status(400).json({ error: 'JW Player is not configured for this tenant yet' })

  try {
    const r = await fetch(
      `https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/ingest/`,
      {
        method: 'POST',
        headers: {
          Authorization:  jw.apiSecret,
          'Content-Type': 'application/json',
          Accept:         'application/json',
        },
        body: JSON.stringify({
          display_name:  name.trim(),
          ingest_format,
        }),
      }
    )

    const body = await r.text()
    if (!r.ok) {
      return res.status(r.status).json({ error: `JW API error ${r.status}`, detail: body })
    }

    const data = JSON.parse(body)

    // Register ingest point ownership in Supabase — used by delete-ingest-point
    // as a defense-in-depth tenant check, since ingest points aren't otherwise
    // correlated to a tenant anywhere.
    if (data.id) {
      try {
        await supabase.from('ingest_points').upsert({
          tenant_id:    session.tenantId,
          jw_ingest_id: data.id,
          name:         data.display_name  || data.metadata?.display_name  || name.trim(),
          format:       data.ingest_format || data.metadata?.ingest_format || ingest_format,
        }, { onConflict: 'jw_ingest_id' })
      } catch (_) { /* non-fatal */ }
    }

    return res.status(201).json({
      id:     data.id,
      name:   data.display_name  || data.metadata?.display_name  || name.trim(),
      format: data.ingest_format || data.metadata?.ingest_format || ingest_format,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
