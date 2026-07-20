import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, Typography, Chip, Alert, CircularProgress, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { supabase } from '../lib/supabaseClient'

export default function HlsStreamTracker() {
  const { id } = useParams()
  const [stream, setStream] = useState(null)
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')

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
