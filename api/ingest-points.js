import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'

function normalise(p) {
  return {
    id:        p.id,
    name:      p.metadata?.display_name || p.id,
    available: p.metadata?.availability_status === 'available',
    format:    p.metadata?.ingest_format || null,
    attached:  p.metadata?.attached_stream_id || null,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })

  const jw = await getTenantJwCreds(session.tenantId)
  if (!jw) return res.status(400).json({ error: 'JW Player is not configured for this tenant yet' })

  const ingest_format = req.query?.ingest_format || 'rtmp'
  const start_date    = req.query?.start_date || ''
  const end_date      = req.query?.end_date   || ''

  // JW expects dates without milliseconds — strip them if present
  const fmtDate = iso => iso ? iso.replace(/\.\d+Z$/, 'Z').replace(/\+00:00$/, 'Z') : ''

  try {
    let url =
      `https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/ingest/availability/` +
      `?ingest_format=${encodeURIComponent(ingest_format)}&page=1&page_length=50`
    if (start_date) url += `&start_date=${encodeURIComponent(fmtDate(start_date))}`
    if (end_date)   url += `&end_date=${encodeURIComponent(fmtDate(end_date))}`

    const r = await fetch(url, {
      headers: {
        Authorization: jw.apiSecret,
        Accept: 'application/json',
      },
    })

    const body = await r.text()
    console.log('[ingest-points] status:', r.status, 'body:', body.slice(0, 500))

    if (!r.ok) {
      return res.status(r.status).json({ error: `JW API error ${r.status}`, detail: body })
    }

    const data = JSON.parse(body)
    const raw = data.ingests || []
    const ingest_points = raw.map(normalise).filter(p => p.id)

    return res.status(200).json({ ingest_points })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
