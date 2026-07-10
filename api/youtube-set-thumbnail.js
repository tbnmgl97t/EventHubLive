/**
 * POST /api/youtube-set-thumbnail
 * Body: { broadcast_id, thumbnail_base64, thumbnail_mime }
 *
 * Uploads a thumbnail image to a YouTube broadcast.
 * thumbnail_base64: base64-encoded image (no data: prefix)
 * thumbnail_mime:   'image/jpeg' | 'image/png'
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'
import { refreshAccessToken }   from './_utils/youtube.js'

// jw_stream_id is optional — if provided, updates thumbnail_set in Supabase

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { broadcast_id, jw_stream_id, thumbnail_base64, thumbnail_mime = 'image/jpeg' } = req.body || {}
  if (!broadcast_id)     return res.status(400).json({ error: 'broadcast_id is required' })
  if (!thumbnail_base64) return res.status(400).json({ error: 'thumbnail_base64 is required' })

  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('youtube_refresh_token')
      .eq('id', session.tenantId)
      .single()

    if (!tenant?.youtube_refresh_token) {
      return res.status(400).json({ error: 'YouTube account not connected' })
    }

    const { access_token } = await refreshAccessToken(tenant.youtube_refresh_token)

    // Decode base64 → binary buffer
    const imageBuffer = Buffer.from(thumbnail_base64, 'base64')

    const r = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(broadcast_id)}&uploadType=media`,
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${access_token}`,
          'Content-Type': thumbnail_mime,
          'Content-Length': String(imageBuffer.byteLength),
        },
        body: imageBuffer,
      }
    )

    const text = await r.text()
    if (!r.ok) {
      console.error('[youtube-set-thumbnail]', r.status, text)
      return res.status(r.status).json({ error: `YouTube API ${r.status}`, detail: text })
    }

    // Mark thumbnail as set in Supabase if we know the JW stream ID
    if (jw_stream_id) {
      await supabase
        .from('youtube_streams')
        .update({ thumbnail_set: true })
        .eq('jw_stream_id', jw_stream_id)
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[youtube-set-thumbnail]', err)
    return res.status(500).json({ error: err.message })
  }
}
