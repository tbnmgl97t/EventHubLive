import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Button, CircularProgress, Alert, Chip, IconButton, Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DeleteIcon from '@mui/icons-material/Delete'
import RouterIcon from '@mui/icons-material/Router'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { getStatusDisplay } from '../lib/streamStatus'

const AP = {
  accent:    '#6366f1',
  accentHov: '#4f46e5',
  accentDim: 'rgba(99,102,241,0.08)',
  accentBdr: 'rgba(99,102,241,0.3)',
  live:      '#10b981',
  liveDim:   'rgba(16,185,129,0.15)',
  muted:     '#94a3b8',
}

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

const INGEST_FORMAT_LABELS = {
  rtmp: 'RTMP', rtmps: 'RTMPS', srt: 'SRT (Push)', srt_pull: 'SRT (Pull)',
  hls: 'HLS (Push)', hls_pull: 'HLS (Pull)', rtp: 'RTP', rtp_fec: 'RTP + FEC',
}

function EncoderStatusChip({ status, loading, channelNotFound }) {
  if (loading) return null

  // The assigned channel_id no longer exists in JW (deleted/replaced) —
  // this is a distinct, actionable problem from any normal status, so it
  // gets its own badge rather than falling through to a generic "Offline".
  if (channelNotFound) {
    return (
      <Tooltip title="This encoder's assigned channel no longer exists in JW Player — reassign it in Edit">
        <Box sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5, px: '7px', height: 20,
          borderRadius: '5px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em',
          bgcolor: 'rgba(239,68,68,0.14)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', flexShrink: 0,
        }}>
          <WarningAmberIcon sx={{ fontSize: 12 }} />
          Channel Not Found
        </Box>
      </Tooltip>
    )
  }

  // Encoders don't carry their own persisted "live" flag — the underlying
  // 24/7 channel does (via JW) — so status/color come from the same shared
  // map every other stream status view reads from ("Offline" here instead
  // of "Idle" is the one label override that's specific to this list).
  const cfg = getStatusDisplay({ status, stream_type: '24/7' }, { idleLabel: 'Offline' })
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.5, px: '7px', height: 20,
      borderRadius: '5px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em',
      bgcolor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, flexShrink: 0,
    }}>
      {cfg.pulse && (
        <Box sx={{
          width: 5, height: 5, borderRadius: '50%', bgcolor: cfg.color, flexShrink: 0,
          animation: 'encStatusPulse 1.6s ease-in-out infinite',
          '@keyframes encStatusPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
        }} />
      )}
      {cfg.label}
    </Box>
  )
}

function SimulcastBadges({ encoder }) {
  const dests = [
    encoder.simulcast_website  && { key: 'website',  label: 'Website' },
    encoder.simulcast_youtube  && { key: 'youtube',  label: 'YouTube' },
    encoder.simulcast_facebook && { key: 'facebook', label: 'Facebook' },
    encoder.simulcast_app      && { key: 'app',      label: 'App' },
  ].filter(Boolean)

  if (!dests.length) {
    return <Typography sx={{ fontSize: '0.72rem', color: 'rgba(148,163,184,0.4)' }}>No simulcast destinations</Typography>
  }

  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {dests.map(d => (
        <Chip key={d.key} label={d.label} size="small"
          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, bgcolor: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }} />
      ))}
    </Box>
  )
}

function EncoderCard({ encoder, channelStatus, channelStatusLoading, channelNotFound, readOnly, onEdit, onOpen, onDelete }) {
  return (
    <Box sx={{
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)',
      p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.25,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>{encoder.name}</Typography>
            <EncoderStatusChip status={channelStatus} loading={channelStatusLoading} channelNotFound={channelNotFound} />
          </Box>
          {encoder.description && (
            <Typography sx={{ fontSize: '0.75rem', color: AP.muted, mt: 0.25 }}>{encoder.description}</Typography>
          )}
        </Box>
        {!readOnly && (
          <Tooltip title="Delete encoder">
            <IconButton size="small" onClick={() => onDelete(encoder)} sx={{ color: 'rgba(248,113,113,0.6)', '&:hover': { color: '#f87171' } }}>
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(148,163,184,0.6)', textTransform: 'uppercase', width: 88, flexShrink: 0 }}>
            Channel
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
            {encoder.channel_name || encoder.channel_id}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(148,163,184,0.6)', textTransform: 'uppercase', width: 88, flexShrink: 0 }}>
            Ingest
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
            {INGEST_FORMAT_LABELS[encoder.ingest_format] || encoder.ingest_format} · {encoder.region}
          </Typography>
        </Box>
      </Box>

      <SimulcastBadges encoder={encoder} />

      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        <Button
          size="small" variant="contained" startIcon={<PlayArrowIcon />}
          onClick={() => onOpen(encoder)}
          sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov }, fontSize: '0.72rem', minHeight: { xs: 44, sm: 'auto' }, flex: { xs: 1, sm: 'initial' } }}
        >
          Open Control
        </Button>
        <Button
          size="small" variant="outlined" startIcon={<EditIcon />}
          onClick={() => onEdit(encoder)}
          sx={{ borderColor: AP.accentBdr, color: AP.accent, '&:hover': { borderColor: AP.accent, bgcolor: AP.accentDim }, fontSize: '0.72rem', minHeight: { xs: 44, sm: 'auto' }, flex: { xs: 1, sm: 'initial' } }}
        >
          Edit
        </Button>
      </Box>
    </Box>
  )
}

export default function EncoderList({ token, tenantId, readOnly }) {
  const navigate = useNavigate()
  const [encoders, setEncoders] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const [channels, setChannels] = useState([])
  const [channelsLoading, setChannelsLoading] = useState(true)

  const fetchEncoders = useCallback(() => {
    setLoading(true)
    setError('')
    fetch('/api/encoders', { headers: authHeader(token, tenantId) })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load encoders')
        return data
      })
      .then(data => setEncoders(data.encoders || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token, tenantId])

  useEffect(() => { fetchEncoders() }, [fetchEncoders])

  // Each encoder's "status" is really its assigned channel's current JW state —
  // encoders themselves have no persisted live/offline flag of their own.
  useEffect(() => {
    setChannelsLoading(true)
    fetch('/api/channels', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : { channels: [] })
      .then(data => setChannels(data.channels || []))
      .catch(() => setChannels([]))
      .finally(() => setChannelsLoading(false))
  }, [token, tenantId])

  const channelStatusById = {}
  channels.forEach(c => { channelStatusById[c.id] = c.status })
  const knownChannelIds = new Set(channels.map(c => c.id))

  async function handleDelete(encoder) {
    if (!confirm(`Delete encoder "${encoder.name}"?\n\nThis cannot be undone.`)) return
    try {
      const res = await fetch('/api/encoders', {
        method: 'DELETE',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({ id: encoder.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete encoder')
      setEncoders(prev => prev.filter(e => e.id !== encoder.id))
    } catch (err) {
      alert(`Failed to delete encoder: ${err.message}`)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1.1rem' }}>
          ENCODERS
        </Typography>
        {!readOnly && (
          <Button
            size="small" variant="contained" startIcon={<AddIcon />}
            onClick={() => navigate('/admin/encoders/new')}
            sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov }, fontSize: '0.75rem', minHeight: { xs: 44, sm: 'auto' } }}
          >
            Add Encoder
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ fontSize: '0.8rem' }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} sx={{ color: AP.accent }} />
        </Box>
      ) : encoders.length === 0 ? (
        <Box sx={{
          border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 2, p: 5,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
        }}>
          <RouterIcon sx={{ fontSize: 32, color: AP.muted, opacity: 0.6 }} />
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>No encoders yet</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: AP.muted, textAlign: 'center', maxWidth: 420 }}>
            Add an encoder to represent a physical hardware encoder in your newsroom and assign it a 24/7 channel for breaking-news override.
          </Typography>
          {!readOnly && (
            <Button
              variant="contained" startIcon={<AddIcon />}
              onClick={() => navigate('/admin/encoders/new')}
              sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov }, mt: 1 }}
            >
              Create your first encoder
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 1.5 }}>
          {encoders.map(encoder => (
            <EncoderCard
              key={encoder.id}
              encoder={encoder}
              channelStatus={channelStatusById[encoder.channel_id]}
              channelStatusLoading={channelsLoading}
              channelNotFound={!channelsLoading && !!encoder.channel_id && !knownChannelIds.has(encoder.channel_id)}
              readOnly={readOnly}
              onEdit={e => navigate(`/admin/encoders/${e.id}/edit`)}
              onOpen={e => navigate(`/admin/encoders/${e.id}`)}
              onDelete={handleDelete}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
