import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'

// Same set EncoderForm.jsx offers for "Ingest Format" — checked in order,
// preferring whichever format the stream actually reports first.
const INGEST_FORMATS = ['rtmp', 'rtmps', 'srt', 'srt_pull', 'hls', 'hls_pull', 'rtp', 'rtp_fec']

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  const jw = await getTenantJwCreds(session.tenantId)
  if (!jw) return res.status(400).json({ error: 'JW Player is not configured for this tenant yet' })

  try {
    const url = `https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/streams/${encodeURIComponent(id)}/`
    const r = await fetch(url, { headers: { Authorization: jw.apiSecret, Accept: 'application/json' } })
    const body = await r.text()

    if (!r.ok) {
      return res.status(502).json({ error: `JW API error ${r.status}`, detail: body })
    }

    const ch = JSON.parse(body)
    const ingestMeta = ch.metadata?.ingest || {}
    const preferredFormat = ch.ingest_format || ch.metadata?.ingest_format
    const orderedFormats = preferredFormat
      ? [preferredFormat, ...INGEST_FORMATS.filter(f => f !== preferredFormat)]
      : INGEST_FORMATS

    let ingestFormat = null
    let ingestPoint  = null
    for (const fmt of orderedFormats) {
      const point = ingestMeta[fmt]?.ingest_point
      if (point?.url || point?.key) {
        ingestFormat = fmt
        ingestPoint  = point
        break
      }
    }

    return res.status(200).json({
      ingest_url:    ingestPoint?.url || null,
      ingest_key:    ingestPoint?.key || null,
      ingest_format: ingestFormat,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
