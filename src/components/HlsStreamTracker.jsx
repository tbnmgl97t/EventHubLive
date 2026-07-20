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

  useEffect(() => {
    let cancelled = false
    const hlsDb = supabase.schema('hlsparser')

    async function loadInitial() {
      const { data: streamData, error: streamErr } = await hlsDb
        .from('hls_streams').select('*').eq('id', id).single()
      if (cancelled) return
      if (streamErr) { setError(streamErr.message); return }
      setStream(streamData)

      const { data: eventData, error: eventErr } = await hlsDb
        .from('hls_parser_events').select('*').eq('stream_id', id)
        .order('occurred_at', { ascending: false }).limit(200)
      if (cancelled) return
      if (eventErr) { setError(eventErr.message); return }
      setEvents(eventData || [])
    }
    loadInitial()

    const channel = supabase
      .channel(`hls-stream-${id}`)
      .on('postgres_changes', { event: '*', schema: 'hlsparser', table: 'hls_streams', filter: `id=eq.${id}` },
        payload => setStream(payload.new))
      .on('postgres_changes', { event: 'INSERT', schema: 'hlsparser', table: 'hls_parser_events', filter: `stream_id=eq.${id}` },
        payload => setEvents(prev => [payload.new, ...prev].slice(0, 200)))
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [id])

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
      <Typography sx={{ color: '#94a3b8', fontSize: '0.8rem' }}>{stream.manifest_url}</Typography>

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
    </Box>
  )
}
