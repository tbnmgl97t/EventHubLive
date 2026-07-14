import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'
import { jwFetch, sleep } from './_utils/jw.js'

// The formats a static ingest point can be provisioned for — used by the
// `all=1` mode below, which merges every format into one response so the
// frontend doesn't have to fan out 4 parallel requests of its own (that
// fan-out is what was tripping JW's 60/min rate limit).
const ALL_FORMATS = ['rtmp', 'srt', 'rtp', 'rtp_fec']
// Gap between each sequential JW call in `all=1` mode — spaces out the burst
// rather than firing all 4 at once.
const SEQUENTIAL_GAP_MS = 250

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

  const start_date = req.query?.start_date || ''
  const end_date   = req.query?.end_date   || ''

  // JW expects dates without milliseconds — strip them if present
  const fmtDate = iso => iso ? iso.replace(/\.\d+Z$/, 'Z').replace(/\+00:00$/, 'Z') : ''

  async function fetchFormat(ingest_format) {
    let url =
      `https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/ingest/availability/` +
      `?ingest_format=${encodeURIComponent(ingest_format)}&page=1&page_length=50`
    if (start_date) url += `&start_date=${encodeURIComponent(fmtDate(start_date))}`
    if (end_date)   url += `&end_date=${encodeURIComponent(fmtDate(end_date))}`

    const r = await jwFetch(jw, url)
    const body = await r.text()
    console.log('[ingest-points]', ingest_format, 'status:', r.status, 'body:', body.slice(0, 500))
    if (!r.ok) throw Object.assign(new Error(`JW API error ${r.status}`), { status: r.status, detail: body })

    const data = JSON.parse(body)
    const raw = data.ingests || []
    return raw.map(normalise).filter(p => p.id)
  }

  try {
    // `all=1` merges every format into one response via sequential (not
    // parallel) JW calls, so one panel mount costs a spaced-out trickle of
    // requests instead of a 4-way burst.
    if (req.query?.all === '1') {
      const seen = new Set()
      const ingest_points = []
      for (let i = 0; i < ALL_FORMATS.length; i++) {
        const pts = await fetchFormat(ALL_FORMATS[i])
        for (const p of pts) {
          if (seen.has(p.id)) continue
          seen.add(p.id)
          ingest_points.push(p)
        }
        if (i < ALL_FORMATS.length - 1) await sleep(SEQUENTIAL_GAP_MS)
      }
      ingest_points.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      return res.status(200).json({ ingest_points })
    }

    const ingest_points = await fetchFormat(req.query?.ingest_format || 'rtmp')
    return res.status(200).json({ ingest_points })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, detail: err.detail })
    return res.status(500).json({ error: err.message })
  }
}
