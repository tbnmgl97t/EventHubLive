import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Box, Typography, Button, TextField, CircularProgress, Alert,
  Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material'

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

export default function HlsWatcher({ token, tenantId, readOnly }) {
  const [streams, setStreams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [manifestUrl, setManifestUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [lastCreatedId, setLastCreatedId] = useState(null)

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

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    setLastCreatedId(null)
    try {
      const res = await fetch('/api/hls-watcher-streams', {
        method: 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({ name, manifest_url: manifestUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create stream')
      if (!data.trigger_ok) {
        setSubmitError(`Stream created, but the parser task failed to start: ${data.trigger_error}`)
      }
      setLastCreatedId(data.id)
      setName('')
      setManifestUrl('')
      fetchStreams()
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {!readOnly && (
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
          <Typography sx={{ fontWeight: 700, color: '#fff' }}>Add Stream</Typography>
          <TextField label="Name" value={name} onChange={e => setName(e.target.value)} required size="small" />
          <TextField label="Manifest URL" value={manifestUrl} onChange={e => setManifestUrl(e.target.value)} required size="small" />
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={20} /> : 'Add Stream'}
          </Button>
          {submitError && <Alert severity="warning">{submitError}</Alert>}
          {lastCreatedId && !submitError && (
            <Alert severity="success">
              Stream created — <Link to={`/admin/hlswatcher/${lastCreatedId}`}>track it here</Link>
            </Alert>
          )}
        </Box>
      )}

      <Box>
        <Typography sx={{ fontWeight: 700, color: '#fff', mb: 1 }}>Streams</Typography>
        {loading && <CircularProgress size={20} />}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !error && (
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
    </Box>
  )
}
