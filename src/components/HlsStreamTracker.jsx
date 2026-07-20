import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, Typography, Chip, Alert, CircularProgress, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { supabase } from '../lib/supabaseClient'

const JW_PLAYER_LIB = 'https://cdn.jwplayer.com/libraries/xJKVL03e.js'

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

function loadJWPlayerScript() {
  return new Promise((resolve, reject) => {
    if (window.jwplayer) { resolve(window.jwplayer); return }
    const existing = document.querySelector(`script[src="${JW_PLAYER_LIB}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.jwplayer))
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.src = JW_PLAYER_LIB
    script.async = true
    script.onload = () => resolve(window.jwplayer)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

// Embeds a JW Player preview for the stream's SSAI-enabled manifest URL —
// only rendered once the stream has an ad_config_id and the URL fetch
// succeeds (see the ssaiUrl effect below).
function SsaiPreviewPlayer({ url }) {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const playerDivId = 'jw-player-ssai-preview'

  useEffect(() => {
    let cancelled = false
    loadJWPlayerScript().then(jwplayer => {
      if (cancelled || !containerRef.current) return
      playerRef.current = jwplayer(playerDivId).setup({ file: url, width: '100%', aspectratio: '16:9' })
    }).catch(err => console.error('JW Player failed to load:', err))

    return () => {
      cancelled = true
      if (playerRef.current) {
        try { playerRef.current.remove() } catch (_) {}
        playerRef.current = null
      }
    }
  }, [url])

  return <div id={playerDivId} ref={containerRef} style={{ width: '100%', maxWidth: 640 }} />
}

export default function HlsStreamTracker({ token, tenantId }) {
  const { id } = useParams()
  const [stream, setStream] = useState(null)
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [ssaiUrl, setSsaiUrl] = useState(null)
  const [ssaiError, setSsaiError] = useState('')

  // Stream row: fetched once, then kept live via Realtime.
  useEffect(() => {
    let cancelled = false
    const hlsDb = supabase.schema('hlsparser')

    hlsDb.from('hls_streams').select('*').eq('id', id).single().then(({ data, error: streamErr }) => {
      if (cancelled) return
      if (streamErr) { setError(streamErr.message); return }
      setStream(data)
    })

    const channel = supabase
      .channel(`hls-stream-${id}`)
      .on('postgres_changes', { event: '*', schema: 'hlsparser', table: 'hls_streams', filter: `id=eq.${id}` },
        payload => setStream(payload.new))
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [id])

  // Events: scoped to the stream's CURRENT task run, not the stream as a
  // whole — a stream's task can restart, and each run gets its own task_id,
  // so filtering by stream_id would mix events from old and new runs
  // together. Re-subscribes whenever current_task_id changes.
  useEffect(() => {
    const taskId = stream?.current_task_id
    setEvents([])
    if (!taskId) return

    let cancelled = false
    const hlsDb = supabase.schema('hlsparser')

    hlsDb.from('hls_parser_events').select('*').eq('task_id', taskId)
      .order('occurred_at', { ascending: false }).limit(200)
      .then(({ data, error: eventErr }) => {
        if (cancelled) return
        if (eventErr) { setError(eventErr.message); return }
        setEvents(data || [])
      })

    const channel = supabase
      .channel(`hls-events-${taskId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'hlsparser', table: 'hls_parser_events', filter: `task_id=eq.${taskId}` },
        payload => setEvents(prev => [payload.new, ...prev].slice(0, 200)))
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [stream?.current_task_id])

  // SSAI preview URL: only fetched once the stream has an ad_config_id.
  useEffect(() => {
    setSsaiUrl(null)
    setSsaiError('')
    if (!stream?.ad_config_id) return

    fetch(`/api/hls-watcher-ssai-url?id=${id}`, { headers: authHeader(token, tenantId) })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Failed to get SSAI preview URL')
        setSsaiUrl(data.url)
      })
      .catch(err => setSsaiError(err.message))
  }, [id, stream?.ad_config_id, token, tenantId])

  if (error) return <Alert severity="error">{error}</Alert>
  if (!stream) return <CircularProgress size={20} />

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Link to="/admin/hlswatcher" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8' }}>
        <ArrowBackIcon fontSize="small" /> Back to streams
      </Link>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ fontWeight: 700, color: '#fff', fontSize: '1.1rem' }}>{stream.name}</Typography>
        <Chip size="small" label={stream.session_status || 'not started'} />
        {stream.current_task_id && <Chip size="small" variant="outlined" label={`task: ${stream.current_task_id}`} />}
      </Box>
      <Typography sx={{ color: '#94a3b8', fontSize: '0.8rem' }}>
        {stream.manifest_url}
        {stream.duration_seconds ? ` · duration: ${stream.duration_seconds}s` : ''}
      </Typography>

      {stream.ad_config_id && (
        <Box>
          <Typography sx={{ fontSize: '0.75rem', color: '#94a3b8', mb: 1 }}>SSAI Preview</Typography>
          {ssaiError && <Alert severity="warning">{ssaiError}</Alert>}
          {!ssaiError && (ssaiUrl ? <SsaiPreviewPlayer url={ssaiUrl} /> : <CircularProgress size={20} />)}
        </Box>
      )}

      {!stream.current_task_id ? (
        <Alert severity="info">No task has run for this stream yet.</Alert>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Occurred</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Payload</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map(ev => (
              <TableRow key={ev.id}>
                <TableCell>{new Date(ev.occurred_at).toLocaleTimeString()}</TableCell>
                <TableCell>{ev.type}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{JSON.stringify(ev.payload)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  )
}
