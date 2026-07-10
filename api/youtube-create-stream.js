/**
 * POST /api/youtube-create-stream
 * Creates a YouTube Live Broadcast + Stream and binds them.
 * Returns the RTMP ingest URL and stream key for use in JW additional_outputs.
 *
 * Body: { title, start_time_utc, end_time_utc? }
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'
import { youtubeRequest }       from './_utils/youtube.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { title, start_time_utc, end_time_utc } = req.body || {}
  if (!title || !start_time_utc) {
    return res.status(400).json({ error: 'title and start_time_utc are required' })
  }

  try {
    // ── Fetch refresh token from Supabase ─────────────────────────────────────
    const { data: tenant, error: dbErr } = await supabase
      .from('tenants')
      .select('youtube_refresh_token')
      .eq('id', session.tenantId)
      .single()

    if (dbErr) throw dbErr
    if (!tenant?.youtube_refresh_token) {
      return res.status(400).json({ error: 'YouTube account not connected' })
    }
    const refreshToken = tenant.youtube_refresh_token

    // ── 1. Create the Live Broadcast ──────────────────────────────────────────
    const broadcast = await youtubeRequest(
      refreshToken,
      '/liveBroadcasts?part=snippet,status,contentDetails',
      {
        method: 'POST',
        body: {
          snippet: {
            title,
            scheduledStartTime: start_time_utc,
            ...(end_time_utc ? { scheduledEndTime: end_time_utc } : {}),
          },
          status: {
            privacyStatus:        'public',
            selfDeclaredMadeForKids: false,
          },
          contentDetails: {
            enableAutoStart: true,
            enableAutoStop:  true,
            recordFromStart: true,
            enableDvr:       true,
          },
        },
      }
    )

    const broadcastId = broadcast.id
    if (!broadcastId) throw new Error('YouTube did not return a broadcast ID')

    // ── 2. Create the Live Stream (RTMP ingest) ───────────────────────────────
    const stream = await youtubeRequest(
      refreshToken,
      '/liveStreams?part=snippet,cdn,status',
      {
        method: 'POST',
        body: {
          snippet: { title },
          cdn: {
            frameRate:     '30fps',
            ingestionType: 'rtmp',
            resolution:    '1080p',
          },
        },
      }
    )

    const streamId      = stream.id
    const ingestionInfo = stream.cdn?.ingestionInfo
    if (!streamId || !ingestionInfo) throw new Error('YouTube did not return stream ingest info')

    const rtmpUrl   = ingestionInfo.ingestionAddress   // e.g. rtmp://a.rtmp.youtube.com/live2
    const streamKey = ingestionInfo.streamName          // the per-stream key

    // ── 3. Bind broadcast to stream ───────────────────────────────────────────
    await youtubeRequest(
      refreshToken,
      `/liveBroadcasts/bind?id=${broadcastId}&streamId=${streamId}&part=id`,
      { method: 'POST' }
    )

    return res.status(201).json({
      broadcast_id: broadcastId,
      stream_id:    streamId,
      rtmp_url:     rtmpUrl,
      stream_key:   streamKey,
      watch_url:    `https://www.youtube.com/watch?v=${broadcastId}`,
    })
  } catch (err) {
    console.error('[youtube-create-stream]', err)
    return res.status(500).json({ error: err.message })
  }
}
