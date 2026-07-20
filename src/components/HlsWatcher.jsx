import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Box, Typography, Button, CircularProgress, Alert,
  Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna'

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

export default function HlsWatcher({ token, tenantId, readOnly }) {
  const navigate = useNavigate()
  const [streams, setStreams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function fetchStreams() {
    setLoading(true)
    try {
      const res = await fetch('/api/hls-watcher-streams', { headers: authHeader(token, tenantId) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load streams')
      setStreams(data.streams || [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStreams() }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>HLS Watcher</Typography>
        {!readOnly && (
          <Button
            size="small" variant="contained" startIcon={<AddIcon />}
            onClick={() => navigate('/admin/hlswatcher/new')}
          >
            Add Stream
          </Button>
        )}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : streams.length === 0 ? (
        <Box sx={{
          border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 2, p: 5,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
        }}>
          <SettingsInputAntennaIcon sx={{ fontSize: 32, color: '#94a3b8', opacity: 0.6 }} />
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>No streams yet</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', maxWidth: 420 }}>
            Add a stream to start watching its HLS manifest for segments and SCTE-35 ad markers.
          </Typography>
          {!readOnly && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/admin/hlswatcher/new')} sx={{ mt: 1 }}>
              Add Stream
            </Button>
          )}
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Manifest URL</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {streams.map(s => (
              <TableRow key={s.id}>
                <TableCell>{s.name}</TableCell>
                <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.manifest_url}</TableCell>
                <TableCell>{s.session_status || 'not started'}</TableCell>
                <TableCell><Link to={`/admin/hlswatcher/${s.id}`}>Track</Link></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  )
}
