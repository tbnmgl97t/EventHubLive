/**
 * /api/media-renditions?id={mediaId}
 *
 * Uses the JW delivery API to find the best downloadable MP4 for a media item.
 * Prefers 1080p, falls back to highest resolution available.
 *
 * GET — requires admin auth
 */

import { resolveTenantSession } from './_utils/tenant.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id is required' })

  try {
    const r = await fetch(`https://cdn.jwplayer.com/v2/media/${id}`, {
      headers: { Accept: 'application/json' },
    })

    if (!r.ok) {
      return res.status(r.status).json({ error: `JW delivery API error ${r.status}` })
    }

    const data = await r.json()
    const sources = data?.playlist?.[0]?.sources || []

    // Filter to MP4 video sources with a file URL
    const mp4s = sources.filter(
      s => s.type === 'video/mp4' && s.file && s.height
    )

    if (!mp4s.length) {
      return res.status(200).json({ url: null, status: 'not_ready' })
    }

    // Prefer 1080p, otherwise highest resolution
    const preferred = mp4s.find(s => s.height === 1080)
      || mp4s.sort((a, b) => b.height - a.height)[0]

    return res.status(200).json({
      url:      preferred.file,
      height:   preferred.height,
      label:    preferred.label || `${preferred.height}p`,
      filesize: preferred.filesize || null,
      status:   'ready',
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
