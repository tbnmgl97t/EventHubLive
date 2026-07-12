import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'

// Push formats (rtmp, srt, ...) nest credentials under `ingest_point.{url,key}`.
// Pull formats (hls_pull, srt_pull, ...) have no key — JW pulls *from* a source
// URL nested under `source_url.{url}` instead of accepting a push.
function extractIngestPoint(fmtMeta) {
  return fmtMeta?.ingest_point || fmtMeta?.source_url || null
}

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
    // Check whatever formats JW actually sent back (not a fixed whitelist) —
    // e.g. zixi_push shows up on some streams and isn't one we've special-cased.
    const availableFormats = Object.keys(ingestMeta)
    const orderedFormats = preferredFormat
      ? [preferredFormat, ...availableFormats.filter(f => f !== preferredFormat)]
      : availableFormats

    let ingestFormat = null
    let ingestPoint  = null
    for (const fmt of orderedFormats) {
      const point = extractIngestPoint(ingestMeta[fmt])
      if (point?.url || point?.key) {
        ingestFormat = fmt
        ingestPoint  = point
        break
      }
    }

    if (!ingestPoint) {
      // The rtmp shape (metadata.ingest.<format>.ingest_point.{url,key}) may not
      // hold for every format — log what JW actually sent so this is diagnosable
      // without guessing again.
      console.log('[stream-ingest] no ingest_point found for', id, 'preferredFormat:', preferredFormat, 'metadata.ingest:', JSON.stringify(ch.metadata?.ingest))
    }

    return res.status(200).json({
      ingest_url:    ingestPoint?.url || null,
      ingest_key:    ingestPoint?.key || null,
      ingest_format: ingestFormat,
      ...(ingestPoint ? {} : { debug_ingest_metadata: ch.metadata?.ingest || null }),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
