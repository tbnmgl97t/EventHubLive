import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box, Typography, Button, CircularProgress, Alert, Chip, IconButton, Switch,
  Collapse, Table, TableHead, TableBody, TableRow, TableCell, Tooltip,
} from '@mui/material'
import ArrowBackIcon        from '@mui/icons-material/ArrowBack'
import PlayArrowIcon        from '@mui/icons-material/PlayArrow'
import StopIcon             from '@mui/icons-material/Stop'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import ContentCopyIcon      from '@mui/icons-material/ContentCopy'
import CheckIcon            from '@mui/icons-material/Check'
import VisibilityIcon       from '@mui/icons-material/Visibility'
import VisibilityOffIcon    from '@mui/icons-material/VisibilityOff'
import ExpandMoreIcon       from '@mui/icons-material/ExpandMore'
import ExpandLessIcon       from '@mui/icons-material/ExpandLess'
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt'
import MovieFilterIcon      from '@mui/icons-material/MovieFilter'

const JW_PLAYER_ID = 'Sx2qhN0M'

const AP = {
  accent:    '#6366f1',
  accentHov: '#4f46e5',
  accentDim: 'rgba(99,102,241,0.08)',
  accentBdr: 'rgba(99,102,241,0.3)',
  live:      '#10b981',
  warn:      '#f59e0b',
  warnDim:   'rgba(245,158,11,0.12)',
  danger:    '#ef4444',
  dangerDim: 'rgba(239,68,68,0.14)',
  dangerBdr: 'rgba(239,68,68,0.4)',
  slate:     '#64748b',
  slateDim:  'rgba(100,116,139,0.15)',
  muted:     '#94a3b8',
  text:      '#e2e8f0',
  bg:        '#0b0d14',
  paper:     '#161b2e',
}

const STATE_CFG = {
  offline: { label: 'OFFLINE', color: AP.slate,  dim: AP.slateDim,  pulse: false },
  preview: { label: 'PREVIEW', color: AP.warn,   dim: AP.warnDim,   pulse: false },
  live:    { label: 'LIVE',    color: AP.danger, dim: AP.dangerDim, pulse: true  },
}

const INGEST_FORMAT_LABELS = {
  rtmp: 'RTMP', rtmps: 'RTMPS', srt: 'SRT (Push)', srt_pull: 'SRT (Pull)',
  hls: 'HLS (Push)', hls_pull: 'HLS (Pull)', rtp: 'RTP', rtp_fec: 'RTP + FEC',
}

const DEST_LABELS = { website: 'Website', youtube: 'YouTube', facebook: 'Facebook', app: 'App' }

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

function formatClock(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const s = String(totalSeconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function formatDurationShort(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Ticks once a second while `active`, returning elapsed seconds since `startedAtMs`. */
function useElapsedSeconds(startedAtMs, active) {
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => forceTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [active])
  if (!active || !startedAtMs) return 0
  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
}

// ── Status badge ──
function StatusBadge({ broadcastState }) {
  const cfg = STATE_CFG[broadcastState] || STATE_CFG.offline
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.75,
      px: 1.5, py: 0.5, borderRadius: '20px',
      bgcolor: cfg.dim, border: `1px solid ${cfg.color}55`,
    }}>
      <Box sx={{
        width: 8, height: 8, borderRadius: '50%', bgcolor: cfg.color,
        boxShadow: `0 0 8px ${cfg.color}`,
        animation: cfg.pulse ? 'ecPulseDot 1.4s ease-in-out infinite' : 'none',
        '@keyframes ecPulseDot': { '0%,100%': { opacity: 1, transform: 'scale(1)' }, '50%': { opacity: 0.4, transform: 'scale(0.7)' } },
      }} />
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', color: cfg.color }}>
        {cfg.label}
      </Typography>
    </Box>
  )
}

// ── Copyable value row ──
function CopyRow({ label, value, mask }) {
  const [copied, setCopied]     = useState(false)
  const [revealed, setRevealed] = useState(!mask)

  function handleCopy() {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const displayValue = value
    ? (mask && !revealed ? '•'.repeat(Math.min(28, Math.max(10, value.length))) : value)
    : '— not configured —'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35 }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: AP.muted, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.5,
        bgcolor: '#0a0c12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 1.5,
        px: 1.25, py: 0.75, minWidth: 0,
      }}>
        <Typography sx={{
          flex: 1, minWidth: 0, fontSize: '0.8rem', color: value ? '#4ade80' : AP.muted,
          fontFamily: "'SF Mono','Fira Code',monospace",
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {displayValue}
        </Typography>
        {mask && value && (
          <IconButton size="small" onClick={() => setRevealed(r => !r)} sx={{ color: AP.muted, p: 0.4 }}>
            {revealed ? <VisibilityOffIcon sx={{ fontSize: 15 }} /> : <VisibilityIcon sx={{ fontSize: 15 }} />}
          </IconButton>
        )}
        {value && (
          <IconButton size="small" onClick={handleCopy} sx={{ color: copied ? AP.live : AP.muted, p: 0.4 }}>
            {copied ? <CheckIcon sx={{ fontSize: 15 }} /> : <ContentCopyIcon sx={{ fontSize: 15 }} />}
          </IconButton>
        )}
      </Box>
    </Box>
  )
}

// ── Destination toggle row ──
function DestToggle({ label, color, checked, onChange, disabled, locked }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.25,
      border: `1px solid ${checked ? `${color}55` : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 1.5, px: 1.5, py: 1,
      bgcolor: checked ? `${color}14` : 'rgba(255,255,255,0.02)',
      opacity: disabled ? 0.45 : 1,
    }}>
      <Typography sx={{ flex: 1, fontSize: '0.85rem', fontWeight: 700, color: checked ? '#fff' : AP.muted }}>
        {label}
      </Typography>
      {locked ? (
        <Chip
          size="small" label={checked ? 'Sending' : 'Off'}
          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: checked ? `${color}22` : 'rgba(255,255,255,0.06)', color: checked ? color : AP.muted }}
        />
      ) : (
        <Switch
          checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} size="small"
          sx={{
            '& .MuiSwitch-switchBase.Mui-checked': { color },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: color },
          }}
        />
      )}
    </Box>
  )
}

// ── Broadcast history table ──
function BroadcastHistoryTable({ history, loading }) {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.08em', color: AP.muted, textTransform: 'uppercase', mb: 1.5 }}>
        Broadcast History
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
          <CircularProgress size={24} sx={{ color: AP.accent }} />
        </Box>
      ) : history.length === 0 ? (
        <Box sx={{
          border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 2, p: 4,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        }}>
          <MovieFilterIcon sx={{ fontSize: 28, color: AP.muted, opacity: 0.6 }} />
          <Typography sx={{ fontSize: '0.85rem', color: AP.muted }}>No broadcasts yet for this encoder.</Typography>
        </Box>
      ) : (
        <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { borderColor: 'rgba(255,255,255,0.08)', bgcolor: 'rgba(255,255,255,0.03)' } }}>
                <TableCell sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: AP.muted, textTransform: 'uppercase' }}>Date / Time</TableCell>
                <TableCell sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: AP.muted, textTransform: 'uppercase' }}>Duration</TableCell>
                <TableCell sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: AP.muted, textTransform: 'uppercase' }}>Destinations</TableCell>
                <TableCell sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: AP.muted, textTransform: 'uppercase' }}>Title</TableCell>
                <TableCell sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: AP.muted, textTransform: 'uppercase' }}>Clip</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map(row => {
                const durationSec = row.started_at && row.ended_at
                  ? Math.max(0, (new Date(row.ended_at) - new Date(row.started_at)) / 1000)
                  : null
                const dests = Array.isArray(row.destinations) ? row.destinations : []
                return (
                  <TableRow key={row.id} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.06)' } }}>
                    <TableCell sx={{ fontSize: '0.8rem', color: AP.text }}>{formatDateTime(row.started_at)}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: AP.text }}>{formatDurationShort(durationSec)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {dests.length === 0
                          ? <Typography sx={{ fontSize: '0.72rem', color: 'rgba(148,163,184,0.4)' }}>—</Typography>
                          : dests.map(d => (
                            <Chip key={d} label={DEST_LABELS[d] || d} size="small"
                              sx={{ height: 19, fontSize: '0.63rem', fontWeight: 600, bgcolor: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }} />
                          ))}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: AP.text }}>{row.title || '—'}</TableCell>
                    <TableCell>
                      {row.jw_clip_id ? (
                        <Chip label="Ready" size="small" sx={{ height: 19, fontSize: '0.63rem', fontWeight: 700, bgcolor: 'rgba(16,185,129,0.15)', color: AP.live }} />
                      ) : (
                        <Typography sx={{ fontSize: '0.75rem', color: AP.muted, fontStyle: 'italic' }}>Pending clip…</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  )
}

export default function EncoderControl({ token, tenantId, readOnly }) {
  const { id } = useParams()
  const navigate = useNavigate()

  const [encoder, setEncoder]           = useState(null)
  const [encoderLoading, setEncoderLoading] = useState(true)
  const [encoderError, setEncoderError] = useState('')

  const [youtubeConnected, setYoutubeConnected]   = useState(false)
  const [facebookConnected, setFacebookConnected] = useState(false)

  const [history, setHistory]             = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [broadcastState, setBroadcastState] = useState('offline') // offline | starting_preview | preview | going_live | live | stopping
  const [destinations, setDestinations]     = useState({ website: true, youtube: false, facebook: false, app: false })
  const [liveStartedAt, setLiveStartedAt]   = useState(null)
  const [lastBroadcast, setLastBroadcast]   = useState(null)
  const [credentialsOpen, setCredentialsOpen] = useState(false)

  const elapsed = useElapsedSeconds(liveStartedAt, broadcastState === 'live')

  const fetchEncoder = useCallback(() => {
    if (!token || !tenantId || !id) { setEncoderLoading(false); return }
    setEncoderLoading(true)
    setEncoderError('')
    fetch(`/api/encoders?id=${encodeURIComponent(id)}`, { headers: authHeader(token, tenantId) })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load encoder')
        return data
      })
      .then(setEncoder)
      .catch(err => setEncoderError(err.message))
      .finally(() => setEncoderLoading(false))
  }, [token, tenantId, id])

  useEffect(() => { fetchEncoder() }, [fetchEncoder])

  useEffect(() => {
    if (!token) return
    fetch('/api/youtube-status', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : null)
      .then(data => setYoutubeConnected(!!data?.connected))
      .catch(() => setYoutubeConnected(false))
    fetch('/api/facebook-status', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : null)
      .then(data => setFacebookConnected(!!data?.connected))
      .catch(() => setFacebookConnected(false))
  }, [token, tenantId])

  const fetchHistory = useCallback(() => {
    if (!token || !tenantId || !id) { setHistoryLoading(false); return }
    setHistoryLoading(true)
    fetch(`/api/broadcast-history?encoder_id=${encodeURIComponent(id)}`, { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : { history: [] })
      .then(data => setHistory(data.history || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }, [token, tenantId, id])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  // Seed destination defaults from the encoder's configured simulcast targets, once loaded.
  useEffect(() => {
    if (!encoder) return
    setDestinations({
      website:  encoder.simulcast_website ?? true,
      youtube:  !!(encoder.simulcast_youtube && youtubeConnected),
      facebook: !!(encoder.simulcast_facebook && facebookConnected),
      app:      !!encoder.simulcast_app,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encoder?.id, youtubeConnected, facebookConnected])

  function toggleDest(key, value) {
    setDestinations(prev => ({ ...prev, [key]: value }))
  }

  function handleStartPreview() {
    setBroadcastState('starting_preview')
    setTimeout(() => setBroadcastState('preview'), 1000)
  }

  function handleGoLive() {
    setBroadcastState('going_live')
    setTimeout(() => {
      setLiveStartedAt(Date.now())
      setBroadcastState('live')
    }, 1200)
  }

  function handleStop() {
    setBroadcastState('stopping')
    const startedAt = liveStartedAt
    setTimeout(async () => {
      const endedAt = Date.now()
      const activeDests = Object.entries(destinations).filter(([, v]) => v).map(([k]) => k)

      try {
        await fetch('/api/broadcast-history', {
          method: 'POST',
          headers: authHeader(token, tenantId),
          body: JSON.stringify({
            encoder_id: id,
            started_at: new Date(startedAt).toISOString(),
            ended_at:   new Date(endedAt).toISOString(),
            destinations: activeDests,
          }),
        })
      } catch {
        // Phase 3 will surface a real error path here — for now the UI just moves on.
      }

      setLastBroadcast({ startedAt, endedAt, destinations: activeDests })
      setLiveStartedAt(null)
      setBroadcastState('offline')
      fetchHistory()
    }, 1200)
  }

  const uiState = broadcastState === 'starting_preview' || broadcastState === 'going_live' || broadcastState === 'stopping'
    ? { starting_preview: 'offline', going_live: 'preview', stopping: 'live' }[broadcastState]
    : broadcastState

  const anyDestSelected = Object.values(destinations).some(Boolean)
  const destsLocked = broadcastState === 'live' || broadcastState === 'stopping' || broadcastState === 'going_live'

  const mediaId   = encoder?.channel_id
  const embedUrl  = mediaId ? `https://cdn.jwplayer.com/players/${mediaId}-${JW_PLAYER_ID}.html?autostart=true&mute=true` : null

  if (encoderLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress sx={{ color: AP.accent }} />
      </Box>
    )
  }

  if (encoderError || !encoder) {
    return (
      <Box sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{encoderError || 'Encoder not found.'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/admin/encoders')} sx={{ color: AP.accent }}>
          Back to Encoders
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ── Header bar ── */}
      <Box sx={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5,
        pb: 2, borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Button
            size="small" startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />}
            onClick={() => navigate('/admin/encoders')}
            sx={{ color: AP.muted, fontSize: '0.72rem', px: 0, mb: 0.5, '&:hover': { bgcolor: 'transparent', color: AP.accent } }}
          >
            Encoders
          </Button>
          <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.04em', fontSize: '1.6rem', color: '#fff', lineHeight: 1.1 }}>
            {encoder.name}
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: AP.muted, mt: 0.25 }}>
            {encoder.channel_name || encoder.channel_id}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {broadcastState === 'live' && (
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: AP.danger, fontFamily: "'SF Mono','Fira Code',monospace" }}>
              {formatClock(elapsed)}
            </Typography>
          )}
          <StatusBadge broadcastState={uiState} />
        </Box>
      </Box>

      {/* ── Main area — two columns ── */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2.5 }}>

        {/* ══ LEFT — Preview monitor (60%) ══ */}
        <Box sx={{ flex: { lg: '3 1 0' }, minWidth: 0 }}>
          <Box sx={{
            position: 'relative', width: '100%', aspectRatio: '16 / 9',
            bgcolor: '#000', borderRadius: 2, overflow: 'hidden',
            border: `1px solid ${broadcastState === 'live' ? AP.dangerBdr : 'rgba(255,255,255,0.08)'}`,
            boxShadow: broadcastState === 'live' ? `0 0 0 1px ${AP.dangerBdr}, 0 4px 30px -6px rgba(239,68,68,0.35)` : 'none',
          }}>
            {embedUrl ? (
              <Box component="iframe" src={embedUrl} title="Preview monitor"
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                allow="autoplay; fullscreen" allowFullScreen scrolling="auto"
              />
            ) : (
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>No 24/7 channel assigned</Typography>
              </Box>
            )}

            {/* Top-left status overlay */}
            <Box sx={{ position: 'absolute', top: 12, left: 12, zIndex: 2 }}>
              {broadcastState === 'live' ? (
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 0.6,
                  bgcolor: 'rgba(239,68,68,0.9)', px: 1.1, py: 0.4, borderRadius: '4px',
                }}>
                  <FiberManualRecordIcon sx={{
                    fontSize: 11, color: '#fff',
                    animation: 'ecLiveDotPulse 1.2s ease-in-out infinite',
                    '@keyframes ecLiveDotPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                  }} />
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', color: '#fff' }}>LIVE</Typography>
                </Box>
              ) : (
                <Box sx={{
                  bgcolor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)',
                  px: 1.1, py: 0.4, borderRadius: '4px',
                }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.75)' }}>
                    PREVIEW
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Top-right signal quality indicator */}
            <Box sx={{
              position: 'absolute', top: 12, right: 12, zIndex: 2,
              display: 'flex', alignItems: 'center', gap: 0.5,
              bgcolor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', px: 1, py: 0.35,
            }}>
              <SignalCellularAltIcon sx={{ fontSize: 14, color: AP.live }} />
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: AP.live }}>Healthy</Typography>
            </Box>
          </Box>
        </Box>

        {/* ══ RIGHT — Controls panel (40%) ══ */}
        <Box sx={{ flex: { lg: '2 1 0' }, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Destinations */}
          <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', color: AP.muted, textTransform: 'uppercase', mb: 0.25 }}>
              Destinations
            </Typography>
            <DestToggle label="Website (BrightSpot)" color={AP.live} checked={destinations.website}
              onChange={v => toggleDest('website', v)} disabled={readOnly || destsLocked} locked={destsLocked} />
            {youtubeConnected && (
              <DestToggle label="YouTube" color="#ff0000" checked={destinations.youtube}
                onChange={v => toggleDest('youtube', v)} disabled={readOnly || destsLocked} locked={destsLocked} />
            )}
            {facebookConnected && (
              <DestToggle label="Facebook" color="#1877F2" checked={destinations.facebook}
                onChange={v => toggleDest('facebook', v)} disabled={readOnly || destsLocked} locked={destsLocked} />
            )}
            <DestToggle label="App (MRSS)" color={AP.accent} checked={destinations.app}
              onChange={v => toggleDest('app', v)} disabled={readOnly || destsLocked} locked={destsLocked} />
          </Box>

          {/* Go Live section */}
          <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {broadcastState === 'offline' && (
              <Button
                fullWidth variant="contained" startIcon={<PlayArrowIcon />}
                onClick={handleStartPreview} disabled={readOnly}
                sx={{ bgcolor: AP.warn, color: '#1a1200', fontWeight: 800, py: 1.1, '&:hover': { bgcolor: '#d97706' } }}
              >
                Start Preview
              </Button>
            )}

            {broadcastState === 'starting_preview' && (
              <Button fullWidth variant="contained" disabled
                sx={{ bgcolor: AP.warn, color: '#1a1200', fontWeight: 800, py: 1.1, opacity: 0.7 }}
              >
                <CircularProgress size={16} sx={{ color: '#1a1200', mr: 1 }} /> Starting preview…
              </Button>
            )}

            {(broadcastState === 'preview' || broadcastState === 'going_live') && (
              <Button
                fullWidth variant="contained" startIcon={broadcastState === 'going_live' ? null : <FiberManualRecordIcon />}
                onClick={handleGoLive} disabled={readOnly || broadcastState === 'going_live' || !anyDestSelected}
                sx={{
                  bgcolor: AP.danger, color: '#fff', fontWeight: 800, py: 1.3, fontSize: '1rem', letterSpacing: '0.04em',
                  '&:hover': { bgcolor: '#dc2626' }, '&.Mui-disabled': { bgcolor: 'rgba(239,68,68,0.35)', color: 'rgba(255,255,255,0.5)' },
                }}
              >
                {broadcastState === 'going_live' ? (<><CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} /> Going live…</>) : 'GO LIVE'}
              </Button>
            )}
            {broadcastState === 'preview' && !anyDestSelected && (
              <Typography sx={{ fontSize: '0.7rem', color: AP.warn, textAlign: 'center' }}>Select at least one destination to go live.</Typography>
            )}

            {(broadcastState === 'live' || broadcastState === 'stopping') && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 0.5 }}>
                  <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: AP.danger, fontFamily: "'SF Mono','Fira Code',monospace" }}>
                    {formatClock(elapsed)}
                  </Typography>
                </Box>
                <Button
                  fullWidth variant="contained" startIcon={<StopIcon />}
                  onClick={handleStop} disabled={readOnly || broadcastState === 'stopping'}
                  sx={{ bgcolor: '#7f1d1d', color: '#fecaca', fontWeight: 800, py: 1.1, '&:hover': { bgcolor: '#991b1b' } }}
                >
                  {broadcastState === 'stopping' ? (<><CircularProgress size={16} sx={{ color: '#fecaca', mr: 1 }} /> Ending broadcast…</>) : 'STOP BROADCAST'}
                </Button>
              </>
            )}
          </Box>

          {/* Broadcast info */}
          {(broadcastState === 'live' || broadcastState === 'stopping' || lastBroadcast) && (
            <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, p: 2, display: 'flex', flexDirection: 'column', gap: 0.9 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', color: AP.muted, textTransform: 'uppercase' }}>
                Broadcast Info
              </Typography>
              {(() => {
                const isLiveNow = broadcastState === 'live' || broadcastState === 'stopping'
                const startedAt = isLiveNow ? liveStartedAt : lastBroadcast?.startedAt
                const activeDests = isLiveNow
                  ? Object.entries(destinations).filter(([, v]) => v).map(([k]) => k)
                  : (lastBroadcast?.destinations || [])
                return (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '0.78rem', color: AP.muted }}>Start time</Typography>
                      <Typography sx={{ fontSize: '0.78rem', color: AP.text }}>{startedAt ? formatDateTime(startedAt) : '—'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.78rem', color: AP.muted }}>Active destinations</Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {activeDests.length === 0
                          ? <Typography sx={{ fontSize: '0.78rem', color: AP.text }}>—</Typography>
                          : activeDests.map(d => (
                            <Chip key={d} label={DEST_LABELS[d] || d} size="small"
                              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, bgcolor: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }} />
                          ))}
                      </Box>
                    </Box>
                    {!isLiveNow && lastBroadcast && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.78rem', color: AP.muted }}>Clip status</Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: AP.muted, fontStyle: 'italic' }}>Pending clip…</Typography>
                      </Box>
                    )}
                  </>
                )
              })()}
            </Box>
          )}

          {/* Encoder credentials */}
          <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <Box
              onClick={() => setCredentialsOpen(o => !o)}
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}
            >
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', color: AP.muted, textTransform: 'uppercase' }}>
                Encoder Credentials
              </Typography>
              <IconButton size="small" sx={{ color: AP.muted, p: 0.3 }}>
                {credentialsOpen ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Box>
            <Collapse in={credentialsOpen}>
              <Box sx={{ px: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <CopyRow label="Ingest URL" value={encoder.ingest_url} />
                <CopyRow label="Stream Key" value={encoder.stream_key} mask />
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.25 }}>
                  <Chip label={INGEST_FORMAT_LABELS[encoder.ingest_format] || encoder.ingest_format} size="small"
                    sx={{ height: 22, fontSize: '0.68rem', fontWeight: 700, bgcolor: AP.accentDim, color: AP.accent, border: `1px solid ${AP.accentBdr}` }} />
                  <Chip label={encoder.region} size="small"
                    sx={{ height: 22, fontSize: '0.68rem', fontWeight: 700, bgcolor: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }} />
                </Box>
              </Box>
            </Collapse>
          </Box>
        </Box>
      </Box>

      <BroadcastHistoryTable history={history} loading={historyLoading} />
    </Box>
  )
}
