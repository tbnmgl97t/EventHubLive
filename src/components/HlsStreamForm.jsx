import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Box, Typography, TextField, Button, CircularProgress, Alert } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

export default function HlsStreamForm({ token, tenantId }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [manifestUrl, setManifestUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdId, setCreatedId] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/hls-watcher-streams', {
        method: 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({ name, manifest_url: manifestUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create stream')
      if (data.trigger_ok) {
        navigate(`/admin/hlswatcher/${data.id}`)
      } else {
        setCreatedId(data.id)
        setError(`Stream created, but the parser task failed to start: ${data.trigger_error}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
      <Link to="/admin/hlswatcher" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', textDecoration: 'none' }}>
        <ArrowBackIcon fontSize="small" /> Back to streams
      </Link>
      <Typography sx={{ fontWeight: 700, color: '#fff', fontSize: '1.1rem' }}>Add Stream</Typography>
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField label="Name" value={name} onChange={e => setName(e.target.value)} required size="small" autoFocus />
        <TextField
          label="Manifest URL" value={manifestUrl} onChange={e => setManifestUrl(e.target.value)}
          required size="small" placeholder="https://example.com/live/stream.m3u8"
        />
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? <CircularProgress size={20} /> : 'Add Stream'}
        </Button>
        {error && (
          <Alert severity="warning">
            {error}
            {createdId && <> — <Link to={`/admin/hlswatcher/${createdId}`}>view it anyway</Link></>}
          </Alert>
        )}
      </Box>
    </Box>
  )
}
