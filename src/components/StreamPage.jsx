import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { Box, Typography, IconButton, Tooltip, CircularProgress, Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material'
import ArrowBackIcon   from '@mui/icons-material/ArrowBack'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon     from '@mui/icons-material/Refresh'
import PlayArrowIcon   from '@mui/icons-material/PlayArrow'
import PlayCircleIcon  from '@mui/icons-material/PlayCircle'
import DeleteIcon      from '@mui/icons-material/Delete'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import LinkIcon        from '@mui/icons-material/Link'
import VpnKeyIcon      from '@mui/icons-material/VpnKey'
import LocationOnIcon  from '@mui/icons-material/LocationOn'
import { useTenant }   from '../contexts/TenantContext'
import VideoPlayer     from './VideoPlayer'

const SESSION_KEY       = 'ri_admin_token'
const ACTIVE_TENANT_KEY = 'ri_active_tenant'
const ROLE_KEY          = 'ri_admin_role'

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  active:     { label: 'Live',       color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.35)' },
  streaming:  { label: 'Live',       color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.35)' },
  requested:  { label: 'Scheduled',  color: '#818cf8', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.35)' },
  scheduled:  { label: 'Scheduled',  color: '#818cf8', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.35)' },
  creating:   { label: 'Creating',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)' },
  starting:   { label: 'Starting',   color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.3)'  },
  ready:      { label: 'Ready',      color: '#57BB95', bg: 'rgba(87,187,149,0.15)', border: 'rgba(87,187,149,0.35)' },
  preview:    { label: 'Preview',    color: '#38bdf8', bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.35)' },
  idle:       { label: 'Idle',       color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)' },
  stopping:   { label: 'Stopping',   color: '#f87171', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)'  },
  destroying: { label: 'Destroying', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)' },
  deleting:   { label: 'Deleting',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)' },
}
const FORMAT_MAP = {
  rtmp:     { label: 'RTMP',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
  rtmps:    { label: 'RTMPS',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
  srt:      { label: 'SRT Push', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.3)'  },
  srt_pull: { label: 'SRT Pull', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.3)'  },
  hls:      { label: 'HLS',      color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
  rtp:      { label: 'RTP',      color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)'  },
  rtp_fec:  { label: 'RTP FEC',  color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)'  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTzLabel(tz) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortGeneric' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || tz
  } catch { return tz }
}
function fmtDateTime(iso, tz) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: tz,
  })
}
function fmtTime(iso, tz) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
}
function fmtDuration(a, b) {
  if (!a || !b) return null
  const ms = new Date(b) - new Date(a)
  if (ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
}
const pad = n => String(n).padStart(2, '0')
function fmtMins(totalMins) {
  const m = Math.ceil(totalMins)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h < 24) return rem > 0 ? `${h}h ${rem}m` : `${h}h`
  const d = Math.floor(h / 24)
  const remH = h % 24
  if (remH === 0) return `${d}d`
  return rem > 0 ? `${d}d ${remH}h ${rem}m` : `${d}d ${remH}h`
}

// ─── Countdown ────────────────────────────────────────────────────────────────
function Countdown({ targetIso, compact = false }) {
  const [parts, setParts] = useState(null)
  useEffect(() => {
    function calc() {
      const ms = new Date(targetIso) - Date.now()
      if (ms <= 0) { setParts(null); return }
      const t = Math.floor(ms / 1000)
      setParts({ d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 })
    }
    calc(); const id = setInterval(calc, 1000); return () => clearInterval(id)
  }, [targetIso])

  if (!parts) return null

  if (compact) {
    const { d, h, m, s } = parts
    const str = d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m`
      : h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}`
      : `${pad(m)}:${pad(s)}`
    return (
      <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#ffffff', fontFamily: '"Roboto Mono", monospace', letterSpacing: '0.04em' }}>
        {str}
      </Typography>
    )
  }

  const segs = [
    ...(parts.d > 0 ? [{ v: parts.d, l: 'days' }] : []),
    ...(parts.d > 0 || parts.h > 0 ? [{ v: parts.h, l: 'hrs' }] : []),
    { v: parts.m, l: 'min' },
    { v: parts.s, l: 'sec' },
  ]

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 0.5, md: 0.75 } }}>
      {segs.map(({ v, l }, i) => (
        <React.Fragment key={l}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: { xs: 44, md: 58 } }}>
            <Typography sx={{ fontSize: { xs: '2.4rem', md: '3.4rem' }, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 32px rgba(99,102,241,0.5)' }}>
              {pad(v)}
            </Typography>
            <Typography sx={{ fontSize: '0.52rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', mt: 0.4 }}>{l}</Typography>
          </Box>
          {i < segs.length - 1 && (
            <Typography sx={{ fontSize: { xs: '1.5rem', md: '2.2rem' }, color: 'rgba(255,255,255,0.14)', lineHeight: 1, mt: '2px', fontWeight: 300 }}>:</Typography>
          )}
        </React.Fragment>
      ))}
    </Box>
  )
}

// ─── FeedCard ─────────────────────────────────────────────────────────────────
// A 16:9 feed card with source label, status badge, and inner content
function FeedCard({ label, logo, accentColor = '#6366f1', isLive, children }) {
  return (
    <Box sx={{
      borderRadius: 2.5,
      overflow: 'hidden',
      bgcolor: '#060810',
      border: `1px solid ${isLive ? `${accentColor}66` : 'rgba(255,255,255,0.14)'}`,
      boxShadow: isLive
        ? `0 0 48px ${accentColor}22, 0 4px 32px rgba(0,0,0,0.6)`
        : '0 2px 20px rgba(0,0,0,0.5)',
      transition: 'box-shadow 0.5s, border-color 0.5s',
    }}>
      {/* Source header bar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 1.5, py: 1,
        bgcolor: 'rgba(255,255,255,0.04)',
        borderBottom: `1px solid rgba(255,255,255,0.1)`,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {logo}
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>
            {label}
          </Typography>
        </Box>
        {isLive && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.9, py: 0.25, borderRadius: '20px', bgcolor: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)' }}>
            <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#10b981', boxShadow: '0 0 5px #10b981',
              animation: 'liveDot 1.8s ease-in-out infinite',
              '@keyframes liveDot': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
            <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: '#10b981', textTransform: 'uppercase' }}>Live</Typography>
          </Box>
        )}
      </Box>

      {/* 16:9 content area */}
      <Box sx={{ position: 'relative', width: '100%', paddingTop: '56.25%' }}>
        <Box sx={{ position: 'absolute', inset: 0 }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}


// ─── CredCard ─────────────────────────────────────────────────────────────────
// YouTube-Studio-style: label above, full-width field row + Copy button
function CredCard({ label, value, field, icon: Icon, copied, onCopy }) {
  const ok = copied === field
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mb: 0.65 }}>
        {Icon && <Icon sx={{ fontSize: 10, color: 'rgba(148,163,184,0.55)' }} />}
        <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.11em', color: 'rgba(148,163,184,0.6)', textTransform: 'uppercase' }}>
          {label}
        </Typography>
      </Box>
      <Box sx={{
        display: 'flex', alignItems: 'center',
        bgcolor: 'rgba(0,0,0,0.35)',
        border: `1px solid ${ok ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.13)'}`,
        borderRadius: 1.5,
        pl: 1.5, pr: 0.75, py: 0.85,
        gap: 1,
        transition: 'border-color 0.2s',
      }}>
        <Typography sx={{
          flex: 1, minWidth: 0,
          fontSize: '0.75rem', color: ok ? '#6ee7b7' : '#e2e8f0',
          fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.45,
          transition: 'color 0.2s',
        }}>
          {value || '—'}
        </Typography>
        {field && value && (
          <Button
            size="small"
            onClick={() => onCopy(field, value)}
            sx={{
              flexShrink: 0, fontSize: '0.65rem', fontWeight: 700,
              letterSpacing: '0.04em', minWidth: 54, px: 1.25, py: 0.4,
              color: ok ? '#10b981' : 'rgba(168,188,212,0.8)',
              bgcolor: ok ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.07)',
              border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 1,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.13)', color: '#fff', borderColor: 'rgba(255,255,255,0.25)' },
            }}
          >
            {ok ? '✓' : 'Copy'}
          </Button>
        )}
      </Box>
    </Box>
  )
}

// ─── Section divider ──────────────────────────────────────────────────────────
function SectionHead({ logo, label, isLive, accentColor = '#6366f1' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      {/* Left accent bar */}
      <Box sx={{ width: 3, height: 16, borderRadius: '2px', bgcolor: accentColor, flexShrink: 0 }} />
      {logo && <Box sx={{ display: 'flex', alignItems: 'center' }}>{logo}</Box>}
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.88)', textTransform: 'uppercase', flex: 1 }}>{label}</Typography>
      {isLive && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.75, py: 0.2, borderRadius: '20px', bgcolor: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#10b981', boxShadow: '0 0 4px #10b981' }} />
          <Typography sx={{ fontSize: '0.52rem', fontWeight: 700, color: '#10b981', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Live</Typography>
        </Box>
      )}
    </Box>
  )
}

function InfoRow({ label, value, mono }) {
  if (!value) return null
  return (
    <Box>
      <Typography sx={{ fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(148,163,184,0.55)', textTransform: 'uppercase', mb: 0.45 }}>{label}</Typography>
      <Typography sx={{ fontSize: { xs: '0.875rem', sm: '0.83rem' }, color: '#e2e8f0', fontFamily: mono ? 'monospace' : 'inherit', fontWeight: 500, lineHeight: 1.4, wordBreak: mono ? 'break-all' : 'normal' }}>{value}</Typography>
    </Box>
  )
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const darkTheme = createTheme({
  palette: { mode: 'dark', background: { default: '#07090f', paper: '#0c1120' } },
  typography: { fontFamily: "'Poppins', sans-serif" },
  shape: { borderRadius: 8 },
  components: { MuiCssBaseline: { styleOverrides: { body: { backgroundColor: '#07090f' } } } },
})

// ─── StreamPage ───────────────────────────────────────────────────────────────
export default function StreamPage() {
  const { id }                = useParams()
  const { state: routeState } = useLocation()
  const navigate              = useNavigate()
  const { tenant }            = useTenant()
  const TZ                    = tenant?.timezone || 'America/New_York'
  const tzLabel               = getTzLabel(TZ)

  const [channel,          setChannel]          = useState(null) // always null — avoids stale routeState triggering wrong animations
  const [loading,          setLoading]          = useState(true)
  const [refreshing,       setRefreshing]       = useState(false)
  const [copied,           setCopied]           = useState(null)
  const [previewUnlocked,  setPreviewUnlocked]  = useState(false)
  const [minsUntilPreview, setMinsUntilPreview] = useState(null)
  const [deleteOpen,       setDeleteOpen]       = useState(false)
  const [deleting,         setDeleting]         = useState(false)
  const [deleteError,      setDeleteError]      = useState(null)
  const [starting,         setStarting]         = useState(false)
  const [startError,       setStartError]       = useState(null)
  const [waitingForStart,  setWaitingForStart]  = useState(false)
  const [goingLive,        setGoingLive]        = useState(false)
  const [goLiveError,      setGoLiveError]      = useState(null)
  const [waitingForLive,   setWaitingForLive]   = useState(false)
  const [stopOpen,         setStopOpen]         = useState(false)
  const [stopping,         setStopping]         = useState(false)
  const [stopError,        setStopError]        = useState(null)
  const [waitingForStop,   setWaitingForStop]   = useState(false)
  const startPollRef  = useRef(null)
  const goLivePollRef = useRef(null)
  const stopPollRef   = useRef(null)

  const token    = sessionStorage.getItem(SESSION_KEY)
  const tenantId = sessionStorage.getItem(ACTIVE_TENANT_KEY)
  const role     = sessionStorage.getItem(ROLE_KEY)
  const readOnly = role === 'read_only'

  useEffect(() => { if (!token) navigate('/admin') }, [token, navigate])

  const fetchChannel = useCallback(async (quiet = false) => {
    if (!token) return
    quiet ? setRefreshing(true) : setLoading(true)
    try {
      const res  = await fetch('/api/channels', { headers: authHeader(token, tenantId) })
      const data = await res.json()
      const ch   = (data.channels || []).find(c => c.id === id)
      if (ch) setChannel(ch)
    } catch (e) { console.error(e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [id, token, tenantId])

  useEffect(() => {
    fetchChannel(false) // always load fresh — ignore potentially stale routeState on browser refresh
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh for active / scheduled / transitional streams
  useEffect(() => {
    const s = channel?.status?.toLowerCase()
    if (!['active', 'streaming', 'requested', 'scheduled', 'creating', 'starting', 'ready', 'stopping'].includes(s)) return
    const timer = setInterval(() => fetchChannel(true), 30_000)
    return () => clearInterval(timer)
  }, [channel?.status, fetchChannel])

  // When page loads into a transient state (someone else triggered it), auto-start the right poll
  useEffect(() => {
    const s = channel?.status?.toLowerCase()

    // In creating/starting with no active poll → kick off a start poll
    if ((s === 'creating' || s === 'starting') && !startPollRef.current && !waitingForStart) {
      setWaitingForStart(true)
      startPollRef.current = setInterval(async () => {
        try {
          const r    = await fetch('/api/channels', { headers: authHeader(token, tenantId) })
          const body = await r.json()
          const ch   = (body.channels || []).find(c => c.id === id)
          if (ch) {
            setChannel(ch)
            const st = ch.status?.toLowerCase()
            if (!['creating', 'starting'].includes(st)) {
              stopStartPoll()
              setWaitingForStart(false)
            }
          }
        } catch (_) {}
      }, 4_000)
    }

    // In stopping with no active poll → kick off a stop poll
    if (s === 'stopping' && !stopPollRef.current && !waitingForStop) {
      setWaitingForStop(true)
      stopPollRef.current = setInterval(async () => {
        try {
          const r    = await fetch('/api/channels', { headers: authHeader(token, tenantId) })
          const body = await r.json()
          const ch   = (body.channels || []).find(c => c.id === id)
          if (ch) {
            setChannel(ch)
            const st = ch.status?.toLowerCase()
            if (st === 'idle' || st === 'stopped') {
              stopStopPoll()
              setWaitingForStop(false)
              navigate('/admin')
            }
          } else {
            // Channel no longer in list — destroyed
            stopStopPoll()
            setWaitingForStop(false)
            navigate('/admin')
          }
        } catch (_) {}
      }, 4_000)
    }
  }, [channel?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Preview-unlock timer (CDN warmup 15 min before go-live)
  useEffect(() => {
    if (!channel?.stream_start) return
    function check() {
      const mins = (new Date(channel.stream_start) - Date.now()) / 60_000
      setPreviewUnlocked(mins <= 15)
      setMinsUntilPreview(mins)
    }
    check(); const timer = setInterval(check, 15_000); return () => clearInterval(timer)
  }, [channel?.stream_start])

  function copy(field, value) {
    navigator.clipboard.writeText(value)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  // Stop any running start-poll
  function stopStartPoll() {
    if (startPollRef.current) {
      clearInterval(startPollRef.current)
      startPollRef.current = null
    }
  }

  async function startStream() {
    if (!token || !channel) return
    const fromStatus = channel.status?.toLowerCase()   // capture before the call
    setStarting(true)
    setStartError(null)
    try {
      const res = await fetch('/api/start-stream', {
        method: 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({ id: channel.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        const parts = [data.error, data.site_id && `site=${data.site_id}`, data.url_hit, data.detail].filter(Boolean)
        setStartError(parts.join(' | ') || `Error ${res.status}`)
        setStarting(false)
        return
      }
      // Poll until status moves away from whatever it was when we clicked
      setStarting(false)
      setWaitingForStart(true)
      await fetchChannel(true)
      startPollRef.current = setInterval(async () => {
        try {
          const r    = await fetch('/api/channels', { headers: authHeader(token, tenantId) })
          const body = await r.json()
          const ch   = (body.channels || []).find(c => c.id === id)
          if (ch) {
            setChannel(ch)
            const st = ch.status?.toLowerCase()
            // Keep polling through transient states; stop only at a stable state
            const isTransient = st === 'creating' || st === 'starting'
            if (!isTransient && st !== fromStatus) {
              stopStartPoll()
              setWaitingForStart(false)
            }
          }
        } catch (_) { /* ignore transient errors */ }
      }, 4_000)
    } catch (e) {
      setStartError(e.message)
      setStarting(false)
    }
  }

  // Stop any running go-live poll
  function stopGoLivePoll() {
    if (goLivePollRef.current) {
      clearInterval(goLivePollRef.current)
      goLivePollRef.current = null
    }
  }

  async function goLive() {
    if (!token || !channel) return
    setGoingLive(true)
    setGoLiveError(null)
    try {
      const res = await fetch('/api/go-live', {
        method: 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({ id: channel.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        const parts = [data.error, data.detail].filter(Boolean)
        setGoLiveError(parts.join(' — ') || `Error ${res.status}`)
        setGoingLive(false)
        return
      }
      // Signal sent — poll every 4 s until status becomes active/streaming
      setGoingLive(false)
      setWaitingForLive(true)
      await fetchChannel(true)
      // If fetchChannel already returned active/streaming, no need to poll
      setChannel(prev => {
        const st = prev?.status?.toLowerCase()
        if (st === 'active' || st === 'streaming') {
          stopGoLivePoll()
          setWaitingForLive(false)
        }
        return prev
      })
      goLivePollRef.current = setInterval(async () => {
        try {
          const r    = await fetch('/api/channels', { headers: authHeader(token, tenantId) })
          const body = await r.json()
          const ch   = (body.channels || []).find(c => c.id === id)
          if (ch) {
            setChannel(ch)
            const st = ch.status?.toLowerCase()
            if (st === 'active' || st === 'streaming') {
              stopGoLivePoll()
              setWaitingForLive(false)
            }
          }
        } catch (_) { /* ignore transient errors */ }
      }, 4_000)
    } catch (e) {
      setGoLiveError(e.message)
      setGoingLive(false)
    }
  }

  // Stop any running stop-poll
  function stopStopPoll() {
    if (stopPollRef.current) {
      clearInterval(stopPollRef.current)
      stopPollRef.current = null
    }
  }

  async function stopStream() {
    if (!token || !channel) return
    setStopping(true)
    setStopError(null)
    // Clear any in-progress go-live transition
    stopGoLivePoll()
    setWaitingForLive(false)
    try {
      const res = await fetch('/api/stop-stream', {
        method: 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({ id: channel.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        const parts = [data.error, data.detail].filter(Boolean)
        setStopError(parts.join(' — ') || `Error ${res.status}`)
        setStopping(false)
        return
      }
      // Signal sent — close dialog and poll every 4 s until status returns to idle
      setStopping(false)
      setStopOpen(false)
      setWaitingForStop(true)
      await fetchChannel(true)
      stopPollRef.current = setInterval(async () => {
        try {
          const r    = await fetch('/api/channels', { headers: authHeader(token, tenantId) })
          const body = await r.json()
          const ch   = (body.channels || []).find(c => c.id === id)
          if (ch) {
            setChannel(ch)
            const st = ch.status?.toLowerCase()
            if (st === 'idle' || st === 'stopped') {
              stopStopPoll()
              setWaitingForStop(false)
              navigate('/admin')
            }
          } else {
            // Channel no longer exists in the list — destroyed
            stopStopPoll()
            setWaitingForStop(false)
            navigate('/admin')
          }
        } catch (_) { /* ignore transient errors */ }
      }, 4_000)
    } catch (e) {
      setStopError(e.message)
      setStopping(false)
    }
  }

  // Clean up polls on unmount
  useEffect(() => () => { stopStartPoll(); stopGoLivePoll(); stopStopPoll() }, [])

  async function deleteStream() {
    if (!token || !channel) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/delete-stream', {
        method: 'DELETE',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({
          id:                     channel.id,
          name:                   channel.name,
          youtube_broadcast_id:   channel.youtube_broadcast_id   || null,
          youtube_stream_id:      channel.youtube_stream_id      || null,
          facebook_live_video_id: channel.facebook_live_video_id || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDeleteError(data.error || `Error ${res.status}`)
        setDeleting(false)
        return
      }
      navigate('/admin')
    } catch (e) {
      setDeleteError(e.message)
      setDeleting(false)
    }
  }

  // ── Loading / not found ──────────────────────────────────────────────────────
  if (loading) return (
    <ThemeProvider theme={darkTheme}><CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#07090f' }}>
        <CircularProgress sx={{ color: '#6366f1' }} />
      </Box>
    </ThemeProvider>
  )

  if (!channel) return (
    <ThemeProvider theme={darkTheme}><CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, bgcolor: '#07090f' }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.35)' }}>Stream not found</Typography>
        <Button onClick={() => navigate('/admin')} startIcon={<ArrowBackIcon />} sx={{ color: '#6366f1' }}>Back to Admin</Button>
      </Box>
    </ThemeProvider>
  )

  // ── Derived ──────────────────────────────────────────────────────────────────
  const s          = channel.status?.toLowerCase()
  const isLive     = s === 'active' || s === 'streaming'
  const isScheduled = !isLive && !!channel.stream_start && new Date(channel.stream_start) > Date.now()
  // When waiting for a start transition, show the pill as "starting" immediately
  // so there's no gap between clicking and the status actually changing
  const pillStatus  = (s === 'ready' && (waitingForStart || starting)) ? 'starting' : s
  const statusCfg   = STATUS_CFG[pillStatus] || STATUS_CFG.idle
  const fmt        = channel.ingest_format
    ? (FORMAT_MAP[channel.ingest_format] || { label: channel.ingest_format.toUpperCase(), color: '#94a3b8', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)' })
    : null
  const hasYoutube  = !!channel.youtube_broadcast_id
  const hasFacebook = !!channel.facebook_live_video_id
  const duration    = fmtDuration(channel.stream_start, channel.stream_end)

  // ── CDN feed inner content ───────────────────────────────────────────────────
  const cdnContent = () => {
    if (isLive && channel.stream_url) {
      return <VideoPlayer cameraUrl={channel.stream_url} plain key={channel.id} />
    }
    if (isLive) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#10b981', boxShadow: '0 0 14px #10b981',
            animation: 'lp 1.6s ease-in-out infinite',
            '@keyframes lp': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.25 } } }} />
          <Typography sx={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}>CDN propagating…</Typography>
        </Box>
      )
    }
    if (isScheduled && previewUnlocked && channel.stream_url) {
      return <VideoPlayer cameraUrl={channel.stream_url} plain key={channel.id} />
    }
    if (isScheduled) {
      return (
        <Box sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', gap: 2.5,
          background: 'radial-gradient(ellipse at 50% 55%, rgba(99,102,241,0.1) 0%, transparent 65%)',
        }}>
          {/* Orbit rings */}
          {[48, 65, 82].map((size, i) => (
            <Box key={i} sx={{
              position: 'absolute', width: `${size}%`, paddingTop: `${size}%`,
              borderRadius: '50%', border: `1px solid rgba(99,102,241,${0.12 - i * 0.03})`,
              animation: `ring${i} ${3 + i * 1.5}s ease-in-out infinite`,
              [`@keyframes ring${i}`]: { '0%,100%': { transform: 'scale(1)', opacity: 0.7 }, '50%': { transform: 'scale(1.025)', opacity: 0.2 } },
            }} />
          ))}

          <Box sx={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{
              fontSize: { xs: '1.05rem', md: '1.3rem' }, fontWeight: 700,
              color: 'rgba(255,255,255,0.82)', letterSpacing: '0.01em',
              textAlign: 'center', px: 2, lineHeight: 1.25,
            }}>
              {channel.name}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>
                Live in
              </Typography>
              <Countdown targetIso={channel.stream_start} />
            </Box>
          </Box>

          {/* Preview unlock indicator */}
          <Box sx={{ zIndex: 1, display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.6, borderRadius: '20px',
            bgcolor: previewUnlocked ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${previewUnlocked ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
            <PlayArrowIcon sx={{ fontSize: 11, color: previewUnlocked ? '#10b981' : 'rgba(255,255,255,0.25)' }} />
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, color: previewUnlocked ? '#10b981' : 'rgba(255,255,255,0.3)' }}>
              {previewUnlocked
                ? 'Preview now available'
                : minsUntilPreview != null && minsUntilPreview > 15
                  ? `Preview in ${fmtMins(minsUntilPreview - 15)}`
                  : 'Preview available 15 min before go-live'}
            </Typography>
          </Box>
        </Box>
      )
    }
    // Starting state — rings contract inward (CDN connecting), same family as creating/ready
    // Also show when ready→starting transition is in progress (waitingForStart)
    if (s === 'starting' || (s === 'ready' && (waitingForStart || starting))) {
      return (
        <Box sx={{
          position: 'relative',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', overflow: 'hidden',
          background: 'radial-gradient(ellipse at 50% 50%, rgba(56,189,248,0.1) 0%, transparent 68%)',
        }}>
          {/* Rings begin large and collapse inward toward center */}
          {[1, 2, 3, 4, 5].map(i => (
            <Box key={i} sx={{
              position: 'absolute',
              left: '50%', top: '50%',
              transform: 'translate(-50%, -50%)',
              width: `${(6 - i) * 22}%`,
              aspectRatio: '1',
              borderRadius: '50%',
              border: `1.5px solid rgba(56,189,248,${0.75 - (5 - i) * 0.1})`,
              opacity: 0,
              animation: `startCollapse 3.2s ease-in ${(i - 1) * 0.55}s infinite`,
              '@keyframes startCollapse': {
                '0%':   { transform: 'translate(-50%, -50%) scale(1)',    opacity: 0.85 },
                '100%': { transform: 'translate(-50%, -50%) scale(0.08)', opacity: 0    },
              },
            }} />
          ))}

          {/* Label — absolutely centered */}
          <Box sx={{
            position: 'absolute', zIndex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
          }}>
            <Typography sx={{
              fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.22em',
              color: '#38bdf8', textTransform: 'uppercase',
              animation: 'fadeLblBlue 2.2s ease-in-out infinite',
              '@keyframes fadeLblBlue': { '0%,100%': { opacity: 0.4 }, '50%': { opacity: 1 } },
            }}>
              Starting Preview
            </Typography>
            <Typography sx={{ fontSize: '0.8rem', color: 'rgba(56,189,248,0.45)', letterSpacing: '0.08em' }}>
              CDN warming up…
            </Typography>
          </Box>
        </Box>
      )
    }

    // Preview state — stream is playing but not yet public
    if (s === 'preview') {
      if (channel.stream_url) {
        return (
          <Box sx={{ position: 'relative', height: '100%' }}>
            <VideoPlayer cameraUrl={channel.stream_url} plain key={channel.id} />
            {/* Preview badge — top-left overlay on the player */}
            <Box sx={{
              position: 'absolute', top: 10, left: 12, zIndex: 10,
              display: 'flex', alignItems: 'center', gap: 0.55,
              px: 1, py: 0.35, borderRadius: '20px',
              bgcolor: 'rgba(56,189,248,0.18)',
              border: '1px solid rgba(56,189,248,0.45)',
              backdropFilter: 'blur(4px)',
            }}>
              <Box sx={{
                width: 5, height: 5, borderRadius: '50%', bgcolor: '#38bdf8',
                boxShadow: '0 0 5px #38bdf8',
                animation: 'pvwDot 2s ease-in-out infinite',
                '@keyframes pvwDot': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
              }} />
              <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', color: '#38bdf8', textTransform: 'uppercase' }}>
                Preview
              </Typography>
            </Box>
          </Box>
        )
      }
      return (
        <Box sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', gap: 2,
          background: 'radial-gradient(ellipse at 50% 55%, rgba(56,189,248,0.07) 0%, transparent 65%)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {[0, 1, 2].map(i => (
              <Box key={i} sx={{
                width: 10, height: 10, borderRadius: '50%',
                bgcolor: '#38bdf8',
                animation: `previewDot 1.4s ease-in-out ${i * 0.22}s infinite`,
                '@keyframes previewDot': {
                  '0%,100%': { transform: 'scale(0.55)', opacity: 0.3 },
                  '50%':     { transform: 'scale(1)',    opacity: 1 },
                },
              }} />
            ))}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.4 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', color: '#38bdf8', textTransform: 'uppercase' }}>
              Preview
            </Typography>
            <Typography sx={{ fontSize: '0.62rem', color: 'rgba(56,189,248,0.55)', letterSpacing: '0.06em' }}>
              CDN propagating…
            </Typography>
          </Box>
        </Box>
      )
    }

    // Ready state — large green sonar rings expanding to fill the frame
    if (s === 'ready') {
      return (
        <Box sx={{
          position: 'relative',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', overflow: 'hidden',
          background: 'radial-gradient(ellipse at 50% 50%, rgba(87,187,149,0.12) 0%, transparent 68%)',
        }}>
          {/* Sonar rings — expand to fill/overflow the frame */}
          {[1, 2, 3, 4, 5].map(i => (
            <Box key={i} sx={{
              position: 'absolute',
              left: '50%', top: '50%',
              transform: 'translate(-50%, -50%)',
              width: `${i * 22}%`,
              aspectRatio: '1',
              borderRadius: '50%',
              border: `1.5px solid rgba(87,187,149,${0.8 - i * 0.1})`,
              opacity: 0,
              animation: `readySonar 3.2s ease-out ${(i - 1) * 0.55}s infinite`,
              '@keyframes readySonar': {
                '0%':   { transform: 'translate(-50%, -50%) scale(0.1)', opacity: 0.95 },
                '100%': { transform: 'translate(-50%, -50%) scale(1)',   opacity: 0 },
              },
            }} />
          ))}

          {/* Label — absolutely centered over the rings */}
          <Box sx={{
            position: 'absolute', zIndex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
          }}>
            <Typography sx={{
              fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.22em',
              color: '#57BB95', textTransform: 'uppercase',
              animation: 'fadeLblGreen 2.2s ease-in-out infinite',
              '@keyframes fadeLblGreen': { '0%,100%': { opacity: 0.4 }, '50%': { opacity: 1 } },
            }}>
              Ready
            </Typography>
            <Typography sx={{ fontSize: '0.8rem', color: 'rgba(87,187,149,0.55)', letterSpacing: '0.08em' }}>
              Start preview when ready
            </Typography>
          </Box>
        </Box>
      )
    }

    // Creating state — large amber sonar rings expanding to fill the frame
    if (s === 'creating') {
      return (
        <Box sx={{
          position: 'relative',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', overflow: 'hidden',
          background: 'radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.12) 0%, transparent 68%)',
        }}>
          {/* Sonar rings — start tiny, expand to fill/overflow the frame */}
          {[1, 2, 3, 4, 5].map(i => (
            <Box key={i} sx={{
              position: 'absolute',
              left: '50%', top: '50%',
              transform: 'translate(-50%, -50%)',
              width: `${i * 22}%`,
              aspectRatio: '1',
              borderRadius: '50%',
              border: `1.5px solid rgba(245,158,11,${0.8 - i * 0.1})`,
              opacity: 0,
              animation: `createSonar 3.2s ease-out ${(i - 1) * 0.55}s infinite`,
              '@keyframes createSonar': {
                '0%':   { transform: 'translate(-50%, -50%) scale(0.1)', opacity: 0.95 },
                '100%': { transform: 'translate(-50%, -50%) scale(1)',   opacity: 0 },
              },
            }} />
          ))}

          {/* Label — absolutely centered over the rings */}
          <Box sx={{
            position: 'absolute', zIndex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
          }}>
            <Typography sx={{
              fontSize: '1rem', fontWeight: 700, letterSpacing: '0.22em',
              color: '#f59e0b', textTransform: 'uppercase',
              animation: 'fadeLblAmber 2.2s ease-in-out infinite',
              '@keyframes fadeLblAmber': { '0%,100%': { opacity: 0.4 }, '50%': { opacity: 1 } },
            }}>
              Initializing Stream
            </Typography>
            <Box sx={{ display: 'flex', gap: '5px' }}>
              {[0, 1, 2].map(i => (
                <Box key={i} sx={{
                  width: 4, height: 4, borderRadius: '50%', bgcolor: '#f59e0b',
                  animation: `dotA 1.3s ease-in-out ${i * 0.22}s infinite`,
                  '@keyframes dotA': { '0%,80%,100%': { transform: 'scale(0.5)', opacity: 0.25 }, '40%': { transform: 'scale(1)', opacity: 1 } },
                }} />
              ))}
            </Box>
          </Box>
        </Box>
      )
    }

    // Past / idle
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1.5, opacity: 0.25 }}>
        <Box component="svg" viewBox="0 0 64 64" sx={{ width: 44, height: 44, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, color: '#94a3b8' }}>
          <circle cx="32" cy="32" r="26" /><path d="M26 20l16 12-16 12V20z" />
        </Box>
        <Typography sx={{ fontSize: '0.75rem', color: '#94a3b8' }}>No active stream</Typography>
      </Box>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: '#07090f', color: '#e2e8f0', display: 'flex', flexDirection: 'column' }}>

        {/* ── Sticky top bar ── */}
        <Box sx={{
          position: 'sticky', top: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 1.5,
          px: { xs: 2, md: 3.5 }, height: 54,
          bgcolor: 'rgba(7,9,15,0.92)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}>
          <Tooltip title="Back to admin">
            <IconButton onClick={() => navigate('/admin')} size="small"
              sx={{ color: 'rgba(255,255,255,0.4)', minWidth: { xs: 40, sm: 'auto' }, minHeight: { xs: 40, sm: 'auto' }, '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.06)' } }}>
              <ArrowBackIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.93rem', color: '#fff', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {channel.name}
            </Typography>
            <Typography sx={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', mt: '1px' }}>
              {channel.id}{channel.stream_type ? ` · ${channel.stream_type}` : ''}
            </Typography>
          </Box>
          {/* Status — hidden for ready (button handles it), preview (badge is on the player),
              and live (the CDN feed card already shows its own LIVE badge) */}
          {(s !== 'ready' || waitingForStart || starting) && s !== 'preview' && !isLive && <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.65,
            px: 1.2, py: 0.45, borderRadius: '20px',
            bgcolor: statusCfg.bg, border: `1px solid ${statusCfg.border}`, flexShrink: 0,
            // Pulsing glow for transient states
            ...((pillStatus === 'creating' || pillStatus === 'starting' || pillStatus === 'stopping') && {
              animation: 'pillGlow 1.8s ease-in-out infinite',
              '@keyframes pillGlow': {
                '0%,100%': { boxShadow: 'none' },
                '50%':     { boxShadow: `0 0 10px 2px ${statusCfg.color}44, 0 0 20px 0px ${statusCfg.color}22` },
              },
            }),
          }}>
            {/* Spinning mini ring for transient states */}
            {(pillStatus === 'creating' || pillStatus === 'starting' || pillStatus === 'stopping') && (
              <Box sx={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                border: `1.5px solid ${statusCfg.color}`,
                borderTopColor: 'transparent',
                animation: 'pillSpin 0.75s linear infinite',
                '@keyframes pillSpin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
              }} />
            )}
            <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.09em', color: statusCfg.color, textTransform: 'uppercase' }}>
              {statusCfg.label}
            </Typography>
          </Box>}
          {/* Start Stream / Start Preview — 24/7 channels */}
          {channel.stream_type === '24/7' && (s === 'idle' || (s === 'ready' && !waitingForStart && !starting)) && s !== 'creating' && s !== 'starting' && s !== 'preview' && (
            <Tooltip title={
              startError ||
              (waitingForStart ? 'Waiting for transition…' :
               s === 'ready'   ? 'Start preview mode' :
               'Start the 24/7 stream')
            }>
              <span>
                <Button
                  onClick={startStream}
                  disabled={readOnly || starting || (waitingForStart && s !== 'ready')}
                  size="small"
                  variant="contained"
                  startIcon={
                    (starting || (waitingForStart && s !== 'ready'))
                      ? <CircularProgress size={11} sx={{ color: 'inherit' }} />
                      : <PlayCircleIcon sx={{ fontSize: '15px !important' }} />
                  }
                  sx={{
                    bgcolor: (waitingForStart && s !== 'ready') ? '#f59e0b' : s === 'ready' ? '#57BB95' : '#10b981',
                    '&:hover': { bgcolor: s === 'ready' ? '#3da67d' : '#059669' },
                    '&:disabled': { bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' },
                    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                    px: 1.5, py: 0.55, minHeight: { xs: 40, sm: 32 }, borderRadius: 1.5, boxShadow: 'none',
                    textTransform: 'none',
                  }}
                >
                  {(starting || (waitingForStart && s !== 'ready')) ? 'Starting…'
                   : s === 'ready' ? 'Start Preview'
                   : 'Start Stream'}
                </Button>
              </span>
            </Tooltip>
          )}
          {startError && (
            <Tooltip title={startError}>
              <Typography sx={{ fontSize: '0.65rem', color: '#f87171', maxWidth: 240, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {startError}
              </Typography>
            </Tooltip>
          )}

          {/* Go Live — 24/7 channels in preview state */}
          {channel.stream_type === '24/7' && (s === 'preview' || waitingForLive) && !isLive && s !== 'stopping' && s !== 'idle' && (
            <Tooltip title={goLiveError || (waitingForLive ? 'Waiting for stream to go live…' : 'Push stream from preview to live')}>
              <span>
                <Button
                  onClick={goLive}
                  disabled={readOnly || goingLive || waitingForLive}
                  size="small"
                  variant="contained"
                  startIcon={(goingLive || waitingForLive) ? <CircularProgress size={11} sx={{ color: 'inherit' }} /> : <PlayCircleIcon sx={{ fontSize: '15px !important' }} />}
                  sx={{
                    bgcolor: waitingForLive ? '#f59e0b' : '#6366f1',
                    '&:hover': { bgcolor: waitingForLive ? '#d97706' : '#4f46e5' },
                    '&:disabled': { bgcolor: waitingForLive ? 'rgba(245,158,11,0.55)' : 'rgba(99,102,241,0.4)', color: 'rgba(255,255,255,0.7)' },
                    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                    px: 1.5, py: 0.55, minHeight: { xs: 40, sm: 32 }, borderRadius: 1.5, boxShadow: 'none',
                    textTransform: 'none',
                  }}
                >
                  {goingLive ? 'Going Live…' : waitingForLive ? 'Going Live…' : 'Go Live'}
                </Button>
              </span>
            </Tooltip>
          )}
          {goLiveError && (
            <Tooltip title={goLiveError}>
              <Typography sx={{ fontSize: '0.65rem', color: '#f87171', maxWidth: 240, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {goLiveError}
              </Typography>
            </Tooltip>
          )}
          {/* Stop Stream — 24/7 live channels only */}
          {channel.stream_type === '24/7' && (isLive || waitingForStop) && s !== 'stopping' && (
            <Tooltip title={stopError || (waitingForStop ? 'Waiting for stream to stop…' : 'Stop the 24/7 stream')}>
              <span>
                <Button
                  onClick={() => { setStopError(null); setStopOpen(true) }}
                  disabled={readOnly || stopping || waitingForStop}
                  size="small"
                  variant="outlined"
                  startIcon={(stopping || waitingForStop) ? <CircularProgress size={11} sx={{ color: 'inherit' }} /> : <DeleteIcon sx={{ fontSize: '15px !important' }} />}
                  sx={{
                    borderColor: waitingForStop ? 'rgba(245,158,11,0.5)' : 'rgba(248,113,113,0.4)',
                    color:       waitingForStop ? '#f59e0b' : '#f87171',
                    '&:hover': {
                      borderColor: waitingForStop ? '#f59e0b' : '#f87171',
                      bgcolor:     waitingForStop ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
                    },
                    '&:disabled': { borderColor: 'rgba(245,158,11,0.3)', color: 'rgba(245,158,11,0.5)' },
                    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                    px: 1.5, py: 0.55, minHeight: { xs: 40, sm: 32 }, borderRadius: 1.5, boxShadow: 'none',
                    textTransform: 'none',
                  }}
                >
                  {stopping ? 'Stopping…' : waitingForStop ? 'Stopping…' : 'Stop Stream'}
                </Button>
              </span>
            </Tooltip>
          )}
          {stopError && (
            <Tooltip title={stopError}>
              <Typography sx={{ fontSize: '0.65rem', color: '#f87171', maxWidth: 240, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {stopError}
              </Typography>
            </Tooltip>
          )}

          <Tooltip title="Refresh">
            <IconButton onClick={() => fetchChannel(true)} size="small"
              sx={{ color: refreshing ? '#6366f1' : 'rgba(255,255,255,0.3)', minWidth: { xs: 40, sm: 'auto' }, minHeight: { xs: 40, sm: 'auto' }, '&:hover': { color: '#fff' },
                animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
                '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }}>
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          {!readOnly && (
            <Tooltip title="Delete stream">
              <IconButton onClick={() => setDeleteOpen(true)} size="small"
                sx={{ color: 'rgba(248,113,113,0.4)', minWidth: { xs: 40, sm: 'auto' }, minHeight: { xs: 40, sm: 'auto' }, '&:hover': { color: '#f87171', bgcolor: 'rgba(239,68,68,0.1)' } }}>
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* ── Body — two columns ── */}
        <Box sx={{
          flex: 1,
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          gap: 0,
          width: '100%',
        }}>

          {/* ══ LEFT — Feeds ══════════════════════════════════════════════════════ */}
          <Box sx={{
            flex: 1,
            minWidth: 0,
            px: { xs: 2, md: 3.5 },
            pt: { xs: 3, md: 3.5 },
            pb: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}>
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(168,188,212,0.45)', textTransform: 'uppercase' }}>
              Feeds
            </Typography>

            {/* ── Feed grid: 1-up when solo, 2-up when multiple destinations ── */}
            {(() => {
              const showYoutube  = hasYoutube  && (isScheduled || isLive)
              const showFacebook = hasFacebook && (isScheduled || isLive)
              const multiDest    = showYoutube || showFacebook

              return (
                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: multiDest ? { xs: '1fr', md: '1fr 1fr' } : '1fr',
                  gap: 2.5,
                }}>
                  {/* CDN feed (always shown) */}
                  <FeedCard
                    label="CDN"
                    accentColor="#57BB95"
                    isLive={isLive || (isScheduled && previewUnlocked)}
                  >
                    {cdnContent()}
                  </FeedCard>

                  {/* YouTube feed */}
                  {showYoutube && (
                    <FeedCard
                      label="YouTube"
                      logo={<Box component="img" src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg" sx={{ width: 16, height: 16 }} />}
                      accentColor="#ff0000"
                      isLive={isLive}
                    >
                      <Box
                        component="iframe"
                        src={`https://www.youtube.com/embed/${channel.youtube_broadcast_id}?autoplay=${isLive ? 1 : 0}&mute=1&rel=0&modestbranding=1`}
                        sx={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                      />

                      {/* Scheduled overlay — YouTube iframes don't show waiting-room UI */}
                      {isScheduled && channel.stream_start && (
                        <Box sx={{
                          position: 'absolute', top: 10, right: 12,
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.2,
                          pl: 2, pr: '1px', py: 0.5, borderRadius: 1.5,
                          width: 100,
                          bgcolor: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.15 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#ff0000', boxShadow: '0 0 5px #ff0000', flexShrink: 0,
                                animation: 'ytDot 2s ease-in-out infinite',
                                '@keyframes ytDot': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
                              <Typography component="span" sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                Live in
                              </Typography>
                            </Box>
                            <Countdown targetIso={channel.stream_start} compact />
                          </Box>
                        </Box>
                      )}
                    </FeedCard>
                  )}

                  {/* Facebook feed */}
                  {showFacebook && (
                    <FeedCard
                      label="Facebook"
                      logo={
                        <Box sx={{ width: 16, height: 16, borderRadius: '4px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Box component="svg" viewBox="0 0 24 24" sx={{ width: 9, height: 9, fill: '#fff' }}>
                            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                          </Box>
                        </Box>
                      }
                      accentColor="#1877F2"
                      isLive={isLive}
                    >
                      {/* Facebook doesn't support embedded live previews easily — show a link card */}
                      <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, px: 2 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Box component="svg" viewBox="0 0 24 24" sx={{ width: 20, height: 20, fill: '#fff' }}>
                            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                          </Box>
                        </Box>
                        {channel.facebook_page_name && (
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#e2e8f0', textAlign: 'center' }}>
                            {channel.facebook_page_name}
                          </Typography>
                        )}
                        <Typography sx={{ fontSize: '0.65rem', color: 'rgba(148,163,184,0.7)', textAlign: 'center', lineHeight: 1.4 }}>
                          {isLive ? 'Live on Facebook now' : 'Scheduled on Facebook'}
                        </Typography>
                        {channel.facebook_watch_url && (
                          <Box
                            component="a"
                            href={channel.facebook_watch_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.6, borderRadius: 1.5, bgcolor: '#1877F2', color: '#fff', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', transition: 'opacity 0.15s', '&:hover': { opacity: 0.85 } }}
                          >
                            Open on Facebook ↗
                          </Box>
                        )}
                      </Box>
                    </FeedCard>
                  )}

                  {/* Rumble, Twitch etc. slot in here as additional FeedCards */}
                </Box>
              )
            })()}

          </Box>

          {/* ══ RIGHT — Info panel ════════════════════════════════════════════════ */}
          <Box sx={{
            width: { xs: '100%', lg: 440 },
            flexShrink: 0,
            borderLeft: { xs: 'none', lg: '1px solid rgba(255,255,255,0.1)' },
            borderTop: { xs: '1px solid rgba(255,255,255,0.1)', lg: 'none' },
            bgcolor: { xs: 'transparent', lg: 'rgba(255,255,255,0.025)' },
          }}>
            <Box sx={{
              position: { xs: 'static', lg: 'sticky' },
              top: 54,
              maxHeight: { xs: 'none', lg: 'calc(100vh - 54px)' },
              overflowY: { xs: 'visible', lg: 'auto' },
              px: { xs: 2, md: 3.5 },
              pt: { xs: 3, md: 3.5 },
              pb: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
              // Subtle scrollbar
              '&::-webkit-scrollbar': { width: 4 },
              '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 2 },
            }}>

              {/* ── Schedule / Countdown ── */}
              {(channel.stream_start || channel.stream_end) && (
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2, p: 2 }}>
                  {isScheduled && channel.stream_start && (
                    <Box sx={{ mb: 2, p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.28)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                      <Typography sx={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(99,102,241,0.7)', textTransform: 'uppercase' }}>Starts in</Typography>
                      <Countdown targetIso={channel.stream_start} compact />
                    </Box>
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, rowGap: 1.5, columnGap: 4 }}>
                    {channel.stream_start && <InfoRow label="Start"    value={`${fmtDateTime(channel.stream_start, TZ)} ${tzLabel}`} />}
                    {duration             && <InfoRow label="Duration" value={duration} />}
                    {channel.stream_end   && (
                      <Box sx={{ gridColumn: '1 / -1' }}>
                        <InfoRow label="End" value={`${fmtDateTime(channel.stream_end, TZ)} ${tzLabel}`} />
                      </Box>
                    )}
                  </Box>
                </Box>
              )}

              {/* ── Stream info ── */}
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2, p: 2 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, rowGap: 1.75, columnGap: 4 }}>
                  <Box sx={{ gridColumn: '1 / -1' }}>
                    <InfoRow label="Stream ID" value={channel.id} mono />
                  </Box>
                  <InfoRow label="Type"      value={channel.stream_type === '24/7' ? '24/7 Channel' : 'Live Event'} />
                  <InfoRow label="Format"    value={fmt?.label || channel.ingest_format?.toUpperCase()} />
                  {channel.stream_type !== '24/7' && <InfoRow label="Warm-up" value="15 min" />}
                  {channel.ingest_point_name && (
                    <Box sx={{ gridColumn: '1 / -1' }}>
                      <InfoRow label="Ingest Point" value={channel.ingest_point_name} />
                    </Box>
                  )}
                </Box>
              </Box>

              {/* ── Divider ── */}
              <Box sx={{ height: 1, bgcolor: 'rgba(255,255,255,0.09)', mx: -0.5 }} />

              {/* ── JW Ingest credentials ── */}
              {(channel.ingest_url || channel.ingest_key) && (
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 2, p: 2 }}>
                  <SectionHead
                    label={`Ingest${fmt ? ` · ${fmt.label}` : ''}`}
                    isLive={isLive || (isScheduled && previewUnlocked)}
                    accentColor="#57BB95"
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                    {channel.ingest_url        && <CredCard label="Ingest URL"   value={channel.ingest_url}   field="ingest_url"   icon={LinkIcon}   copied={copied} onCopy={copy} />}
                    {channel.ingest_key        && <CredCard label="Stream Key"   value={channel.ingest_key}   field="ingest_key"   icon={VpnKeyIcon} copied={copied} onCopy={copy} />}
                  </Box>
                </Box>
              )}

              {/* ── CDN Playback ── */}
              {channel.stream_url && (
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 2, p: 2 }}>
                  <SectionHead label="CDN Playback" accentColor="#57BB95" />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                    <CredCard label="HLS URL" value={channel.stream_url} field="stream_url" icon={LinkIcon} copied={copied} onCopy={copy} />
                  </Box>
                </Box>
              )}

              {/* ── YouTube credentials ── */}
              {hasYoutube && (
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 2, p: 2 }}>
                  <SectionHead
                    logo={<Box component="img" src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg" sx={{ width: 14, height: 14 }} />}
                    label="YouTube"
                    isLive={isLive}
                    accentColor="#ff0000"
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                    <CredCard label="Watch URL"  value={`https://www.youtube.com/watch?v=${channel.youtube_broadcast_id}`} field="yt_watch" icon={LinkIcon}   copied={copied} onCopy={copy} />
                    {channel.youtube_rtmp_url   && <CredCard label="RTMP URL"   value={channel.youtube_rtmp_url}   field="yt_rtmp"  icon={LinkIcon}   copied={copied} onCopy={copy} />}
                    {channel.youtube_stream_key && <CredCard label="Stream Key" value={channel.youtube_stream_key} field="yt_key"   icon={VpnKeyIcon} copied={copied} onCopy={copy} />}
                  </Box>

                  {/* Quick YouTube link */}
                  <Box
                    component="a"
                    href={`https://www.youtube.com/watch?v=${channel.youtube_broadcast_id}`}
                    target="_blank" rel="noopener noreferrer"
                    sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                      mt: 1.75, px: 2, py: 0.9, borderRadius: 1.5, textDecoration: 'none',
                      bgcolor: 'rgba(255,0,0,0.07)', border: '1px solid rgba(255,0,0,0.2)',
                      color: 'rgba(248,113,113,0.9)', fontSize: '0.7rem', fontWeight: 600,
                      transition: 'all 0.15s',
                      '&:hover': { bgcolor: 'rgba(255,0,0,0.14)', borderColor: 'rgba(255,0,0,0.35)', color: '#f87171' },
                    }}
                  >
                    <Box component="img" src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg" sx={{ width: 13, height: 13 }} />
                    Open on YouTube
                  </Box>
                </Box>
              )}

              {/* ── Facebook credentials ── */}
              {hasFacebook && (
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 2, p: 2 }}>
                  <SectionHead
                    logo={
                      <Box sx={{ width: 14, height: 14, borderRadius: '3px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Box component="svg" viewBox="0 0 24 24" sx={{ width: 8, height: 8, fill: '#fff' }}>
                          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                        </Box>
                      </Box>
                    }
                    label="Facebook"
                    isLive={isLive}
                    accentColor="#1877F2"
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                    {channel.facebook_watch_url  && <CredCard label="Watch URL"  value={channel.facebook_watch_url}  field="fb_watch" icon={LinkIcon}   copied={copied} onCopy={copy} />}
                    {channel.facebook_rtmp_url   && <CredCard label="RTMP URL"   value={channel.facebook_rtmp_url}   field="fb_rtmp"  icon={LinkIcon}   copied={copied} onCopy={copy} />}
                    {channel.facebook_stream_key && <CredCard label="Stream Key" value={channel.facebook_stream_key} field="fb_key"   icon={VpnKeyIcon} copied={copied} onCopy={copy} />}
                  </Box>

                  {/* Quick Facebook link */}
                  {channel.facebook_watch_url && (
                    <Box
                      component="a"
                      href={channel.facebook_watch_url}
                      target="_blank" rel="noopener noreferrer"
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                        mt: 1.75, px: 2, py: 0.9, borderRadius: 1.5, textDecoration: 'none',
                        bgcolor: 'rgba(24,119,242,0.07)', border: '1px solid rgba(24,119,242,0.2)',
                        color: 'rgba(96,165,250,0.9)', fontSize: '0.7rem', fontWeight: 600,
                        transition: 'all 0.15s',
                        '&:hover': { bgcolor: 'rgba(24,119,242,0.14)', borderColor: 'rgba(24,119,242,0.35)', color: '#93c5fd' },
                      }}
                    >
                      <Box sx={{ width: 13, height: 13, borderRadius: '3px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Box component="svg" viewBox="0 0 24 24" sx={{ width: 7, height: 7, fill: '#fff' }}>
                          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                        </Box>
                      </Box>
                      Open on Facebook
                    </Box>
                  )}
                </Box>
              )}

            </Box>
          </Box>
        </Box>
      </Box>
      {/* ── Delete confirmation dialog ── */}
      <Dialog
        open={deleteOpen}
        onClose={() => { if (!deleting) { setDeleteOpen(false); setDeleteError(null) } }}
        PaperProps={{
          sx: {
            bgcolor: '#0c1120',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 2.5,
            width: { xs: 'calc(100% - 32px)', sm: 'auto' },
            minWidth: { xs: 'auto', sm: 360 },
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, pt: 2.5, px: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', bgcolor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', flexShrink: 0 }}>
              <DeleteIcon sx={{ fontSize: 15, color: '#f87171' }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#e2e8f0' }}>
              Delete stream?
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: 3, pb: 1.5 }}>
          <Typography sx={{ fontSize: '0.82rem', color: 'rgba(148,163,184,0.8)', lineHeight: 1.6, mb: 1.5 }}>
            This will permanently delete{' '}
            <Box component="span" sx={{ color: '#e2e8f0', fontWeight: 600 }}>"{channel?.name}"</Box>
            {' '}from the platform.
            {channel?.youtube_broadcast_id && (
              <> The linked YouTube broadcast will also be removed.</>
            )}
            {channel?.facebook_live_video_id && (
              <> The linked Facebook Live video will also be removed.</>
            )}
            {' '}This cannot be undone.
          </Typography>

          {isLive && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <WarningAmberIcon sx={{ fontSize: 14, color: '#f59e0b', mt: '2px', flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.75rem', color: '#fbbf24', lineHeight: 1.5 }}>
                This stream is currently <strong>live</strong>. Deleting it will cut the broadcast immediately.
              </Typography>
            </Box>
          )}

          {deleteError && (
            <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <Typography sx={{ fontSize: '0.75rem', color: '#f87171' }}>{deleteError}</Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, pt: 0.5, gap: 1 }}>
          <Button
            onClick={() => { setDeleteOpen(false); setDeleteError(null) }}
            disabled={deleting}
            sx={{ color: 'rgba(148,163,184,0.7)', '&:hover': { color: '#e2e8f0', bgcolor: 'rgba(255,255,255,0.05)' }, fontSize: '0.8rem', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            onClick={deleteStream}
            disabled={deleting}
            variant="contained"
            sx={{
              bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' },
              '&:disabled': { bgcolor: 'rgba(220,38,38,0.3)', color: 'rgba(255,255,255,0.3)' },
              fontSize: '0.8rem', fontWeight: 700, px: 2.5, borderRadius: 1.5,
              boxShadow: 'none',
            }}
          >
            {deleting
              ? <><CircularProgress size={12} sx={{ color: 'inherit', mr: 0.75 }} />Deleting…</>
              : 'Delete stream'
            }
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Stop confirmation dialog ── */}
      <Dialog
        open={stopOpen}
        onClose={() => { if (!stopping) { setStopOpen(false); setStopError(null) } }}
        PaperProps={{
          sx: {
            bgcolor: '#0c1120',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 2.5,
            width: { xs: 'calc(100% - 32px)', sm: 'auto' },
            minWidth: { xs: 'auto', sm: 380 },
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, pt: 2.5, px: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', bgcolor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', flexShrink: 0 }}>
              <WarningAmberIcon sx={{ fontSize: 15, color: '#f87171' }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#e2e8f0' }}>
              Stop &amp; destroy stream?
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: 3, pb: 1.5 }}>
          <Typography sx={{ fontSize: '0.82rem', color: 'rgba(148,163,184,0.8)', lineHeight: 1.6, mb: 1.5 }}>
            This will stop and destroy the live stream for{' '}
            <Box component="span" sx={{ color: '#e2e8f0', fontWeight: 600 }}>"{channel?.name}"</Box>
            {'. '}Any active viewers will lose the stream immediately.
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <WarningAmberIcon sx={{ fontSize: 14, color: '#f87171', mt: '2px', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.75rem', color: '#fca5a5', lineHeight: 1.5 }}>
              This action cannot be undone. The stream will be permanently destroyed.
            </Typography>
          </Box>

          {stopError && (
            <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <Typography sx={{ fontSize: '0.75rem', color: '#f87171' }}>{stopError}</Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, pt: 0.5, gap: 1 }}>
          <Button
            onClick={() => { setStopOpen(false); setStopError(null) }}
            disabled={stopping}
            sx={{ color: 'rgba(148,163,184,0.7)', '&:hover': { color: '#e2e8f0', bgcolor: 'rgba(255,255,255,0.05)' }, fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            Cancel
          </Button>
          <Button
            onClick={stopStream}
            disabled={stopping}
            variant="contained"
            sx={{
              bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' },
              '&:disabled': { bgcolor: 'rgba(220,38,38,0.3)', color: 'rgba(255,255,255,0.3)' },
              fontSize: '0.8rem', fontWeight: 700, px: 2.5, borderRadius: 1.5,
              boxShadow: 'none', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}
          >
            {stopping
              ? <><CircularProgress size={12} sx={{ color: 'inherit', mr: 0.75 }} />Stopping…</>
              : 'Stop Stream'
            }
          </Button>
        </DialogActions>
      </Dialog>

    </ThemeProvider>
  )
}
