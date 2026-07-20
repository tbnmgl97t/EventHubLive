import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Box, Typography, TextField, Button, CircularProgress, Alert, Select, MenuItem } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

// JW's ad config list doesn't have a fully pinned-down field name for the id
// in every response shape we've seen documented, so accept either.
function adConfigId(config) {
  return config.ad_config_id || config.id
}

export default function HlsStreamForm({ token, tenantId }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [manifestUrl, setManifestUrl] = useState('')
  const [duration, setDuration] = useState('')
  const [adConfigIdValue, setAdConfigIdValue] = useState('')
  const [adConfigs, setAdConfigs] = useState([])
  const [adConfigsError, setAdConfigsError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdId, setCreatedId] = useState(null)

  useEffect(() => {
    fetch('/api/hls-watcher-ad-configs', { headers: authHeader(token, tenantId) })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Failed to load ad configs')
        setAdConfigs(data.ad_configs || [])
      })
      .catch(err => setAdConfigsError(err.message))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/hls-watcher-streams', {
        method: 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({
          name, url: manifestUrl,
          ...(duration ? { duration: Number(duration) } : {}),
          ...(adConfigIdValue ? { ad_config_id: adConfigIdValue } : {}),
        }),
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
        <TextField
          label="Duration (seconds)" value={duration} onChange={e => setDuration(e.target.value)}
          type="number" size="small" placeholder="Leave blank to run until stopped"
        />

        <Box>
          <Typography sx={{ fontSize: '0.75rem', color: '#94a3b8', mb: 0.5 }}>Ad Config (optional)</Typography>
          <Select
            value={adConfigIdValue}
            onChange={e => setAdConfigIdValue(e.target.value)}
            size="small"
            fullWidth
            displayEmpty
          >
            <MenuItem value="">None</MenuItem>
            {adConfigs.map(config => (
              <MenuItem key={adConfigId(config)} value={adConfigId(config)}>
                {config.name || adConfigId(config)}
              </MenuItem>
            ))}
          </Select>
          {adConfigsError && <Alert severity="warning" sx={{ mt: 1 }}>{adConfigsError}</Alert>}
        </Box>

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
