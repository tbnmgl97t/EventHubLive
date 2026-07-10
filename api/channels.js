import { resolveTenantSession, getTenantJwCreds } from './_utils/tenant.js'
import { supabase }    from './_utils/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })

  const jw = await getTenantJwCreds(session.tenantId)
  if (!jw) return res.status(400).json({ error: 'JW Player is not configured for this tenant yet' })

  try {
    const streamsUrl = `https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/streams/?page_length=50`
    const ingestUrl  = `https://api.jwplayer.com/v2/sites/${jw.siteId}/live/broadcast/ingest/availability/?ingest_format=rtmp&page=1&page_length=50`

    const [streamsRes, ingestRes, ytRes, fbRes] = await Promise.all([
      fetch(streamsUrl, { headers: { Authorization: jw.apiSecret, Accept: 'application/json' } }),
      fetch(ingestUrl,  { headers: { Authorization: jw.apiSecret, Accept: 'application/json' } }),
      supabase.from('youtube_streams').select('*'),
      supabase.from('facebook_streams').select('*'),
    ])

    // Build lookup: jw_stream_id → youtube row
    const ytMap = {}
    for (const row of (ytRes.data || [])) {
      if (row.jw_stream_id) ytMap[row.jw_stream_id] = row
    }

    // Build lookup: jw_stream_id → facebook row
    const fbMap = {}
    for (const row of (fbRes.data || [])) {
      if (row.jw_stream_id) fbMap[row.jw_stream_id] = row
    }

    const body = await streamsRes.text()

    if (!streamsRes.ok) {
      // Use 502 regardless of JW's own status code — this is an upstream
      // dependency failure, not a problem with the caller's own session, and
      // must stay distinguishable from this endpoint's own 401/403 so the
      // frontend doesn't mistake a bad JW Player credential for a dead login.
      return res.status(502).json({
        error: `JW API error ${streamsRes.status}`,
        detail: body,
        siteId: jw.siteId,
      })
    }

    // Build a lookup map: ingest_point_id → display_name
    const ingestNameMap = {}
    if (ingestRes.ok) {
      const ingestData = await ingestRes.json()
      for (const p of (ingestData.ingests || [])) {
        if (p.id) ingestNameMap[p.id] = p.metadata?.display_name || null
      }
    }

    const data = JSON.parse(body)
    const raw = data.streams || data.broadcast_streams || data.items || data.results || []
    const channels = raw.map(ch => {
      const rtmp          = ch.metadata?.ingest?.rtmp?.ingest_point
      const ingestPointId = ch.relationships?.ingest_point?.id || null
      // Derive display status from metadata.status + playout.availability
      // JW returns raw "streaming" for both preview and active, and "destroying" for stopping
      const rawStatus    = ch.metadata?.status || 'idle'
      const availability = ch.metadata?.playout?.availability
      let derivedStatus
      if (rawStatus === 'destroying') {
        derivedStatus = 'stopping'
      } else if (rawStatus === 'streaming' && availability === 'available') {
        derivedStatus = 'active'
      } else if (rawStatus === 'streaming' && availability === 'preview') {
        derivedStatus = 'preview'
      } else if (rawStatus === 'starting') {
        derivedStatus = 'starting'
      } else {
        derivedStatus = rawStatus
      }

      return {
        id:               ch.id,
        name:             ch.metadata?.title || ch.id,
        status:           derivedStatus,
        stream_type:      ch.stream_type || null,
        stream_url:       ch.metadata?.playout?.hls || null,
        stream_start:     ch.metadata?.stream_start || null,
        stream_end:       ch.metadata?.stream_end   || null,
        created_at:       ch.created || ch.created_at || null,
        ingest_url:       rtmp?.url  || null,
        ingest_key:       rtmp?.key  || null,
        ingest_format:    ch.ingest_format || null,
        ingest_point_id:  ingestPointId,
        ingest_point_name: ingestNameMap[ingestPointId] || null,
        // VOD / downloadable recording
        enable_live_to_vod: ch.enable_live_to_vod || ch.options?.enable_live_to_vod || ch.metadata?.enable_live_to_vod || false,
        vod_media_id:     ch.vod_media_id || ch.metadata?.vod_media_id || null,
        // YouTube simulcast — prefer Supabase record, fall back to JW custom_params
        youtube_broadcast_id: ytMap[ch.id]?.broadcast_id       || ch.metadata?.custom_params?.youtube_broadcast_id || null,
        youtube_stream_id:    ytMap[ch.id]?.stream_id           || ch.metadata?.custom_params?.youtube_stream_id    || null,
        youtube_rtmp_url:     ytMap[ch.id]?.rtmp_url            || ch.metadata?.custom_params?.youtube_rtmp_url     || null,
        youtube_backup_rtmp:  ytMap[ch.id]?.backup_rtmp_url     || null,
        youtube_stream_key:   ytMap[ch.id]?.stream_key          || ch.metadata?.custom_params?.youtube_stream_key   || null,
        youtube_watch_url:    ytMap[ch.id]?.watch_url           || null,
        youtube_privacy:      ytMap[ch.id]?.privacy_status      || null,
        youtube_thumbnail_set: ytMap[ch.id]?.thumbnail_set      ?? null,
        youtube_scheduled_start: ytMap[ch.id]?.scheduled_start  || null,
        youtube_scheduled_end:   ytMap[ch.id]?.scheduled_end    || null,
        // Facebook simulcast — prefer Supabase record, fall back to JW custom_params
        facebook_live_video_id: fbMap[ch.id]?.live_video_id     || ch.metadata?.custom_params?.facebook_live_video_id || null,
        facebook_rtmp_url:      fbMap[ch.id]?.rtmp_url          || ch.metadata?.custom_params?.facebook_rtmp_url      || null,
        facebook_stream_key:    fbMap[ch.id]?.stream_key        || ch.metadata?.custom_params?.facebook_stream_key    || null,
        facebook_watch_url:     fbMap[ch.id]?.watch_url         || null,
        facebook_page_name:     fbMap[ch.id]?.page_name         || null,
      }
    })
    // Sort: latest stream_start first; tie-break by name A→Z; no-start go last
    channels.sort((a, b) => {
      if (!a.stream_start && !b.stream_start) return (a.name || '').localeCompare(b.name || '')
      if (!a.stream_start) return 1
      if (!b.stream_start) return -1
      const timeDiff = new Date(b.stream_start) - new Date(a.stream_start)
      if (timeDiff !== 0) return timeDiff
      return (a.name || '').localeCompare(b.name || '')
    })

    // Backfill VOD media ownership — this is the only place the app observes
    // vod_media_id, so it's also the only place that can populate the
    // defense-in-depth ownership check used by delete-vod-media.js. First
    // tenant to observe an asset claims it (ignoreDuplicates: never reassign
    // an already-claimed row).
    const vodRows = channels
      .filter(c => c.vod_media_id)
      .map(c => ({ tenant_id: session.tenantId, jw_media_id: c.vod_media_id, jw_stream_id: c.id }))
    if (vodRows.length) {
      try {
        await supabase.from('vod_media').upsert(vodRows, { onConflict: 'jw_media_id', ignoreDuplicates: true })
      } catch (_) { /* non-fatal */ }
    }

    return res.status(200).json({ channels })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
