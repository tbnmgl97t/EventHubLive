import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'
import { canWrite }                from './_utils/auth.js'
import { supabase }                from './_utils/supabase.js'
import { youtubeRequest }          from './_utils/youtube.js'
import { fbRequest, parseFbRtmp }  from './_utils/facebook.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const jw = await getTenantJwCreds(session.tenantId)
  if (!jw) return res.status(400).json({ error: 'JW Player is not configured for this tenant yet' })

  const {
    title,
    region       = 'us-east-1',
    channel_type = 'live_event', // 'live_event' | 'always_on'
    ingest_format = 'rtmp',
    start_time_utc,
    end_time_utc,
    ingest_point_id,
    source_url       = null,     // required for pull-type ingest formats (srt_pull, hls_pull)
    downloadable     = false,    // true → save VOD asset (10-day availability)
    youtube_key      = null,     // manual YouTube stream key (legacy)
    create_youtube   = false,    // true → auto-create YouTube broadcast via API
    create_facebook  = false,    // true → auto-create Facebook live video via API
  } = req.body || {}

  if (!title) return res.status(400).json({ error: 'title is required' })
  if ((ingest_format === 'srt_pull' || ingest_format === 'hls_pull') && !source_url) {
    return res.status(400).json({ error: 'source_url is required for pull-type ingest formats' })
  }

  try {
    const streamType = channel_type === 'always_on' ? '24/7' : 'event'

    const payload = {
      metadata: {
        title,
        ...(streamType === 'event' && { custom_params: { contentType: 'liveEvent' } }),
      },
      region,
      ...(streamType === 'event' && { stream_warmup: 15 }),
      options: {
        ingest_format,
        ...(source_url && { source_url }),
        stream_type:        streamType,
        enable_live_to_vod: downloadable ? true : false,
        ...(downloadable && { live_to_vod_method: 'hosted_capture' }),
        ...(streamType === 'event' && start_time_utc && { stream_start: start_time_utc }),
        ...(streamType === 'event' && end_time_utc   && { stream_end:   end_time_utc  }),
      },
    }

    if (ingest_point_id) {
      payload.relationships = {
        ingest_point: { id: ingest_point_id, type: 'ingest_point' },
      }
    }

    // ── YouTube simulcast ─────────────────────────────────────────────────────
    let youtubeResult = null

    if (create_youtube) {
      // Auto-create via YouTube API — fetch refresh token from Supabase
      const { data: tenant } = await supabase
        .from('tenants')
        .select('youtube_refresh_token')
        .eq('id', session.tenantId)
        .single()

      if (!tenant?.youtube_refresh_token) {
        return res.status(400).json({ error: 'YouTube account not connected. Connect it in Settings first.' })
      }

      try {
        // YouTube requires scheduledStartTime to be in the future (RFC 3339, no ms)
        // Use start_time_utc if provided, otherwise 10 minutes from now
        const ytStartTime = start_time_utc
          ? start_time_utc.replace(/\.\d+Z$/, 'Z')
          : new Date(Date.now() + 10 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z')

        // 1. Create broadcast
        const broadcast = await youtubeRequest(
          tenant.youtube_refresh_token,
          '/liveBroadcasts?part=snippet,status,contentDetails',
          {
            method: 'POST',
            body: {
              snippet: {
                title,
                scheduledStartTime: ytStartTime,
                ...(end_time_utc ? { scheduledEndTime: end_time_utc.replace(/\.\d+Z$/, 'Z') } : {}),
              },
              status: {
                privacyStatus:           'public',
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

        // 2. Create stream (RTMP ingest)
        const ytStream = await youtubeRequest(
          tenant.youtube_refresh_token,
          '/liveStreams?part=snippet,cdn,status',
          {
            method: 'POST',
            body: {
              snippet: { title },
              cdn: { frameRate: 'variable', ingestionType: 'rtmp', resolution: 'variable' },
            },
          }
        )

        // 3. Bind broadcast to stream
        await youtubeRequest(
          tenant.youtube_refresh_token,
          `/liveBroadcasts/bind?id=${broadcast.id}&streamId=${ytStream.id}&part=id`,
          { method: 'POST' }
        )

        const ingestion = ytStream.cdn?.ingestionInfo
        youtubeResult = {
          broadcast_id:    broadcast.id,
          stream_id:       ytStream.id,
          rtmp_url:        ingestion?.ingestionAddress,
          backup_rtmp_url: ingestion?.backupIngestionAddress || null,
          stream_key:      ingestion?.streamName,
          watch_url:       `https://www.youtube.com/watch?v=${broadcast.id}`,
        }
      } catch (ytErr) {
        console.error('[create-stream] YouTube API error:', ytErr.message)
        return res.status(502).json({
          error:  'YouTube stream creation failed',
          detail: ytErr.message,
        })
      }

    }

    // ── Facebook simulcast ────────────────────────────────────────────────────
    let facebookResult = null

    if (create_facebook) {
      const { data: fbTenant } = await supabase
        .from('tenants')
        .select('facebook_page_access_token, facebook_page_id, facebook_page_name')
        .eq('id', session.tenantId)
        .single()

      if (!fbTenant?.facebook_page_access_token || !fbTenant?.facebook_page_id) {
        return res.status(400).json({ error: 'Facebook Page not connected. Connect it in Settings first.' })
      }

      try {
        // Facebook planned_start_time is Unix timestamp (seconds)
        const fbStartTime = start_time_utc
          ? Math.floor(new Date(start_time_utc).getTime() / 1000)
          : Math.floor((Date.now() + 10 * 60 * 1000) / 1000)

        const liveVideo = await fbRequest(
          fbTenant.facebook_page_access_token,
          `/${fbTenant.facebook_page_id}/live_videos?fields=id,secure_stream_url,stream_url,permalink_url`,
          {
            method: 'POST',
            body: {
              title,
              status:             'SCHEDULED_UNPUBLISHED',
              planned_start_time: fbStartTime,
            },
          }
        )

        const { base: rtmpBase, key: streamKey } = parseFbRtmp(liveVideo.secure_stream_url || liveVideo.stream_url)

        facebookResult = {
          live_video_id:   liveVideo.id,
          rtmp_url:        rtmpBase,
          stream_key:      streamKey,
          secure_rtmp_url: liveVideo.secure_stream_url || null,
          watch_url:       `https://www.facebook.com/video/${liveVideo.id}`,
          page_id:         fbTenant.facebook_page_id,
          page_name:       fbTenant.facebook_page_name || null,
        }
      } catch (fbErr) {
        console.error('[create-stream] Facebook API error:', fbErr.message)
        // Roll back YouTube if it was created
        if (youtubeResult) {
          try {
            const { data: ytTenant } = await supabase.from('tenants').select('youtube_refresh_token').eq('id', session.tenantId).single()
            if (ytTenant?.youtube_refresh_token) {
              const rt = ytTenant.youtube_refresh_token
              await youtubeRequest(rt, `/liveBroadcasts?id=${encodeURIComponent(youtubeResult.broadcast_id)}`, { method: 'DELETE' })
              if (youtubeResult.stream_id) await youtubeRequest(rt, `/liveStreams?id=${encodeURIComponent(youtubeResult.stream_id)}`, { method: 'DELETE' })
            }
          } catch (_) { /* rollback best-effort */ }
        }
        return res.status(502).json({ error: 'Facebook stream creation failed', detail: fbErr.message })
      }
    }

    // Wire JW additional_outputs for any simulcast destinations
    const additionalOutputs = [
      ...(youtubeResult  ? [{ title: 'YouTube',  url: youtubeResult.rtmp_url,  key: youtubeResult.stream_key }]  : []),
      ...(facebookResult ? [{ title: 'Facebook', url: facebookResult.rtmp_url, key: facebookResult.stream_key }] : []),
    ]
    if (additionalOutputs.length) {
      payload.options.additional_outputs = additionalOutputs
    }

    const r = await fetch(
      `https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/streams/`,
      {
        method: 'POST',
        headers: {
          Authorization:   jw.apiSecret,
          'Content-Type':  'application/json',
          Accept:          'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    const bodyText = await r.text()

    if (!r.ok) {
      // JW failed — roll back any simulcast resources we just created
      if (youtubeResult) {
        try {
          const { data: ytTenant } = await supabase.from('tenants').select('youtube_refresh_token').eq('id', session.tenantId).single()
          if (ytTenant?.youtube_refresh_token) {
            const rt = ytTenant.youtube_refresh_token
            await youtubeRequest(rt, `/liveBroadcasts?id=${encodeURIComponent(youtubeResult.broadcast_id)}`, { method: 'DELETE' })
            if (youtubeResult.stream_id) await youtubeRequest(rt, `/liveStreams?id=${encodeURIComponent(youtubeResult.stream_id)}`, { method: 'DELETE' })
            console.log('[create-stream] Rolled back orphaned YouTube broadcast', youtubeResult.broadcast_id)
          }
        } catch (rollbackErr) {
          console.error('[create-stream] YouTube rollback failed:', rollbackErr.message)
        }
      }
      if (facebookResult) {
        try {
          const { data: fbTenant } = await supabase.from('tenants').select('facebook_page_access_token').eq('id', session.tenantId).single()
          if (fbTenant?.facebook_page_access_token) {
            await fbRequest(fbTenant.facebook_page_access_token, `/${facebookResult.live_video_id}`, { method: 'DELETE' })
            console.log('[create-stream] Rolled back orphaned Facebook live video', facebookResult.live_video_id)
          }
        } catch (rollbackErr) {
          console.error('[create-stream] Facebook rollback failed:', rollbackErr.message)
        }
      }
      return res.status(r.status).json({
        error:  `JW API error ${r.status}`,
        detail: bodyText,
      })
    }

    const data = JSON.parse(bodyText)

    // PATCH linked media item with custom_params (JW ignores custom_params on stream itself).
    // Also persist YouTube IDs here so delete-stream can clean them up later.
    if (streamType === 'event' && data.id) {
      try {
        const customParams = {
          contentType: 'liveEvent',
          tenant_id:   session.tenantId,
          ...(youtubeResult ? {
            youtube_broadcast_id: youtubeResult.broadcast_id,
            youtube_stream_id:    youtubeResult.stream_id,
            youtube_rtmp_url:     youtubeResult.rtmp_url,
            youtube_stream_key:   youtubeResult.stream_key,
          } : {}),
          ...(facebookResult ? {
            facebook_live_video_id: facebookResult.live_video_id,
            facebook_rtmp_url:      facebookResult.rtmp_url,
            facebook_stream_key:    facebookResult.stream_key,
          } : {}),
        }
        await fetch(
          `https://api.jwplayer.com/v2/sites/${jw.siteId}/media/${data.id}/`,
          {
            method: 'PATCH',
            headers: {
              Authorization: jw.apiSecret,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ metadata: { custom_params: customParams } }),
          }
        )
      } catch (_) { /* non-fatal */ }
    }

    // Register stream ownership in Supabase — used for multi-tenant filtering later
    if (data.id) {
      try {
        await supabase.from('streams').upsert({
          tenant_id:    session.tenantId,
          jw_stream_id: data.id,
          name:         title,
        }, { onConflict: 'jw_stream_id' })
      } catch (_) { /* non-fatal */ }
    }

    // Persist YouTube stream info to Supabase for display and future reference
    if (youtubeResult && data.id) {
      try {
        await supabase.from('youtube_streams').upsert({
          jw_stream_id:    data.id,
          jw_stream_name:  title,
          broadcast_id:    youtubeResult.broadcast_id,
          stream_id:       youtubeResult.stream_id,
          rtmp_url:        youtubeResult.rtmp_url,
          backup_rtmp_url: youtubeResult.backup_rtmp_url,
          stream_key:      youtubeResult.stream_key,
          watch_url:       youtubeResult.watch_url,
          privacy_status:  'public',
          scheduled_start: start_time_utc || null,
          scheduled_end:   end_time_utc   || null,
          thumbnail_set:   false,
        }, { onConflict: 'jw_stream_id' })
      } catch (_) { /* non-fatal — JW stream is already created */ }
    }

    // Persist Facebook live video info to Supabase
    if (facebookResult && data.id) {
      try {
        await supabase.from('facebook_streams').upsert({
          jw_stream_id:    data.id,
          jw_stream_name:  title,
          live_video_id:   facebookResult.live_video_id,
          rtmp_url:        facebookResult.rtmp_url,
          stream_key:      facebookResult.stream_key,
          secure_rtmp_url: facebookResult.secure_rtmp_url,
          watch_url:       facebookResult.watch_url,
          page_id:         facebookResult.page_id,
          page_name:       facebookResult.page_name,
          status:          'SCHEDULED_UNPUBLISHED',
          scheduled_start: start_time_utc || null,
        }, { onConflict: 'jw_stream_id' })
      } catch (_) { /* non-fatal — JW stream is already created */ }
    }

    // VOD expiry: 10 days from now (stored for dashboard tracking)
    const vodExpiresAt = downloadable
      ? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
      : null

    return res.status(201).json({
      id:               data.id,
      name:             data.metadata?.title,
      status:           data.metadata?.status,
      stream_type:      data.stream_type || streamType,
      ingest_format:    data.ingest_format || ingest_format,
      stream_url:       data.metadata?.playout?.hls || null,
      ingest_address:   data.ingest_address  || null,
      ingest_stream_key: data.connection_code || null,
      site_id:          jw.siteId,
      ...(streamType === 'event' && { stream_warmup: data.stream_warmup ?? 15 }),
      downloadable,
      vod_expires_at:   vodExpiresAt,
      youtube:          youtubeResult,
      facebook:         facebookResult,
      raw:              data,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
