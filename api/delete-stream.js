import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'
import { canWrite }       from './_utils/auth.js'
import { supabase }       from './_utils/supabase.js'
import { youtubeRequest } from './_utils/youtube.js'
import { fbRequest }      from './_utils/facebook.js'

/**
 * DELETE /api/delete-stream
 * Body: { id, name?, youtube_broadcast_id?, youtube_stream_id? }
 *
 * 1. YouTube cleanup (non-fatal):
 *    a. If youtube_broadcast_id is known — delete it directly.
 *    b. If not (stream pre-dates ID storage) — search YouTube by title and delete
 *       any broadcast whose snippet.title exactly matches the stream name.
 * 2. Delete the JW media / broadcast stream.
 */
export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { id, name, youtube_broadcast_id, youtube_stream_id, facebook_live_video_id } = req.body || {}
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

  const ytErrors = []
  const fbErrors = []

  // ── 1. YouTube cleanup ────────────────────────────────────────────────────────
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('youtube_refresh_token')
      .eq('id', session.tenantId)
      .single()

    if (tenant?.youtube_refresh_token) {
      const rt = tenant.youtube_refresh_token

      // Resolve which broadcast ID(s) to delete
      let broadcastIds  = youtube_broadcast_id ? [youtube_broadcast_id] : []
      let streamIdsToDelete = youtube_stream_id ? [youtube_stream_id] : []

      // Fallback: search by title if no stored ID (legacy streams)
      if (!broadcastIds.length && name) {
        try {
          const search = await youtubeRequest(
            rt,
            `/liveBroadcasts?part=id,snippet&broadcastStatus=all&broadcastType=all&maxResults=10`
          )
          const matches = (search?.items || []).filter(
            b => b.snippet?.title?.trim() === name.trim()
          )
          broadcastIds = matches.map(b => b.id)
          console.log(`[delete-stream] YouTube title search for "${name}": found ${broadcastIds.length} match(es)`)
        } catch (e) {
          ytErrors.push(`YouTube title search: ${e.message}`)
        }
      }

      // Delete each resolved broadcast (and its bound live stream)
      for (const bcId of broadcastIds) {
        // a. Transition to complete if still live/testing
        try {
          const bc = await youtubeRequest(rt, `/liveBroadcasts?part=status,contentDetails&id=${encodeURIComponent(bcId)}`)
          const lifeCycle = bc?.items?.[0]?.status?.lifeCycleStatus
          const boundStreamId = bc?.items?.[0]?.contentDetails?.boundStreamId

          if (lifeCycle === 'live' || lifeCycle === 'testing') {
            await youtubeRequest(
              rt,
              `/liveBroadcasts/transition?broadcastStatus=complete&id=${encodeURIComponent(bcId)}&part=status`,
              { method: 'POST' }
            )
          }

          // Collect bound stream ID if we didn't already know it
          if (boundStreamId && !streamIdsToDelete.includes(boundStreamId)) {
            streamIdsToDelete.push(boundStreamId)
          }
        } catch (e) {
          ytErrors.push(`broadcast status (${bcId}): ${e.message}`)
        }

        // b. Delete broadcast
        try {
          await youtubeRequest(rt, `/liveBroadcasts?id=${encodeURIComponent(bcId)}`, { method: 'DELETE' })
        } catch (e) {
          ytErrors.push(`broadcast delete (${bcId}): ${e.message}`)
        }
      }

      // Delete all associated live streams
      for (const sId of streamIdsToDelete) {
        try {
          await youtubeRequest(rt, `/liveStreams?id=${encodeURIComponent(sId)}`, { method: 'DELETE' })
        } catch (e) {
          ytErrors.push(`stream delete (${sId}): ${e.message}`)
        }
      }
    }
  } catch (err) {
    ytErrors.push(`tenant fetch: ${err.message}`)
  }

  // ── 2. Facebook cleanup ───────────────────────────────────────────────────────
  try {
    const { data: fbTenant } = await supabase
      .from('tenants')
      .select('facebook_page_access_token')
      .eq('id', session.tenantId)
      .single()

    if (fbTenant?.facebook_page_access_token) {
      const pageToken = fbTenant.facebook_page_access_token

      // Resolve live_video_id: use passed value or fall back to Supabase lookup
      let liveVideoId = facebook_live_video_id
      if (!liveVideoId) {
        const { data: fbRow } = await supabase
          .from('facebook_streams')
          .select('live_video_id')
          .eq('jw_stream_id', id)
          .single()
        liveVideoId = fbRow?.live_video_id || null
      }

      if (liveVideoId) {
        try {
          // End the live video if it's currently broadcasting, then delete
          await fbRequest(pageToken, `/${liveVideoId}`, {
            method: 'POST',
            body:   { end_live_video: true },
          }).catch(() => { /* non-fatal — may already be ended */ })

          await fbRequest(pageToken, `/${liveVideoId}`, { method: 'DELETE' })
          console.log('[delete-stream] Deleted Facebook live video', liveVideoId)
        } catch (e) {
          fbErrors.push(`live video delete (${liveVideoId}): ${e.message}`)
        }
      }
    }
  } catch (err) {
    fbErrors.push(`tenant fetch: ${err.message}`)
  }

  // ── 3. Delete JW media / broadcast stream ────────────────────────────────────
  // Clean up Supabase registry rows (non-fatal)
  try {
    await Promise.all([
      supabase.from('streams').delete().eq('jw_stream_id', id),
      supabase.from('youtube_streams').delete().eq('jw_stream_id', id),
      supabase.from('facebook_streams').delete().eq('jw_stream_id', id),
    ])
  } catch (_) { /* non-fatal */ }

  try {
    const r = await fetch(
      `https://api.jwplayer.com/v2/sites/${jw.siteId}/media/${id}/`,
      {
        method: 'DELETE',
        headers: { Authorization: jw.apiSecret, Accept: 'application/json' },
      }
    )

    if (!r.ok) {
      const body = await r.text()
      return res.status(r.status).json({ error: `JW API error ${r.status}`, detail: body })
    }

    return res.status(200).json({
      ok:               true,
      id,
      youtube_deleted:  ytErrors.length === 0,
      facebook_deleted: fbErrors.length === 0,
      ...(ytErrors.length ? { youtube_warnings:  ytErrors } : {}),
      ...(fbErrors.length ? { facebook_warnings: fbErrors } : {}),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
