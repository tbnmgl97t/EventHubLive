import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom'
import EHLLogo from './EHLLogo'
import EncoderControl from './EncoderControl'
import EncoderList from './EncoderList'
import EncoderForm from './EncoderForm'
import { CdnRecordsPanel, PricingPanel } from './CostsExtras'
import {
  Box, Paper, Typography, TextField, Button, CircularProgress,
  Alert, IconButton, Chip, Divider, Tooltip, Snackbar, Collapse,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Drawer, InputAdornment,
  Table, TableBody, TableCell, TableHead, TableRow,
  AppBar, Toolbar, Stack, ToggleButton, ToggleButtonGroup, MenuItem,
  Tabs, Tab, Switch, useTheme, useMediaQuery,
} from '@mui/material'
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import LogoutIcon from '@mui/icons-material/Logout'
import RefreshIcon from '@mui/icons-material/Refresh'
import VideocamIcon from '@mui/icons-material/Videocam'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LiveTvIcon from '@mui/icons-material/LiveTv'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SettingsIcon from '@mui/icons-material/Settings'
import PaletteIcon from '@mui/icons-material/Palette'
import CloseIcon from '@mui/icons-material/Close'
import AllInclusiveIcon from '@mui/icons-material/AllInclusive'
import EventIcon from '@mui/icons-material/Event'
import DownloadIcon from '@mui/icons-material/Download'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import LinkIcon from '@mui/icons-material/Link'
import VpnKeyIcon from '@mui/icons-material/VpnKey'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import ImageIcon from '@mui/icons-material/Image'
import RouterIcon from '@mui/icons-material/Router'
import MenuIcon from '@mui/icons-material/Menu'
import { useTenant } from '../contexts/TenantContext'
import { supabase } from '../lib/supabaseClient'
import { getStatusDisplay, getStreamStatusKey, resolveIdleStatus, getSpinupStatus } from '../lib/streamStatus'

const SESSION_KEY       = 'ri_admin_token'
const ACTIVE_TENANT_KEY = 'ri_active_tenant'
// Temporary flag — set to true to restore the dashboard stat cards (Live Now / Sessions Today / Event Cost / Total Streams)
const SHOW_STATS_ROW = false
const ROLE_KEY          = 'ri_admin_role'

/** Normalise legacy camera1/camera2 fields into a streams array */
function getSessionStreams(session) {
  if (session && Array.isArray(session.streams)) return session.streams
  const streams = []
  if (session?.camera1_url) streams.push({ id: 1, url: session.camera1_url, name: session.camera1_name || 'Stream 1' })
  if (session?.camera2_url) streams.push({ id: 2, url: session.camera2_url, name: session.camera2_name || 'Stream 2' })
  return streams
}

// ─── Admin SaaS palette ───────────────────────────────────────────────────────

const AP = {
  accent:    '#6366f1',
  accentHov: '#4f46e5',
  accentDim: 'rgba(99,102,241,0.08)',
  accentMid: 'rgba(99,102,241,0.15)',
  accentBdr: 'rgba(99,102,241,0.3)',
  accentBdr2:'rgba(99,102,241,0.5)',
  live:      '#10b981',
  liveDim:   'rgba(16,185,129,0.15)',
  liveBdr:   'rgba(16,185,129,0.4)',
  warn:      '#f59e0b',
  warnDim:   'rgba(245,158,11,0.12)',
  slate:     '#64748b',
  slateDim:  'rgba(100,116,139,0.15)',
  bg:        '#0f1117',
  paper:     '#161b2e',
  muted:     '#94a3b8',
  text:      '#e2e8f0',
}

const adminTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: AP.accent, contrastText: '#fff' },
    background: { default: AP.bg, paper: AP.paper },
    text:       { primary: AP.text, secondary: AP.muted },
    divider:    'rgba(255,255,255,0.08)',
  },
  typography: { fontFamily: "'Poppins', sans-serif" },
  shape: { borderRadius: 8 },
  components: {
    MuiButton:  { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiPaper:   { styleOverrides: { root: { backgroundImage: 'none', border: '1px solid rgba(255,255,255,0.07)' } } },
    MuiTab:     { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiCssBaseline: {
      styleOverrides: {
        // Invert the native date/time picker icons so they're visible on dark backgrounds
        'input[type="date"]::-webkit-calendar-picker-indicator, input[type="time"]::-webkit-calendar-picker-indicator': {
          filter: 'invert(0.7)',
          cursor: 'pointer',
        },
      },
    },
  },
})

// ─── VOD expiry ───────────────────────────────────────────────────────────────
// JW Live-to-VOD recordings are auto-deleted from JW after this many days.
const VOD_TTL_DAYS = 10

/** Returns the computed UTC ms when a channel's VOD recording expires (stream_end + TTL). */
function vodExpiresAt(ch) {
  if (!ch?.stream_end) return null
  return new Date(ch.stream_end).getTime() + VOD_TTL_DAYS * 86_400_000
}

/** True if the channel is a past downloadable stream whose VOD has expired. */
function isVodExpired(ch) {
  const exp = vodExpiresAt(ch)
  return exp !== null && exp < Date.now()
}

// ─── JW Player lib ────────────────────────────────────────────────────────────

const JW_PLAYER_LIB = 'https://cdn.jwplayer.com/libraries/xJKVL03e.js'
const PREVIEW_DIV_ID = 'jw-admin-preview'

function loadJWScript() {
  return new Promise((resolve, reject) => {
    if (window.jwplayer) { resolve(window.jwplayer); return }
    const existing = document.querySelector(`script[src="${JW_PLAYER_LIB}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.jwplayer))
      existing.addEventListener('error', reject)
      return
    }
    const s = document.createElement('script')
    s.src = JW_PLAYER_LIB; s.async = true
    s.onload = () => resolve(window.jwplayer)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function shortUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.pathname.split('/').pop() || url
  } catch {
    return url.slice(-20)
  }
}

function getTournamentDateRange(tournament) {
  if (!tournament.days?.length) return null
  const dates = tournament.days.map(d => d.date).sort()
  const fmt = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const start = fmt(dates[0])
  const end   = fmt(dates[dates.length - 1])
  const year  = new Date(dates[0] + 'T12:00:00').getFullYear()
  return start === end ? `${start}, ${year}` : `${start} – ${end}, ${year}`
}

// ─── Spin-up status (admin preview window = ±30 min) ─────────────────────────
// resolveIdleStatus lives in src/lib/streamStatus.js (shared with every other
// view that needs to know whether an "idle" channel is upcoming or past).


// ─── Cost helpers ─────────────────────────────────────────────────────────────

const RATES = { storage: 5, ingestion: 8, playout: 6 }   // $/hr
const FIXED_RATE = RATES.storage + RATES.ingestion + RATES.playout  // $19/hr

function calcChannelCost(ch) {
  if (!ch.stream_start) return null
  const start = new Date(ch.stream_start)
  const end = ch.stream_end ? new Date(ch.stream_end) : new Date()
  const hours = Math.max(0, (end - start) / 3_600_000)
  return {
    hours,
    storage:   hours * RATES.storage,
    ingestion: hours * RATES.ingestion,
    playout:   hours * RATES.playout,
    total:     hours * FIXED_RATE,
  }
}

function fmtUSD(n) {
  return '$' + n.toFixed(2)
}

// Group a list of channels into { dateLabel → { hours, storage, ingestion, playout, total, count } }
function calcDailyCosts(channels, tz = 'America/New_York') {
  const map = {}
  channels.forEach(ch => {
    const cost = calcChannelCost(ch)
    if (!cost || !ch.stream_start) return
    const dateLabel = new Date(ch.stream_start).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: tz,
    })
    if (!map[dateLabel]) map[dateLabel] = { hours: 0, storage: 0, ingestion: 0, playout: 0, total: 0, count: 0 }
    const d = map[dateLabel]
    d.hours     += cost.hours
    d.storage   += cost.storage
    d.ingestion += cost.ingestion
    d.playout   += cost.playout
    d.total     += cost.total
    d.count++
  })
  return Object.entries(map)
}

// ─── Cost Record dialog ───────────────────────────────────────────────────────

const EMPTY_COST_RECORD = { date: '', label: '', channel_count: 2, start_time: '8:00 AM', end_time: '5:00 PM' }

function CostRecordDialog({ open, initial, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_COST_RECORD)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(initial
      ? { date: initial.date, label: initial.label, channel_count: initial.channel_count, start_time: initial.start_time, end_time: initial.end_time }
      : EMPTY_COST_RECORD)
  }, [initial, open])

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSave() {
    setSaving(true)
    try { await onSave(form); onClose() } finally { setSaving(false) }
  }

  function parseH(t) {
    const m = t?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
    if (!m) return 0
    let h = parseInt(m[1]); const ap = m[3]?.toUpperCase()
    if (ap === 'PM' && h !== 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    return h + parseInt(m[2]) / 60
  }
  const hrs = Math.max(0, parseH(form.end_time) - parseH(form.start_time)) * Number(form.channel_count || 0)
  const preview = hrs > 0 ? fmtUSD(hrs * FIXED_RATE) : null

  const isValid = form.date && form.label && form.channel_count > 0 && form.start_time && form.end_time

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs"
      PaperProps={{ sx: { bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2 } }}
    >
      <DialogTitle sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem', pb: 1 }}>
        {initial?.id ? 'Edit Historical Entry' : 'Add Historical Entry'}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        <TextField label="Date" type="date" size="small" fullWidth value={form.date} onChange={set('date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Label" size="small" fullWidth value={form.label} onChange={set('label')} placeholder="e.g. Pro/Am" />
        <TextField label="# of Channels" type="number" size="small" fullWidth value={form.channel_count} onChange={set('channel_count')}
          inputProps={{ min: 1, max: 10 }} />
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField label="Start" size="small" fullWidth value={form.start_time} onChange={set('start_time')} placeholder="8:00 AM" />
          <TextField label="End"   size="small" fullWidth value={form.end_time}   onChange={set('end_time')}   placeholder="5:00 PM" />
        </Box>
        {preview && (
          <Box sx={{ bgcolor: AP.accentDim, border: `1px solid ${AP.accentBdr}`, borderRadius: 1.5, px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: AP.muted }}>{hrs.toFixed(1)} channel-hrs × ${FIXED_RATE}/hr</Typography>
            <Typography sx={{ color: AP.accent, fontWeight: 700, fontSize: '0.9rem' }}>{preview}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: '#a8bcd4' }}>Cancel</Button>
        <Button onClick={handleSave} disabled={!isValid || saving} variant="contained"
          sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}>
          {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw new Error(signInError.message)
      // On success the root Admin component's onAuthStateChange listener picks
      // this up and swaps the view — nothing further to do here.
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Paper
        elevation={0}
        sx={{ width: 360, p: 4, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 2 }}
        component="form"
        onSubmit={handleSubmit}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3, gap: 1 }}>
          <EHLLogo size={36} dark animate />
          <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.08em', fontSize: '0.9rem', color: 'rgba(255,255,255,0.35)', mt: 0.5 }}>
            ADMIN DASHBOARD
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>{error}</Alert>}

        <TextField
          fullWidth
          type="email"
          label="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          size="small"
          autoFocus
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          type={showPassword ? 'text' : 'password'}
          label="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          size="small"
          sx={{ mb: 2 }}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(v => !v)}
                    edge="end"
                    size="small"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Button
          type="submit"
          fullWidth
          variant="contained"
          disabled={loading || !email || !password}
          sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov }, fontWeight: 700 }}
        >
          {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Sign In'}
        </Button>
      </Paper>
    </Box>
  )
}

function TenantPicker({ tenants, onSelect, onLogout }) {
  if (tenants.length === 0) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <Typography sx={{ color: '#94a3b8', fontSize: '0.9rem' }}>Your account isn't a member of any organization yet.</Typography>
        <Button onClick={onLogout} sx={{ color: '#a8bcd4' }}>Log Out</Button>
      </Box>
    )
  }
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Paper elevation={0} sx={{ width: 360, p: 4, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 2 }}>
        <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem', color: '#fff', mb: 2 }}>
          CHOOSE AN ORGANIZATION
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {tenants.map(t => (
            <Button
              key={t.id}
              onClick={() => onSelect(t)}
              variant="outlined"
              fullWidth
              sx={{ justifyContent: 'flex-start', color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.14)', textTransform: 'none' }}
            >
              {t.name}
            </Button>
          ))}
        </Box>
        <Button onClick={onLogout} size="small" sx={{ mt: 2, color: '#64748b' }}>Log Out</Button>
      </Paper>
    </Box>
  )
}

// ─── Event drawer (create / edit) ─────────────────────────────────────────────

// ─── Time picker helpers ──────────────────────────────────────────────────────
// "8:00 AM" ↔ "08:00" (HTML time input value)
function toTimeInput(t) {
  if (!t) return ''
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!m) return ''
  let h = parseInt(m[1]); const min = m[2]; const ap = (m[3] || '').toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}`
}
function fromTimeInput(t) {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr); const min = mStr || '00'
  const ap = h >= 12 ? 'PM' : 'AM'
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return `${h}:${min} ${ap}`
}

const EMPTY_TOURNAMENT = { name: '', location: '' }
const EMPTY_DRAFT_SESSION = () => ({
  _key: Date.now() + Math.random(),
  label: '', date: '', start_time: '8:00 AM', end_time: '5:00 PM', streams: [],
})

function EventDrawer({ open, initial, onClose, onSave }) {
  const { tenant }    = useTenant()
  const TZ            = tenant?.timezone || 'America/New_York'
  const tz            = getTzLabel(TZ)   // abbreviated label for display
  const [form,        setForm]        = useState(EMPTY_TOURNAMENT)
  const [sessions,    setSessions]    = useState([])
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    setForm(initial ? { name: initial.name || '', location: initial.location || '' } : EMPTY_TOURNAMENT)
    setSessions(initial?.days?.length
      ? initial.days.map(d => ({
          _key:        d.id || Math.random(),
          _existingId: d.id,
          label:       d.label      || '',
          date:        d.date       || '',
          start_time:  d.start_time || '8:00 AM',
          end_time:    d.end_time   || '5:00 PM',
          streams:     getSessionStreams(d),
        }))
      : [])
    setExpandedIdx(null)
  }, [initial, open])

  const setField = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  function addSession() {
    const s = EMPTY_DRAFT_SESSION()
    setSessions(prev => [...prev, s])
    setExpandedIdx(sessions.length) // expand the new one
  }
  function removeSession(idx) {
    setSessions(s => s.filter((_, i) => i !== idx))
    setExpandedIdx(x => x === idx ? null : x > idx ? x - 1 : x)
  }
  function updateSession(idx, field, val) {
    setSessions(s => s.map((sess, i) => i === idx ? { ...sess, [field]: val } : sess))
  }
  function addStream(sIdx) {
    setSessions(s => s.map((sess, i) => i !== sIdx ? sess : {
      ...sess, streams: [...sess.streams, { id: Date.now(), name: `Stream ${sess.streams.length + 1}`, url: '' }]
    }))
  }
  function removeStream(sIdx, stIdx) {
    setSessions(s => s.map((sess, i) => i !== sIdx ? sess : {
      ...sess, streams: sess.streams.filter((_, si) => si !== stIdx)
    }))
  }
  function updateStream(sIdx, stIdx, field, val) {
    setSessions(s => s.map((sess, i) => i !== sIdx ? sess : {
      ...sess, streams: sess.streams.map((st, si) => si !== stIdx ? st : { ...st, [field]: val })
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ ...form, sessions: sessions.map(s => ({ ...s, tz: TZ })) })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const sectionLabel = { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: '#cbd5e1', mb: 0.75 }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 560 }, maxWidth: '100%', bgcolor: '#13192b', borderLeft: '2px solid rgba(99,102,241,0.5)', boxShadow: '-8px 0 40px rgba(0,0,0,0.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
    >
      <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5, flexShrink: 0 }}>
          <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem', flex: 1 }}>
            {initial?.id ? 'Edit Event' : 'Add Event'}
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: AP.muted }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)', mb: 2.5, flexShrink: 0 }} />

        {/* Scrollable body */}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5, pr: 2.5, pb: 3, scrollbarGutter: 'stable' }}>

          {/* Event details */}
          <Box>
            <Typography sx={sectionLabel}>EVENT DETAILS</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField label="Event Name" value={form.name} onChange={setField('name')} size="small" fullWidth autoFocus placeholder="e.g. Summer Championship" />
              <TextField label="Location"   value={form.location} onChange={setField('location')} size="small" fullWidth placeholder="e.g. Miami, FL" />
            </Box>
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />

          {/* Sessions */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={sectionLabel}>SESSIONS ({sessions.length})</Typography>
              <Button size="small" startIcon={<AddIcon sx={{ fontSize: '13px !important' }} />} onClick={addSession}
                sx={{ fontSize: '0.68rem', color: AP.accent, py: 0.25, minWidth: 0, '&:hover': { bgcolor: AP.accentDim } }}>
                Add Session
              </Button>
            </Box>

            {sessions.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 3, border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'rgba(168,188,212,0.4)' }}>
                  No sessions yet — click Add Session to build out the schedule
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {sessions.map((sess, sIdx) => {
                const isOpen = expandedIdx === sIdx
                return (
                  <Box key={sess._key} sx={{ border: `1px solid ${isOpen ? AP.accentBdr : 'rgba(255,255,255,0.18)'}`, borderRadius: 1.5, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                    {/* Session header row */}
                    <Box
                      onClick={() => setExpandedIdx(isOpen ? null : sIdx)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, cursor: 'pointer', bgcolor: isOpen ? AP.accentDim : 'transparent', '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}
                    >
                      <IconButton size="small" sx={{ color: AP.accent, p: 0, flexShrink: 0 }}>
                        {isOpen ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                      </IconButton>
                      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: sess.label ? '#fff' : AP.muted, fontSize: '0.82rem', minWidth: 60 }}>
                          {sess.label || `Session ${sIdx + 1}`}
                        </Typography>
                        {sess.date && (
                          <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.7rem' }}>
                            {new Date(sess.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </Typography>
                        )}
                        {sess.streams.length > 0 && (
                          <Typography variant="caption" sx={{ color: AP.accent, fontSize: '0.65rem' }}>
                            {sess.streams.length} stream{sess.streams.length !== 1 ? 's' : ''}
                          </Typography>
                        )}
                      </Box>
                      <IconButton size="small" onClick={e => { e.stopPropagation(); removeSession(sIdx) }} sx={{ color: AP.muted, '&:hover': { color: '#f44336' }, p: 0.25 }}>
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>

                    {/* Session body */}
                    <Collapse in={isOpen}>
                      <Box sx={{ px: 2, pb: 2, pt: 1.5, display: 'flex', flexDirection: 'column', gap: 2, borderTop: '1px solid rgba(255,255,255,0.14)' }}>
                        <Box sx={{ display: 'flex', gap: 1.5 }}>
                          <TextField size="small" label="Label" value={sess.label} onChange={e => updateSession(sIdx, 'label', e.target.value)} placeholder="e.g. Day 1" sx={{ flex: 1 }} />
                          <TextField size="small" label="Date" type="date" value={sess.date} onChange={e => updateSession(sIdx, 'date', e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                          <TextField size="small" label="Start" type="time" InputLabelProps={{ shrink: true }}
                            value={toTimeInput(sess.start_time)}
                            onChange={e => updateSession(sIdx, 'start_time', fromTimeInput(e.target.value))}
                            sx={{ flex: 1 }} />
                          <TextField size="small" label="End" type="time" InputLabelProps={{ shrink: true }}
                            value={toTimeInput(sess.end_time)}
                            onChange={e => updateSession(sIdx, 'end_time', fromTimeInput(e.target.value))}
                            sx={{ flex: 1 }} />
                          <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.7rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{tz}</Typography>
                        </Box>

                        {/* Streams */}
                        <Box>
                          <Typography sx={{ ...sectionLabel, mb: 0.5 }}>STREAMS</Typography>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                            {sess.streams.map((st, stIdx) => (
                              <Box key={st.id ?? stIdx} sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 1, px: 1.5, py: 1 }}>
                                <Typography variant="caption" sx={{ color: AP.muted, fontWeight: 700, minWidth: 18, fontSize: '0.65rem' }}>#{stIdx + 1}</Typography>
                                <TextField size="small" placeholder="Stream name" value={st.name} onChange={e => updateStream(sIdx, stIdx, 'name', e.target.value)}
                                  sx={{ width: 130, '& input': { fontSize: '0.75rem', py: '4px' }, '& .MuiOutlinedInput-root': { height: 28 } }} />
                                <TextField size="small" placeholder="HLS / RTMP URL" value={st.url} onChange={e => updateStream(sIdx, stIdx, 'url', e.target.value)}
                                  sx={{ flex: 1, '& input': { fontSize: '0.7rem', fontFamily: 'monospace', py: '4px' }, '& .MuiOutlinedInput-root': { height: 28 } }} />
                                <IconButton size="small" onClick={() => removeStream(sIdx, stIdx)} sx={{ color: AP.muted, '&:hover': { color: '#f44336' }, p: 0.25, flexShrink: 0 }}>
                                  <CloseIcon sx={{ fontSize: 13 }} />
                                </IconButton>
                              </Box>
                            ))}
                          </Box>
                          <Button size="small" startIcon={<AddIcon sx={{ fontSize: '12px !important' }} />} onClick={() => addStream(sIdx)}
                            disabled={sess.streams.length >= 10}
                            sx={{ mt: 0.75, fontSize: '0.68rem', color: AP.accent, py: 0.25, '&:hover': { bgcolor: AP.accentDim } }}>
                            Add Stream
                          </Button>
                        </Box>
                      </Box>
                    </Collapse>
                  </Box>
                )
              })}
            </Box>
          </Box>
        </Box>

        {/* Footer */}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 2, borderTop: '1px solid rgba(255,255,255,0.15)', flexShrink: 0, mt: 1 }}>
          <Button onClick={onClose} sx={{ color: '#a8bcd4' }}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.name || saving} variant="contained"
            sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}>
            {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Save Event'}
          </Button>
        </Box>
      </Box>
    </Drawer>
  )
}

// ─── Session drawer (create / edit within an event) ──────────────────────────

const EMPTY_DAY = { label: '', date: '', start_time: '8:00 AM', end_time: '5:00 PM' }

function SessionDrawer({ open, initial, tournament, channels, onClose, onSaved, onOpenPicker }) {
  const { tenant } = useTenant()
  const TZ         = tenant?.timezone || 'America/New_York'
  const tz         = getTzLabel(TZ)   // abbreviated label for display
  const [form, setForm] = useState(EMPTY_DAY)
  const [streams, setStreams] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(initial
      ? { label: initial.label, date: initial.date, start_time: initial.start_time, end_time: initial.end_time }
      : EMPTY_DAY)
    setStreams(initial ? getSessionStreams(initial) : [])
  }, [initial, open])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function addStream() {
    if (streams.length >= 10) return
    setStreams(s => [...s, { id: Date.now(), url: '', name: `Stream ${s.length + 1}` }])
  }

  function removeStream(idx) {
    setStreams(s => s.filter((_, i) => i !== idx))
  }

  function setStreamName(idx, name) {
    setStreams(s => s.map((st, i) => i === idx ? { ...st, name } : st))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSaved({ ...form, tz: TZ, streams })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const isValid = form.label && form.date && form.start_time && form.end_time

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, maxWidth: '100%', bgcolor: '#13192b', borderLeft: '2px solid rgba(99,102,241,0.5)', boxShadow: '-8px 0 40px rgba(0,0,0,0.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
    >
      <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5, flex: 1, minHeight: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem', flex: 1 }}>
            {initial?.id ? 'Edit Session' : 'Add Session'}
            {tournament?.name && (
              <Typography component="span" sx={{ color: '#a8bcd4', fontSize: '0.75rem', fontFamily: 'Poppins, sans-serif', fontWeight: 400, ml: 1 }}>
                — {tournament.name}
              </Typography>
            )}
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: AP.muted }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />

        <TextField label="Label" value={form.label} onChange={set('label')} size="small" fullWidth autoFocus placeholder="e.g. Day 1" />
        <TextField label="Date" type="date" value={form.date} onChange={set('date')} size="small" fullWidth InputLabelProps={{ shrink: true }} />
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <TextField label="Start" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
            value={toTimeInput(form.start_time)}
            onChange={e => setForm(f => ({ ...f, start_time: fromTimeInput(e.target.value) }))} />
          <TextField label="End" type="time" size="small" fullWidth InputLabelProps={{ shrink: true }}
            value={toTimeInput(form.end_time)}
            onChange={e => setForm(f => ({ ...f, end_time: fromTimeInput(e.target.value) }))} />
          <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{tz}</Typography>
        </Box>

        {/* Streams section */}
        <Box>
          <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.09em', mb: 1, display: 'block' }}>
            STREAMS
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {streams.map((st, idx) => (
              <Box key={st.id ?? idx} sx={{ border: '1px solid rgba(255,255,255,0.18)', borderRadius: 1.5, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: AP.muted, fontWeight: 700, minWidth: 20 }}>#{idx + 1}</Typography>
                  <TextField
                    size="small" label="Name" value={st.name}
                    onChange={e => setStreamName(idx, e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <IconButton size="small" onClick={() => removeStream(idx)} sx={{ color: AP.muted, '&:hover': { color: '#f44336' } }}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" sx={{
                    color: st.url ? AP.accent : 'rgba(168,188,212,0.4)',
                    fontFamily: 'monospace', fontSize: '0.65rem', flex: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {st.url ? shortUrl(st.url) : 'No channel assigned'}
                  </Typography>
                  <Button
                    size="small" variant="outlined"
                    onClick={() => onOpenPicker(idx, initial, tournament?.id)}
                    sx={{ fontSize: '0.68rem', py: 0.25, px: 1, borderColor: AP.accentBdr, color: AP.accent, '&:hover': { borderColor: AP.accent }, flexShrink: 0 }}
                  >
                    Assign
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
          <Button
            size="small" startIcon={<AddIcon />}
            onClick={addStream}
            disabled={streams.length >= 10}
            sx={{ mt: 1, fontSize: '0.72rem', color: AP.accent, '&:hover': { bgcolor: AP.accentDim } }}
          >
            + Add Stream
          </Button>
        </Box>

        <Box sx={{ mt: 'auto', display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} sx={{ color: '#a8bcd4' }}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!isValid || saving}
            variant="contained"
            sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}
          >
            {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Save Session'}
          </Button>
        </Box>
      </Box>
    </Drawer>
  )
}

// ─── Channel picker dialog ────────────────────────────────────────────────────

function ChannelPickerDialog({ open, slot, day, channels, onClose, onPick }) {
  const streamIndex = typeof slot === 'number' ? slot : null
  const sessionStreams = day ? getSessionStreams(day) : []
  const currentStream = streamIndex !== null ? sessionStreams[streamIndex] : null
  const currentUrl = currentStream?.url || null

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
      PaperProps={{ sx: { bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2 } }}
    >
      <DialogTitle sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem', pb: 0 }}>
        Assign Channel → {day?.label} · Stream {streamIndex !== null ? streamIndex + 1 : slot}
      </DialogTitle>
      <DialogContent sx={{ pt: 1.5 }}>
        {currentUrl && (
          <Box sx={{ mb: 1.5, px: 1.5, py: 1, bgcolor: AP.accentDim, border: `1px solid ${AP.accentBdr}`, borderRadius: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircleIcon sx={{ fontSize: 14, color: AP.accent, flexShrink: 0 }} />
            <Box>
              <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.62rem', display: 'block' }}>CURRENTLY ASSIGNED</Typography>
              <Typography variant="caption" sx={{ color: AP.accent, fontWeight: 700, fontSize: '0.75rem' }}>
                {currentStream?.name || currentUrl}
              </Typography>
            </Box>
          </Box>
        )}

        {channels.length === 0 ? (
          <Typography variant="body2" sx={{ color: '#a8bcd4', textAlign: 'center', py: 3 }}>
            No live channels found.
          </Typography>
        ) : (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Paper
              onClick={() => onPick(null)}
              elevation={0}
              sx={{
                p: 1.5, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 1.5,
                cursor: 'pointer', '&:hover': { borderColor: '#f44336', bgcolor: 'rgba(244,67,54,0.05)' },
              }}
            >
              <Typography variant="body2" sx={{ color: 'rgba(168,188,212,0.6)', fontStyle: 'italic' }}>— Clear assignment —</Typography>
            </Paper>
            {[...channels].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(ch => {
              const isLive   = ch.status === 'active' || ch.status === 'streaming'
              const isActive = ch.stream_url === currentUrl && !!currentUrl
              const statusLabel = getStatusDisplay(ch, { idleLabel: 'Idle' }).label
              return (
                <Paper
                  key={ch.id}
                  onClick={() => ch.stream_url && onPick({ url: ch.stream_url, name: ch.name })}
                  elevation={0}
                  sx={{
                    p: 1.5, borderRadius: 1.5,
                    border: `1px solid ${isActive ? AP.accentBdr2 : 'rgba(255,255,255,0.07)'}`,
                    bgcolor: isActive ? AP.accentDim : 'transparent',
                    cursor: ch.stream_url ? 'pointer' : 'default',
                    opacity: ch.stream_url ? 1 : 0.5,
                    '&:hover': ch.stream_url ? { borderColor: AP.accent, bgcolor: AP.accentDim } : {},
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      {isActive && <CheckCircleIcon sx={{ fontSize: 14, color: AP.accent, flexShrink: 0 }} />}
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: isActive ? AP.accent : '#fff' }}>{ch.name}</Typography>
                        {ch.stream_url
                          ? <Typography variant="caption" sx={{ color: '#a8bcd4', fontFamily: 'monospace', fontSize: '0.62rem', wordBreak: 'break-all' }}>{ch.stream_url}</Typography>
                          : <Typography variant="caption" sx={{ color: 'rgba(168,188,212,0.5)', fontSize: '0.65rem' }}>No stream URL available</Typography>
                        }
                      </Box>
                    </Box>
                    <Chip
                      label={statusLabel}
                      size="small"
                      sx={{
                        height: 18, fontSize: '0.6rem', fontWeight: 700,
                        bgcolor: isLive ? AP.liveDim : 'rgba(255,255,255,0.06)',
                        color:  isLive ? AP.live   : AP.muted,
                        flexShrink: 0,
                      }}
                    />
                  </Box>
                </Paper>
              )
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: '#a8bcd4' }}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Timezone helpers ────────────────────────────────────────────────────────

/** Return the generic abbreviated timezone label for an IANA timezone name (e.g. 'America/New_York' → 'ET', 'America/Chicago' → 'CT') */
function getTzLabel(tz) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortGeneric' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || tz
  } catch { return tz }
}

/**
 * Convert a local date + time string (in the given IANA timezone) to a UTC ISO string.
 * Uses the Intl DST-aware offset trick — works for any IANA timezone, no manual offset math.
 */
function toUtcIso(dateStr, timeStr, tz = 'America/New_York') {
  if (!dateStr || !timeStr) return null
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return null
  let h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const ampm = match[3]?.toUpperCase()
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  try {
    // Treat the date+time as if it were UTC to get a reference ms value
    const naiveMs = Date.parse(`${dateStr}T${hh}:${mm}:00Z`)
    // Format that reference in the target timezone to find what local time it corresponds to
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date(naiveMs))
    const f = {}
    for (const p of parts) f[p.type] = parseInt(p.value, 10)
    const tzMs = Date.UTC(f.year, f.month - 1, f.day, f.hour === 24 ? 0 : f.hour, f.minute, f.second)
    // Offset = difference; apply it to naiveMs to get the real UTC time
    return new Date(naiveMs + (naiveMs - tzMs)).toISOString()
  } catch { return null }
}

// ─── Create Live Stream drawer ───────────────────────────────────────────────

const INGEST_FORMATS = [
  { value: 'rtmp',     label: 'RTMP' },
  { value: 'rtmps',    label: 'RTMPS' },
  { value: 'srt',      label: 'SRT (Push)' },
  { value: 'srt_pull', label: 'SRT (Pull)' },
  { value: 'hls',      label: 'HLS (Push)' },
  { value: 'hls_pull', label: 'HLS (Pull)' },
  { value: 'rtp',      label: 'RTP' },
  { value: 'rtp_fec',  label: 'RTP + FEC' },
]

const REGIONS = [
  { value: 'us-east-1', label: 'US East (us-east-1)' },
  { value: 'eu-west-1', label: 'EU West (eu-west-1)' },
]

// How far back footage can be clipped from a 24/7 stream — JW's allowed enum values
const CLIPPING_WINDOWS = ['4h', '6h', '12h', '24h', '36h']

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York',    label: 'Eastern Time (ET)'    },
  { value: 'America/Chicago',     label: 'Central Time (CT)'    },
  { value: 'America/Denver',      label: 'Mountain Time (MT)'   },
  { value: 'America/Phoenix',     label: 'Mountain Time – AZ (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)'    },
  { value: 'America/Anchorage',   label: 'Alaska Time (AKT)'    },
  { value: 'Pacific/Honolulu',    label: 'Hawaii Time (HT)'     },
  { value: 'America/Puerto_Rico', label: 'Atlantic Time (AST)'  },
  { value: 'Europe/London',       label: 'London (GMT/BST)'     },
  { value: 'Europe/Paris',        label: 'Central Europe (CET)' },
  { value: 'Asia/Tokyo',          label: 'Japan (JST)'          },
  { value: 'Australia/Sydney',    label: 'Sydney (AEST)'        },
]

// Compute date ("YYYY-MM-DD") and time ("HH:MM") for a given Date in a specific timezone
function tzDateVal(d, tz = 'America/New_York') { return d.toLocaleDateString('en-CA', { timeZone: tz }) }
function tzTimeVal(d, tz = 'America/New_York') { return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }) }
function defaultStreamTimes(tz = 'America/New_York') {
  const start = new Date(Date.now() + 20 * 60 * 1000)
  const end   = new Date(start.getTime() + 60 * 60 * 1000)
  return { startDate: tzDateVal(start, tz), startTime: tzTimeVal(start, tz), endDate: tzDateVal(end, tz), endTime: tzTimeVal(end, tz) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream Detail Drawer — shows full info when a row is clicked in the list
// ─────────────────────────────────────────────────────────────────────────────
function StreamDetailDrawer({ open, channel: ch, onClose, onDelete, onPreview, token, tenantId, readOnly }) {
  const { tenant }       = useTenant()
  const TZ               = tenant?.timezone || 'America/New_York'
  const tzLabel          = getTzLabel(TZ)
  const [copied,         setCopied]         = useState(null)
  const [renditionUrl,   setRenditionUrl]   = useState(null)   // MP4 download URL
  const [renditionState, setRenditionState] = useState('idle') // idle | loading | ready | not_ready | expired | error
  const [downloading,    setDownloading]    = useState(false)
  const [dlProgress,     setDlProgress]     = useState(0)   // 0–100

  const s = ch?.status?.toLowerCase()
  const isPast = !!ch && (
    s === 'destroying' || s === 'stopping' ||
    ((s === 'idle' || !['requested','scheduled','creating','active','streaming'].includes(s)) &&
      resolveIdleStatus(ch) === 'past')
  )

  // Fetch rendition when drawer opens on a past downloadable stream
  // If asset is expired (vod_expires_at in past) or fetch returns 404, auto-delete from JW
  useEffect(() => {
    if (!open || !ch?.enable_live_to_vod || !isPast) {
      setRenditionUrl(null)
      setRenditionState('idle')
      return
    }

    // VOD has expired (stream_end + VOD_TTL_DAYS) — show expired state and
    // clean up the JW media asset if we have an ID for it.
    if (isVodExpired(ch)) {
      if (ch.vod_media_id) {
        fetch('/api/delete-vod-media', {
          method: 'DELETE',
          headers: authHeader(token, tenantId),
          body: JSON.stringify({ media_id: ch.vod_media_id }),
        }).catch(err => console.error('[auto-delete expired VOD]', err))
      }
      setRenditionState('expired')
      return
    }

    let cancelled = false
    setRenditionState('loading')
    fetch(`/api/media-renditions?id=${ch.id}`, {
      headers: authHeader(token, tenantId),
    })
      .then(async r => {
        if (cancelled) return
        if (r.status === 404) {
          // VOD media no longer exists in JW — clean it up but keep the channel row
          if (ch.vod_media_id) {
            fetch('/api/delete-vod-media', {
              method: 'DELETE',
              headers: authHeader(token, tenantId),
              body: JSON.stringify({ media_id: ch.vod_media_id }),
            }).catch(err => console.error('[auto-delete missing VOD]', err))
          }
          if (!cancelled) setRenditionState('expired')
          return
        }
        return r.json()
      })
      .then(data => {
        if (cancelled || !data) return
        if (data.url) {
          setRenditionUrl(data.url)
          setRenditionState('ready')
        } else {
          setRenditionState('not_ready')
        }
      })
      .catch(() => { if (!cancelled) setRenditionState('error') })
    return () => { cancelled = true }
  }, [open, ch?.id, ch?.enable_live_to_vod, ch?.stream_end, isPast, token])

  if (!ch) return null

  const copy = (field, text) => {
    navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 1800)
  }

  async function handleDownload() {
    if (!renditionUrl || downloading) return
    setDownloading(true)
    setDlProgress(0)
    try {
      const res    = await fetch(renditionUrl)
      const total  = Number(res.headers.get('content-length') || 0)
      const reader = res.body.getReader()
      const chunks = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (total) setDlProgress(Math.round((received / total) * 100))
      }

      const blob = new Blob(chunks, { type: 'video/mp4' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${ch.name || ch.id}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setDownloading(false)
      setDlProgress(0)
    }
  }

  const fmtTime = iso => iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })
    : null

  const vodUrl   = ch.vod_media_id ? `https://cdn.jwplayer.com/videos/${ch.vod_media_id}-720p.mp4` : null
  const _vodExp     = vodExpiresAt(ch)
  const vodDaysLeft = _vodExp ? Math.max(0, Math.ceil((_vodExp - Date.now()) / 86_400_000)) : null

  const Row = ({ label, value, field, mono }) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.6 }}>
      <Typography sx={{ fontSize: '0.68rem', color: AP.muted, width: 72, flexShrink: 0, pt: '2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.78rem', color: '#e2e8f0', fontFamily: mono ? 'monospace' : 'inherit', flex: 1, wordBreak: 'break-all', lineHeight: 1.5 }}>
        {value || '—'}
      </Typography>
      {field && value && (
        <Tooltip title={copied === field ? 'Copied!' : `Copy ${label}`}>
          <IconButton size="small" onClick={() => copy(field, value)} sx={{ color: copied === field ? AP.live : AP.muted, p: 0.25, flexShrink: 0 }}>
            {copied === field ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )

  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ }) : null
  const fmtTimeShort = iso => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) : null
  const streamTypeLabel = ch.stream_type === '24/7' ? '24/7 Channel' : ch.stream_type === 'event' ? 'Live Event' : (ch.stream_type || '—')

  const CredCard = ({ label, value, field, icon: Icon }) => (
    <Box sx={{ bgcolor: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, px: 2, py: 1.5, '&:hover': { borderColor: 'rgba(255,255,255,0.16)', bgcolor: 'rgba(0,0,0,0.35)' }, transition: 'all 0.15s' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {Icon && <Icon sx={{ fontSize: 12, color: AP.muted }} />}
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: AP.muted, textTransform: 'uppercase' }}>{label}</Typography>
        </Box>
        {value && (
          <Tooltip title={copied === field ? 'Copied!' : 'Copy'}>
            <IconButton size="small" onClick={() => copy(field, value)}
              sx={{ p: 0.5, color: copied === field ? AP.live : 'rgba(255,255,255,0.25)', bgcolor: copied === field ? 'rgba(16,185,129,0.1)' : 'transparent', borderRadius: 1, '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}>
              {copied === field ? <CheckCircleIcon sx={{ fontSize: 13 }} /> : <ContentCopyIcon sx={{ fontSize: 13 }} />}
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.78rem', color: value ? '#e2e8f0' : AP.muted, wordBreak: 'break-all', lineHeight: 1.6 }}>
        {value || '—'}
      </Typography>
    </Box>
  )

  const SectionLabel = ({ children }) => (
    <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', color: AP.muted, textTransform: 'uppercase', mb: 1.25, display: 'flex', alignItems: 'center', gap: 1, '&::after': { content: '""', flex: 1, height: '1px', bgcolor: 'rgba(255,255,255,0.06)' } }}>
      {children}
    </Typography>
  )

  const GLOW_BY_STATUS_KEY = {
    active:     'rgba(16,185,129,0.2)',
    streaming:  'rgba(16,185,129,0.2)',
    scheduled:  'rgba(99,102,241,0.15)',
    creating:   'rgba(245,158,11,0.15)',
    idle:       'rgba(100,116,139,0.08)',
    idle_247:   'rgba(100,116,139,0.08)',
    stopping:   'rgba(239,68,68,0.1)',
    destroying: 'rgba(245,158,11,0.08)',
    deleting:   'rgba(245,158,11,0.08)',
  }
  const cfgG = { ...getStatusDisplay(ch), glow: GLOW_BY_STATUS_KEY[getStreamStatusKey(ch)] || GLOW_BY_STATUS_KEY.idle }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 440 }, maxWidth: '100%', bgcolor: '#13192b', borderLeft: `2px solid ${cfgG.border}`, boxShadow: '-8px 0 40px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
    >
      {/* ── Header ── */}
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2, background: `linear-gradient(135deg, ${cfgG.glow} 0%, rgba(19,25,43,0) 55%)`, borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: 1.5, bgcolor: `${cfgG.color}18`, border: `1px solid ${cfgG.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LiveTvIcon sx={{ fontSize: 19, color: cfgG.color }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                {ch.name}
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: AP.muted, mt: 0.3 }}>
                ID: <Box component="span" sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)' }}>{ch.id}</Box>
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={onClose} sx={{ color: AP.muted, mt: -0.5, '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.07)' }, borderRadius: 1.5 }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        {/* Badges */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.25, py: 0.45, borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', backgroundColor: cfgG.bg, color: cfgG.color, border: `1px solid ${cfgG.border}` }}>
            {cfgG.label === 'Live' && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: cfgG.color }} />}
            {cfgG.label}
          </Box>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.25, py: 0.45, borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {ch.stream_type === '24/7' ? <AllInclusiveIcon sx={{ fontSize: 10 }} /> : <EventIcon sx={{ fontSize: 10 }} />}
            {streamTypeLabel}
          </Box>
          {ch.enable_live_to_vod && (
            isVodExpired(ch) ? (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.25, py: 0.45, borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', backgroundColor: AP.slateDim, color: AP.muted, border: '1px solid rgba(100,116,139,0.25)' }}>
                <DownloadIcon sx={{ fontSize: 10 }} />
                Recording Expired
              </Box>
            ) : (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.25, py: 0.45, borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', backgroundColor: AP.liveDim, color: AP.live, border: `1px solid ${AP.liveBdr}` }}>
                <DownloadIcon sx={{ fontSize: 10 }} />
                Downloadable
              </Box>
            )
          )}
          {ch.youtube_broadcast_id && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.25, py: 0.45, borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', backgroundColor: 'rgba(255,0,0,0.12)', color: '#ff4444', border: '1px solid rgba(255,0,0,0.3)' }}>
              <Box component="img"
                src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg"
                sx={{ width: 10, height: 10 }}
              />
              YouTube
            </Box>
          )}
          {ch.facebook_live_video_id && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.25, py: 0.45, borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', backgroundColor: 'rgba(24,119,242,0.12)', color: '#60a5fa', border: '1px solid rgba(24,119,242,0.3)' }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Box component="svg" viewBox="0 0 24 24" sx={{ width: 6, height: 6, fill: '#fff' }}>
                  <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                </Box>
              </Box>
              Facebook
            </Box>
          )}
          {ch.stream_start && (
            <Typography sx={{ fontSize: '0.68rem', color: AP.muted, ml: 0.25 }}>
              {fmtDate(ch.stream_start)}
              {ch.stream_end && <Box component="span" sx={{ color: 'rgba(255,255,255,0.25)', mx: 0.4 }}>·</Box>}
              {fmtTimeShort(ch.stream_start)}{ch.stream_end ? ` – ${fmtTimeShort(ch.stream_end)}` : ''} {tzLabel}
            </Typography>
          )}
        </Box>
      </Box>

      {/* ── Scrollable body ── */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2.5, py: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5, scrollbarGutter: 'stable' }}>
        {/* Stream ID */}
        <Box>
          <SectionLabel>Stream Info</SectionLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <CredCard label="Stream ID" value={ch.id} field="id" icon={LinkIcon} />
            {ch.stream_type === '24/7' && (
              <CredCard label="Clipping Window" value={ch.clipping_window} field="clipping_window" />
            )}
          </Box>
        </Box>

        {/* Playback */}
        {ch.stream_url && (
          <Box>
            <SectionLabel>CDN Playback</SectionLabel>
            <CredCard label="HLS URL" value={ch.stream_url} field="stream_url" icon={LinkIcon} />
          </Box>
        )}

        {/* YouTube */}
        {ch.youtube_broadcast_id && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
              <Box component="img"
                src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg"
                sx={{ width: 13, height: 13 }}
              />
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: AP.muted, textTransform: 'uppercase' }}>YouTube</Typography>
            </Box>
            <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.25)', px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <CredCard
                label="WATCH URL"
                value={`https://www.youtube.com/watch?v=${ch.youtube_broadcast_id}`}
                field="yt_watch"
                icon={LinkIcon}
              />
              {ch.youtube_rtmp_url && (
                <CredCard
                  label="RTMP URL"
                  value={ch.youtube_rtmp_url}
                  field="yt_rtmp"
                  icon={LinkIcon}
                />
              )}
              {ch.youtube_stream_key && (
                <CredCard
                  label="STREAM KEY"
                  value={ch.youtube_stream_key}
                  field="yt_key"
                  icon={VpnKeyIcon}
                />
              )}
            </Box>
          </Box>
        )}

        {/* Facebook */}
        {ch.facebook_live_video_id && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
              <Box sx={{ width: 13, height: 13, borderRadius: '3px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Box component="svg" viewBox="0 0 24 24" sx={{ width: 8, height: 8, fill: '#fff' }}>
                  <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                </Box>
              </Box>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: AP.muted, textTransform: 'uppercase' }}>Facebook</Typography>
            </Box>
            <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.25)', px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {ch.facebook_watch_url && (
                <CredCard label="WATCH URL"  value={ch.facebook_watch_url}  field="fb_watch" icon={LinkIcon}   />
              )}
              {ch.facebook_rtmp_url && (
                <CredCard label="RTMP URL"   value={ch.facebook_rtmp_url}   field="fb_rtmp"  icon={LinkIcon}   />
              )}
              {ch.facebook_stream_key && (
                <CredCard label="STREAM KEY" value={ch.facebook_stream_key} field="fb_key"   icon={VpnKeyIcon} />
              )}
            </Box>
          </Box>
        )}

        {/* Ingest */}
        {(ch.ingest_url || ch.ingest_key) && (() => {
          const FORMAT_MAP = {
            rtmp:     { label: 'RTMP',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
            rtmps:    { label: 'RTMPS',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
            srt:      { label: 'SRT Push', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.3)'  },
            srt_pull: { label: 'SRT Pull', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.3)'  },
            hls:      { label: 'HLS',      color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
            hls_pull: { label: 'HLS Pull', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
            rtp:      { label: 'RTP',      color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)'  },
            rtp_fec:  { label: 'RTP FEC',  color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)'  },
          }
          const fmt = ch.ingest_format
            ? (FORMAT_MAP[ch.ingest_format] || { label: ch.ingest_format.toUpperCase(), color: AP.muted, bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)' })
            : null
          return (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                {fmt && (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.1, py: 0.35, borderRadius: '20px', fontSize: '0.63rem', fontWeight: 700, letterSpacing: '0.07em', bgcolor: fmt.bg, color: fmt.color, border: `1px solid ${fmt.border}` }}>
                    <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: fmt.color, flexShrink: 0 }} />
                    {fmt.label}
                  </Box>
                )}
                <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: AP.muted, textTransform: 'uppercase' }}>Ingest</Typography>
              </Box>
              <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.25)', px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {ch.ingest_point_name && (
                  <CredCard label="INGEST POINT" value={ch.ingest_point_name} icon={LocationOnIcon} />
                )}
                {ch.ingest_url && (
                  <CredCard label="INGEST URL" value={ch.ingest_url} field="ingest_url" icon={LinkIcon} />
                )}
                {ch.ingest_key && (
                  <CredCard label="STREAM KEY" value={ch.ingest_key} field="ingest_key" icon={VpnKeyIcon} />
                )}
              </Box>
            </Box>
          )
        })()}

        {/* VOD Recording */}
        {ch.enable_live_to_vod && (
          <Box>
            <SectionLabel>Recording</SectionLabel>
            {!isPast ? (
              /* Stream is live / scheduled / creating / stopping — recording not available yet */
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, border: '1px solid rgba(99,102,241,0.25)', borderRadius: 2, bgcolor: 'rgba(99,102,241,0.07)', px: 2, py: 1.5 }}>
                <DownloadIcon sx={{ fontSize: 15, color: '#818cf8', mt: '1px', flexShrink: 0 }} />
                <Box>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#818cf8', mb: 0.25 }}>Downloadable Recording</Typography>
                  <Typography sx={{ fontSize: '0.68rem', color: AP.muted, lineHeight: 1.5 }}>
                    This stream will be available to download after the event ends.
                  </Typography>
                </Box>
              </Box>
            ) : renditionState === 'loading' ? (
              /* Fetching rendition URL */
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, border: `1px solid ${AP.liveBdr}`, borderRadius: 2, bgcolor: AP.liveDim, px: 2, py: 1.5 }}>
                <CircularProgress size={13} sx={{ color: AP.live, flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.72rem', color: AP.muted }}>Checking for recording…</Typography>
              </Box>
            ) : renditionState === 'ready' ? (
              /* MP4 is ready */
              <Box sx={{ border: `1px solid ${AP.liveBdr}`, borderRadius: 2, bgcolor: AP.liveDim, px: 2, py: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <DownloadIcon sx={{ fontSize: 14, color: AP.live }} />
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: AP.live }}>Recording Ready</Typography>
                  </Box>
                  {vodDaysLeft !== null && (
                    <Typography sx={{ fontSize: '0.65rem', color: vodDaysLeft === 0 ? '#f87171' : AP.muted }}>{vodDaysLeft}d remaining</Typography>
                  )}
                </Box>
                {downloading ? (
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.68rem', color: AP.live }}>Downloading…</Typography>
                      <Typography sx={{ fontSize: '0.68rem', color: AP.muted }}>{dlProgress}%</Typography>
                    </Box>
                    <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(16,185,129,0.15)', overflow: 'hidden' }}>
                      <Box sx={{
                        height: '100%', borderRadius: 3,
                        bgcolor: AP.live,
                        width: `${dlProgress}%`,
                        transition: 'width 0.15s ease',
                      }} />
                    </Box>
                  </Box>
                ) : (
                  <Button
                    size="small"
                    variant="contained"
                    fullWidth
                    startIcon={<DownloadIcon sx={{ fontSize: '14px !important' }} />}
                    onClick={handleDownload}
                    sx={{ fontSize: '0.72rem', fontWeight: 600, bgcolor: 'rgba(16,185,129,0.15)', color: AP.live, border: `1px solid ${AP.liveBdr}`, boxShadow: 'none', '&:hover': { bgcolor: 'rgba(16,185,129,0.25)', boxShadow: 'none' } }}
                  >
                    Download MP4
                  </Button>
                )}
              </Box>
            ) : renditionState === 'not_ready' ? (
              /* Event ended but MP4 not yet transcoded */
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, border: '1px solid rgba(245,158,11,0.25)', borderRadius: 2, bgcolor: 'rgba(245,158,11,0.07)', px: 2, py: 1.5 }}>
                <DownloadIcon sx={{ fontSize: 15, color: AP.warn, mt: '1px', flexShrink: 0 }} />
                <Box>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: AP.warn, mb: 0.25 }}>Recording Processing</Typography>
                  <Typography sx={{ fontSize: '0.68rem', color: AP.muted, lineHeight: 1.5 }}>
                    The recording is still being processed. Check back shortly.
                  </Typography>
                </Box>
              </Box>
            ) : renditionState === 'expired' ? (
              /* Recording no longer available */
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, border: '1px solid rgba(100,116,139,0.25)', borderRadius: 2, bgcolor: 'rgba(100,116,139,0.07)', px: 2, py: 1.5 }}>
                <DownloadIcon sx={{ fontSize: 15, color: AP.muted, mt: '1px', flexShrink: 0 }} />
                <Box>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: AP.muted, mb: 0.25 }}>Recording Unavailable</Typography>
                  <Typography sx={{ fontSize: '0.68rem', color: AP.muted, lineHeight: 1.5 }}>
                    This recording is no longer available for download.
                  </Typography>
                </Box>
              </Box>
            ) : (
              /* Error or idle fallback */
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, border: '1px solid rgba(239,68,68,0.2)', borderRadius: 2, bgcolor: 'rgba(239,68,68,0.06)', px: 2, py: 1.5 }}>
                <DownloadIcon sx={{ fontSize: 15, color: '#f87171', mt: '1px', flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.68rem', color: AP.muted, lineHeight: 1.5 }}>
                  Could not retrieve recording. Try reopening this stream.
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* ── Footer ── */}
      <Box sx={{ px: 2.5, py: 2, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 1, flexShrink: 0, bgcolor: 'rgba(0,0,0,0.25)' }}>
        {ch.stream_url && (
          <Button size="small" variant="contained" startIcon={<PlayArrowIcon sx={{ fontSize: '15px !important' }} />}
            onClick={() => { onPreview(ch); onClose() }}
            sx={{ fontSize: '0.72rem', fontWeight: 600, bgcolor: AP.accentDim, color: AP.accent, border: `1px solid ${AP.accentBdr}`, boxShadow: 'none', '&:hover': { bgcolor: AP.accent, color: '#fff', boxShadow: 'none' } }}
          >Preview</Button>
        )}
        <Box sx={{ flex: 1 }} />
        {!isPast && !readOnly && (
          <Button size="small" variant="contained" startIcon={<DeleteIcon sx={{ fontSize: '15px !important' }} />}
            onClick={() => { onDelete(ch.id, ch.name, ch.youtube_broadcast_id, ch.youtube_stream_id, ch.facebook_live_video_id); onClose() }}
            sx={{ fontSize: '0.72rem', fontWeight: 600, bgcolor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', boxShadow: 'none', '&:hover': { bgcolor: 'rgba(239,68,68,0.2)', boxShadow: 'none' } }}
          >Delete</Button>
        )}
      </Box>
    </Drawer>
  )
}

function CreateStreamDrawer({ open, token, tenantId, onClose, onCreated }) {
  const { tenant }        = useTenant()
  const TZ                = tenant?.timezone || 'America/New_York'
  const tzLabel           = getTzLabel(TZ)
  const [channelType, setChannelType] = useState('live_event')
  const [title, setTitle]             = useState('')
  const [region, setRegion]           = useState('us-east-1')
  const [ingestFormat, setIngestFormat] = useState('rtmp')
  const [sourceUrl, setSourceUrl]     = useState('')
  const [startDate, setStartDate]     = useState(() => defaultStreamTimes(TZ).startDate)
  const [startTime, setStartTime]     = useState(() => defaultStreamTimes(TZ).startTime)
  const [endDate, setEndDate]         = useState(() => defaultStreamTimes(TZ).endDate)
  const [endTime, setEndTime]         = useState(() => defaultStreamTimes(TZ).endTime)
  const [ingestPointId, setIngestPointId] = useState('')
  const [ingestPoints, setIngestPoints]   = useState([])
  const [loadingPoints, setLoadingPoints] = useState(false)
  const [clippingWindow,  setClippingWindow]  = useState('4h')
  const [downloadable,    setDownloadable]    = useState(false)
  const [createYoutube,       setCreateYoutube]       = useState(false)
  const [youtubePrivacyStatus, setYoutubePrivacyStatus] = useState('public') // 'public' | 'unlisted' | 'private'
  const [youtubeConnected,    setYoutubeConnected]    = useState(false)
  const [youtubeChannel,      setYoutubeChannel]      = useState(null)
  const [youtubeThumbnail,    setYoutubeThumbnail]    = useState(null)   // File object
  const [ytThumbPreview,      setYtThumbPreview]      = useState(null)   // object URL
  const [ytThumbStatus,       setYtThumbStatus]       = useState('idle') // 'idle'|'uploading'|'done'|'error'
  const [createFacebook,      setCreateFacebook]      = useState(false)
  const [facebookConnected,   setFacebookConnected]   = useState(false)
  const [facebookPage,        setFacebookPage]        = useState(null)   // { page_name, page_picture }
  const [showNewIngest,       setShowNewIngest]       = useState(false)
  const [newIngestName,       setNewIngestName]       = useState('')
  const [creatingIngest,      setCreatingIngest]      = useState(false)
  const [newIngestError,      setNewIngestError]      = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [result, setResult]   = useState(null)
  const [copiedField, setCopiedField] = useState(null)
  const [pricing, setPricing] = useState(null)   // fetched from /api/pricing
  const [startTimeTouched, setStartTimeTouched] = useState(false)
  const [endTimeTouched,   setEndTimeTouched]   = useState(false)

  useEffect(() => {
    if (!open) return
    setChannelType('live_event')
    setTitle('')
    setRegion('us-east-1')
    setIngestFormat('rtmp')
    setSourceUrl('')
    const t = defaultStreamTimes(TZ)
    setStartDate(t.startDate)
    setStartTime(t.startTime)
    setEndDate(t.endDate)
    setEndTime(t.endTime)
    setIngestPointId('')
    setClippingWindow('4h')
    setDownloadable(false)
    setCreateYoutube(false)
    setYoutubePrivacyStatus('public')
    setYoutubeThumbnail(null)
    setYtThumbPreview(null)
    setYtThumbStatus('idle')
    setCreateFacebook(false)
    setShowNewIngest(false)
    setNewIngestName('')
    setNewIngestError('')
    setError('')
    // Check YouTube connection status
    fetch('/api/youtube-status', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setYoutubeConnected(!!data?.connected)
        setYoutubeChannel(data?.connected ? data : null)
      })
      .catch(() => setYoutubeConnected(false))
    // Check Facebook connection status
    fetch('/api/facebook-status', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setFacebookConnected(!!data?.connected)
        setFacebookPage(data?.connected ? data : null)
      })
      .catch(() => setFacebookConnected(false))
    setResult(null)
    setCopiedField(null)
    setStartTimeTouched(false)
    setEndTimeTouched(false)
    loadIngestPoints('rtmp')
    // Pricing is now Super-Admin-only/global — non-Super-Admins simply won't
    // see a cost estimate here (fetch fails gracefully, no error shown).
    fetch('/api/pricing', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPricing(data) })
      .catch(() => {})
  }, [open, token]) // eslint-disable-line react-hooks/exhaustive-deps

  const ingestDebounceRef   = useRef(null)
  const prevIngestFormatRef = useRef(ingestFormat)

  useEffect(() => {
    if (!open) return
    // When the format changes, immediately wipe the current selection and list
    // so the user never sees a point from the old format lingering.
    if (prevIngestFormatRef.current !== ingestFormat) {
      prevIngestFormatRef.current = ingestFormat
      setIngestPointId('')
      setIngestPoints([])
      setShowNewIngest(false)
    }
    // Debounce: wait until user stops changing time fields before hitting the API
    clearTimeout(ingestDebounceRef.current)
    ingestDebounceRef.current = setTimeout(() => loadIngestPoints(), 600)
    return () => clearTimeout(ingestDebounceRef.current)
  }, [ingestFormat, startDate, startTime, endDate, endTime]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateIngestPoint() {
    if (!newIngestName.trim()) return
    const jwFormat = INGEST_FORMAT_MAP[ingestFormat]
    if (!jwFormat) return
    setCreatingIngest(true)
    setNewIngestError('')
    try {
      const res = await fetch('/api/create-ingest-point', {
        method:  'POST',
        headers: authHeader(token, tenantId),
        body:    JSON.stringify({ name: newIngestName.trim(), ingest_format: jwFormat }),
      })
      const data = await res.json()
      if (!res.ok) { setNewIngestError(data.error || `Error ${res.status}`); return }
      // Refresh the list and auto-select the new point
      setShowNewIngest(false)
      setNewIngestName('')
      await new Promise(resolve => {
        const startUtc = toUtcIso(startDate, fromTimeInput(startTime), TZ)
        const endUtc   = toUtcIso(endDate, fromTimeInput(endTime), TZ)
        let url = `/api/ingest-points?ingest_format=${jwFormat}`
        if (startUtc) url += `&start_date=${encodeURIComponent(startUtc)}`
        if (endUtc)   url += `&end_date=${encodeURIComponent(endUtc)}`
        fetch(url, { headers: authHeader(token, tenantId) })
          .then(r => r.json())
          .then(d => {
            const pts = d.ingest_points || []
            setIngestPoints(pts)
            setIngestPointId(data.id) // auto-select the new point
            resolve()
          })
          .catch(() => resolve())
      })
    } catch (err) {
      setNewIngestError(err.message)
    } finally {
      setCreatingIngest(false)
    }
  }

  // Formats that support static ingest points and the JW API format key to query
  const INGEST_FORMAT_MAP = {
    rtmp:    'rtmp',
    rtmps:   'rtmp',   // RTMPS reuses RTMP ingest infrastructure
    srt:     'srt',
    rtp:     'rtp',
    rtp_fec: 'rtp_fec',
    // srt_pull, hls, and hls_pull do NOT support static ingest points
  }
  const supportsIngestPoint = ingestFormat in INGEST_FORMAT_MAP
  // Pull-type ingest formats fetch from a source URL instead of exposing a push endpoint
  const isPullFormat = ingestFormat === 'srt_pull' || ingestFormat === 'hls_pull'

  function loadIngestPoints() {
    const fmt = INGEST_FORMAT_MAP[ingestFormat]
    if (!fmt) { setIngestPoints([]); setIngestPointId(''); return }
    const startUtc = toUtcIso(startDate, fromTimeInput(startTime), TZ)
    const endUtc   = toUtcIso(endDate, fromTimeInput(endTime), TZ)
    setLoadingPoints(true)
    let url = `/api/ingest-points?ingest_format=${fmt}`
    if (startUtc) url += `&start_date=${encodeURIComponent(startUtc)}`
    if (endUtc)   url += `&end_date=${encodeURIComponent(endUtc)}`
    fetch(url, { headers: authHeader(token, tenantId) })
      .then(r => r.json())
      .then(data => {
        const pts = data.ingest_points || []
        setIngestPoints(pts)
        setIngestPointId(prev => pts.find(p => p.id === prev) ? prev : '')
      })
      .catch(() => setIngestPoints([]))
      .finally(() => setLoadingPoints(false))
  }

  async function handleCreate() {
    setLoading(true)
    setError('')
    try {
      const startAMPM = fromTimeInput(startTime)
      const endAMPM   = fromTimeInput(endTime)
      const body = {
        title,
        region,
        channel_type: channelType,
        ingest_format: ingestFormat,
        ingest_point_id: ingestPointId || undefined,
        source_url: isPullFormat ? sourceUrl.trim() : undefined,
        clipping_window: channelType === 'always_on' ? clippingWindow : undefined,
        downloadable,
        create_youtube:  createYoutube  && youtubeConnected,
        youtube_privacy_status: youtubePrivacyStatus,
        create_facebook: createFacebook && facebookConnected,
      }

      if (channelType === 'live_event') {
        const startUtc = toUtcIso(startDate, startAMPM, TZ)
        const endUtc   = toUtcIso(endDate,   endAMPM,   TZ)
        if (!startUtc) throw new Error('Invalid start date/time')
        const minsAway = (new Date(startUtc) - Date.now()) / 60_000
        if (minsAway < 15) throw new Error('Start time must be at least 15 minutes in the future. Please adjust the start time and try again.')
        body.start_time_utc = startUtc
        if (endUtc) body.end_time_utc = endUtc
      }

      const res = await fetch('/api/create-stream', {
        method: 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        // Pull human-readable description out of JW's error JSON when available
        let friendly = data.error || 'Stream creation failed'
        if (data.detail) {
          try {
            const parsed = JSON.parse(data.detail)
            const desc = parsed?.errors?.[0]?.description
            if (desc) friendly = desc
          } catch { /* detail wasn't JSON */ }
        }
        throw new Error(friendly)
      }
      setResult(data)
      onCreated(data)

      // Upload YouTube thumbnail if one was selected
      if (data.youtube?.broadcast_id && youtubeThumbnail) {
        setYtThumbStatus('uploading')
        try {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result.split(',')[1]) // strip data:...;base64,
            reader.onerror = reject
            reader.readAsDataURL(youtubeThumbnail)
          })
          const thumbRes = await fetch('/api/youtube-set-thumbnail', {
            method: 'POST',
            headers: authHeader(token, tenantId),
            body: JSON.stringify({
              broadcast_id:     data.youtube.broadcast_id,
              jw_stream_id:     data.id,
              thumbnail_base64: base64,
              thumbnail_mime:   youtubeThumbnail.type || 'image/jpeg',
            }),
          })
          setYtThumbStatus(thumbRes.ok ? 'done' : 'error')
        } catch {
          setYtThumbStatus('error')
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function copyField(field, value) {
    if (!value) return
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const startAMPM    = fromTimeInput(startTime)
  const startUtcIso  = channelType === 'live_event' ? toUtcIso(startDate, startAMPM, TZ) : null
  const endUtcIso    = channelType === 'live_event' ? toUtcIso(endDate, fromTimeInput(endTime), TZ) : null
  const minutesUntilStart = startUtcIso ? (new Date(startUtcIso) - Date.now()) / 60_000 : null
  const tooSoonRaw       = minutesUntilStart !== null && minutesUntilStart < 15
  const endBeforeStartRaw = startUtcIso && endUtcIso && new Date(endUtcIso) <= new Date(startUtcIso)
  // Only show errors after user has blurred the field
  const tooSoon          = tooSoonRaw && startTimeTouched
  const endNotAfterStart = endBeforeStartRaw && endTimeTouched
  const isValid = title && (!isPullFormat || sourceUrl.trim()) && (channelType === 'always_on' || (startDate && startTime && endDate && endTime && !tooSoonRaw && !endBeforeStartRaw))
  const sectionLabel = { color: '#cbd5e1', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.09em', mb: 0.75 }

  // Helper to render a copyable URL / key row in the result card
  function CopyRow({ fieldKey, label, value, icon }) {
    const wasCopied = copiedField === fieldKey
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          {icon && React.cloneElement(icon, { sx: { fontSize: 12, color: AP.muted } })}
          <Typography variant="caption" sx={{ color: AP.muted, fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.6rem' }}>{label}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(0,0,0,0.35)', borderRadius: 1, px: 1.5, py: 0.75 }}>
          <Typography variant="caption" sx={{ color: AP.accent, fontFamily: 'monospace', fontSize: '0.63rem', flex: 1, wordBreak: 'break-all', lineHeight: 1.5 }}>
            {value}
          </Typography>
          <Tooltip title={wasCopied ? 'Copied!' : 'Copy'}>
            <IconButton size="small" onClick={() => copyField(fieldKey, value)} sx={{ color: wasCopied ? AP.live : AP.muted, flexShrink: 0, p: 0.25 }}>
              <ContentCopyIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    )
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, maxWidth: '100%', bgcolor: '#13192b', borderLeft: '2px solid rgba(99,102,241,0.5)', boxShadow: '-8px 0 40px rgba(0,0,0,0.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
    >
      <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5, flex: 1, minHeight: 0 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <LiveTvIcon sx={{ color: AP.accent, fontSize: 20 }} />
          <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem', flex: 1 }}>
            Create Live Stream
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: AP.muted }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {/* Scrollable content */}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5, pr: 2.5, pb: 3, scrollbarGutter: 'stable' }}>
          {error && (
            <Box sx={{
              display: 'flex', alignItems: 'flex-start', gap: 1.25,
              border: '1px solid rgba(239,68,68,0.35)', borderRadius: 2,
              bgcolor: 'rgba(239,68,68,0.08)', px: 2, py: 1.5,
            }}>
              <Box sx={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, mt: '1px',
                bgcolor: 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Typography sx={{ fontSize: '0.6rem', fontWeight: 900, color: '#f87171', lineHeight: 1 }}>!</Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#f87171', mb: 0.25 }}>
                  Unable to create stream
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'rgba(248,113,113,0.85)', lineHeight: 1.5 }}>
                  {error}
                </Typography>
              </Box>
              <Box onClick={() => setError('')} sx={{ cursor: 'pointer', color: 'rgba(248,113,113,0.5)', '&:hover': { color: '#f87171' }, mt: '1px' }}>
                <CloseIcon sx={{ fontSize: 14 }} />
              </Box>
            </Box>
          )}

          {!result ? (
            <>
              {/* ── Channel Type ─────────────────────────────── */}
              <Box>
                <Typography sx={sectionLabel}>CHANNEL TYPE</Typography>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  {[
                    { value: 'live_event', icon: <EventIcon />, title: 'Live Event', desc: 'Scheduled start & end time' },
                    { value: 'always_on',  icon: <AllInclusiveIcon />, title: '24/7 Channel', desc: 'Continuous, always-on stream' },
                  ].map(opt => {
                    const sel = channelType === opt.value
                    return (
                      <Box
                        key={opt.value}
                        onClick={() => setChannelType(opt.value)}
                        sx={{
                          flex: 1, cursor: 'pointer', borderRadius: 2, p: 2,
                          border: `2px solid ${sel ? AP.accent : 'rgba(255,255,255,0.1)'}`,
                          bgcolor: sel ? AP.accentDim : 'rgba(255,255,255,0.02)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: sel ? AP.accent : AP.accentBdr, bgcolor: sel ? AP.accentDim : 'rgba(255,255,255,0.04)' },
                        }}
                      >
                        <Box sx={{ color: sel ? AP.accent : AP.muted }}>
                          {React.cloneElement(opt.icon, { sx: { fontSize: 30 } })}
                        </Box>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: sel ? '#fff' : AP.muted, textAlign: 'center' }}>
                          {opt.title}
                        </Typography>
                        <Typography sx={{ fontSize: '0.67rem', color: sel ? AP.muted : 'rgba(148,163,184,0.5)', textAlign: 'center', lineHeight: 1.3 }}>
                          {opt.desc}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>
              </Box>

              {/* ── Clipping Window (24/7 channels only) ────────── */}
              {channelType === 'always_on' && (
                <TextField
                  select fullWidth size="small" label="Clipping Window"
                  value={clippingWindow} onChange={e => setClippingWindow(e.target.value)}
                  helperText="How far back footage can be clipped from this stream"
                >
                  {CLIPPING_WINDOWS.map(w => <MenuItem key={w} value={w}>{w}</MenuItem>)}
                </TextField>
              )}

              <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

              {/* ── Stream Name ────────────────────────────────── */}
              <TextField
                fullWidth size="small" label="Stream Name" autoFocus
                value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Main Court — Day 1 Camera 1"
              />

              {/* ── Region + Ingest Format ─────────────────────── */}
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField
                  select fullWidth size="small" label="Ingest Region"
                  value={region} onChange={e => setRegion(e.target.value)}
                >
                  {REGIONS.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                </TextField>
                <TextField
                  select fullWidth size="small" label="Ingest Format"
                  value={ingestFormat} onChange={e => setIngestFormat(e.target.value)}
                >
                  {INGEST_FORMATS.map(f => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                </TextField>
              </Box>

              {/* ── Live Event time windows ─────────────────────── */}
              {channelType === 'live_event' && (
                <>
                  <Box>
                    <Typography sx={sectionLabel}>START ({tzLabel})</Typography>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                      <TextField type="date" size="small" fullWidth label="Date"
                        value={startDate} onChange={e => { setStartDate(e.target.value); setEndDate(e.target.value) }}
                        onBlur={() => setStartTimeTouched(true)}
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField type="time" size="small" fullWidth label="Time"
                        value={startTime} onChange={e => setStartTime(e.target.value)}
                        onBlur={() => setStartTimeTouched(true)}
                        InputLabelProps={{ shrink: true }}
                        error={tooSoon}
                        helperText={tooSoon
                          ? (minutesUntilStart < 0
                              ? `${Math.abs(Math.round(minutesUntilStart))} min in the past`
                              : `Must be 15+ min from now`)
                          : ' '
                        }
                      />
                    </Box>
                  </Box>

                  <Box>
                    <Typography sx={sectionLabel}>END ({tzLabel})</Typography>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                      <TextField type="date" size="small" fullWidth label="Date"
                        value={endDate} onChange={e => setEndDate(e.target.value)}
                        onBlur={() => setEndTimeTouched(true)}
                        InputLabelProps={{ shrink: true }}
                        error={!!endNotAfterStart}
                        helperText={endNotAfterStart ? ' ' : ' '}
                      />
                      <TextField type="time" size="small" fullWidth label="Time"
                        value={endTime} onChange={e => setEndTime(e.target.value)}
                        onBlur={() => setEndTimeTouched(true)}
                        InputLabelProps={{ shrink: true }}
                        error={!!endNotAfterStart}
                        helperText={endNotAfterStart ? 'Must be after start time' : ' '}
                      />
                    </Box>
                  </Box>

                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                </>
              )}

              {/* ── Source URL (pull-type ingest formats) ───────── */}
              {isPullFormat && (
                <Box>
                  <Typography sx={sectionLabel}>SOURCE URL</Typography>
                  <TextField
                    fullWidth size="small"
                    placeholder="https://example.com/live/stream.m3u8"
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                  />
                  <Typography sx={{ fontSize: '0.68rem', color: AP.muted, mt: 0.5 }}>
                    JW Player will pull the stream from this URL instead of exposing a push endpoint.
                  </Typography>
                </Box>
              )}

              {/* ── Ingest Point ───────────────────────────────── */}
              {supportsIngestPoint && (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography sx={sectionLabel}>STATIC INGEST POINT</Typography>
                    <Box
                      onClick={() => { setShowNewIngest(v => !v); setNewIngestName(''); setNewIngestError('') }}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', color: showNewIngest ? AP.muted : AP.accent, fontSize: '0.68rem', fontWeight: 600, '&:hover': { color: '#fff' }, transition: 'color 0.15s' }}
                    >
                      {showNewIngest
                        ? <><Box component="span" sx={{ fontSize: '1rem', lineHeight: 1, mt: '-1px' }}>×</Box> Cancel</>
                        : <><Box component="span" sx={{ fontSize: '1rem', lineHeight: 1, mt: '-1px' }}>+</Box> New</>
                      }
                    </Box>
                  </Box>

                  {/* Inline create form */}
                  {showNewIngest && (
                    <Box sx={{ mb: 1, p: 1.5, borderRadius: 1.5, border: `1px solid ${AP.accentBdr}`, bgcolor: AP.accentDim, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: AP.accent, textTransform: 'uppercase' }}>
                        New {(INGEST_FORMAT_MAP[ingestFormat] || ingestFormat).toUpperCase()} Ingest Point
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        <TextField
                          size="small" fullWidth
                          placeholder="e.g. Main Court Encoder"
                          value={newIngestName}
                          onChange={e => { setNewIngestName(e.target.value); setNewIngestError('') }}
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateIngestPoint() }}
                          error={!!newIngestError}
                          helperText={newIngestError || ' '}
                          sx={{ '& .MuiInputBase-root': { fontSize: '0.8rem' } }}
                        />
                        <Button
                          variant="contained" size="small"
                          onClick={handleCreateIngestPoint}
                          disabled={creatingIngest || !newIngestName.trim()}
                          sx={{ mt: '1px', flexShrink: 0, bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov }, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                        >
                          {creatingIngest ? <CircularProgress size={13} sx={{ color: '#fff' }} /> : 'Create'}
                        </Button>
                      </Box>
                    </Box>
                  )}

                  <TextField
                    select fullWidth size="small"
                    value={ingestPointId}
                    onChange={e => !loadingPoints && setIngestPointId(e.target.value)}
                    disabled={loadingPoints}
                    SelectProps={{ displayEmpty: true }}
                    helperText={
                      loadingPoints
                        ? 'Checking availability…'
                        : startDate
                          ? 'Availability checked against your selected time window'
                          : 'Set start/end time to check availability'
                    }
                    InputProps={{
                      endAdornment: loadingPoints
                        ? <CircularProgress size={14} sx={{ color: AP.muted, mr: 2.5, flexShrink: 0 }} />
                        : undefined,
                    }}
                  >
                    <MenuItem value="">System Default</MenuItem>
                    {ingestPoints.map(p => (
                      <MenuItem key={p.id} value={p.id} sx={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ flex: 1 }}>{p.name}</span>
                        <Box component="span" sx={{
                          fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em',
                          px: 0.9, py: 0.25, borderRadius: '20px', flexShrink: 0, ml: 2,
                          ...(p.available
                            ? { color: '#10b981', bgcolor: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }
                            : { color: '#f59e0b', bgcolor: 'rgba(245,158,11,0.1)',  border: '1px solid rgba(245,158,11,0.3)' }
                          ),
                        }}>
                          {p.available ? 'Available' : 'In Use'}
                        </Box>
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
              )}


              <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

              {/* ── Downloadable Recording ─────────────────────── */}
              <Box
                onClick={() => setDownloadable(v => !v)}
                sx={{
                  border: `1px solid ${downloadable ? AP.liveBdr : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 1.5, p: 1.75,
                  bgcolor: downloadable ? AP.liveDim : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer', transition: 'all 0.15s',
                  '&:hover': { borderColor: downloadable ? AP.live : 'rgba(255,255,255,0.2)' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <DownloadIcon sx={{ color: downloadable ? AP.live : AP.muted, fontSize: 22, flexShrink: 0 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: downloadable ? '#fff' : AP.muted, lineHeight: 1.2 }}>
                      Downloadable Recording
                    </Typography>
                    <Typography sx={{ fontSize: '0.68rem', color: AP.muted, mt: 0.25 }}>
                      VOD asset saved 10 days · Auto-deleted after expiry
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {downloadable && (
                      <Chip label="+$5" size="small"
                        sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, bgcolor: 'rgba(16,185,129,0.15)', color: AP.live, border: `1px solid ${AP.liveBdr}` }}
                      />
                    )}
                    <Switch
                      checked={downloadable}
                      onChange={e => { e.stopPropagation(); setDownloadable(e.target.checked) }}
                      size="small"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: AP.live },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: AP.live },
                      }}
                    />
                  </Box>
                </Box>
              </Box>

              {/* ── YouTube Simulcast ──────────────────────────── */}
              {youtubeConnected ? (
                <Box
                  onClick={() => setCreateYoutube(v => !v)}
                  sx={{
                    border: `1px solid ${createYoutube ? 'rgba(255,0,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 1.5, p: 1.75,
                    bgcolor: createYoutube ? 'rgba(255,0,0,0.07)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer', transition: 'all 0.15s',
                    '&:hover': { borderColor: createYoutube ? 'rgba(255,0,0,0.6)' : 'rgba(255,255,255,0.2)' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box component="img"
                      src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg"
                      sx={{ width: 22, height: 22, flexShrink: 0, opacity: createYoutube ? 1 : 0.4 }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: createYoutube ? '#fff' : AP.muted, lineHeight: 1.2 }}>
                        Simulcast to YouTube
                      </Typography>
                      <Typography sx={{ fontSize: '0.68rem', color: AP.muted, mt: 0.25 }}>
                        {youtubeChannel?.channel_name
                          ? `Auto-creates a live stream on ${youtubeChannel.channel_name}`
                          : 'Auto-creates a YouTube Live broadcast'}
                      </Typography>
                    </Box>
                    <Switch
                      checked={createYoutube}
                      onChange={e => { e.stopPropagation(); setCreateYoutube(e.target.checked) }}
                      size="small"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: '#ff0000' },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#ff0000' },
                      }}
                    />
                  </Box>
                </Box>
              ) : (
                <Box sx={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 1.5, p: 1.75, bgcolor: 'rgba(255,255,255,0.01)', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box component="img"
                    src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg"
                    sx={{ width: 22, height: 22, flexShrink: 0, opacity: 0.25 }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(148,163,184,0.4)', lineHeight: 1.2 }}>Simulcast to YouTube</Typography>
                    <Typography sx={{ fontSize: '0.68rem', color: 'rgba(148,163,184,0.3)', mt: 0.25 }}>
                      Connect your YouTube account in Settings to enable
                    </Typography>
                  </Box>
                </Box>
              )}

              {createYoutube && youtubeConnected && (
                <TextField
                  select size="small" label="YouTube Privacy" fullWidth
                  value={youtubePrivacyStatus} onChange={e => setYoutubePrivacyStatus(e.target.value)}
                  helperText="Starting visibility of the created broadcast — you can change it later on YouTube"
                >
                  <MenuItem value="public">Public</MenuItem>
                  <MenuItem value="unlisted">Unlisted</MenuItem>
                  <MenuItem value="private">Private</MenuItem>
                </TextField>
              )}

              {/* ── Facebook Simulcast ────────────────────────── */}
              {facebookConnected ? (
                <Box
                  onClick={() => setCreateFacebook(v => !v)}
                  sx={{
                    border: `1px solid ${createFacebook ? 'rgba(24,119,242,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 1.5, p: 1.75,
                    bgcolor: createFacebook ? 'rgba(24,119,242,0.08)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer', transition: 'all 0.15s',
                    '&:hover': { borderColor: createFacebook ? 'rgba(24,119,242,0.7)' : 'rgba(255,255,255,0.2)' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 22, height: 22, borderRadius: '5px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: createFacebook ? 1 : 0.4 }}>
                      <Box component="svg" viewBox="0 0 24 24" sx={{ width: 13, height: 13, fill: '#fff' }}>
                        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                      </Box>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: createFacebook ? '#fff' : AP.muted, lineHeight: 1.2 }}>
                        Simulcast to Facebook
                      </Typography>
                      <Typography sx={{ fontSize: '0.68rem', color: AP.muted, mt: 0.25 }}>
                        {facebookPage?.page_name
                          ? `Auto-creates a live video on ${facebookPage.page_name}`
                          : 'Auto-creates a Facebook Live broadcast'}
                      </Typography>
                    </Box>
                    <Switch
                      checked={createFacebook}
                      onChange={e => { e.stopPropagation(); setCreateFacebook(e.target.checked) }}
                      size="small"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: '#1877F2' },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#1877F2' },
                      }}
                    />
                  </Box>
                </Box>
              ) : (
                <Box sx={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 1.5, p: 1.75, bgcolor: 'rgba(255,255,255,0.01)', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 22, height: 22, borderRadius: '5px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.25 }}>
                    <Box component="svg" viewBox="0 0 24 24" sx={{ width: 13, height: 13, fill: '#fff' }}>
                      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(148,163,184,0.4)', lineHeight: 1.2 }}>Simulcast to Facebook</Typography>
                    <Typography sx={{ fontSize: '0.68rem', color: 'rgba(148,163,184,0.3)', mt: 0.25 }}>
                      Connect your Facebook Page in Settings to enable
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* ── YouTube Thumbnail ─────────────────────────── */}
              {createYoutube && youtubeConnected && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: AP.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    YouTube Thumbnail <Box component="span" sx={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</Box>
                  </Typography>

                  {ytThumbPreview ? (
                    /* Preview — forced 16:9 via padding trick */
                    <Box sx={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 1.5, overflow: 'hidden', border: '1px solid rgba(255,0,0,0.35)' }}>
                      <Box component="img" src={ytThumbPreview} alt="thumbnail"
                        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <Box
                        onClick={() => { setYoutubeThumbnail(null); setYtThumbPreview(null) }}
                        sx={{
                          position: 'absolute', top: 8, right: 8,
                          bgcolor: 'rgba(0,0,0,0.65)', borderRadius: '50%',
                          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,0,0,0.9)' },
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 14, color: '#fff' }} />
                      </Box>
                    </Box>
                  ) : (
                    /* Upload drop zone */
                    <Box
                      component="label"
                      sx={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 0.75, border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 1.5,
                        py: 2.5, cursor: 'pointer', bgcolor: 'rgba(255,255,255,0.02)',
                        transition: 'all 0.15s',
                        '&:hover': { borderColor: 'rgba(255,0,0,0.4)', bgcolor: 'rgba(255,0,0,0.04)' },
                      }}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setYoutubeThumbnail(file)
                          setYtThumbPreview(URL.createObjectURL(file))
                        }}
                      />
                      <ImageIcon sx={{ fontSize: 22, color: AP.muted, opacity: 0.6 }} />
                      <Typography sx={{ fontSize: '0.72rem', color: AP.muted }}>Click to upload thumbnail</Typography>
                      <Typography sx={{ fontSize: '0.63rem', color: 'rgba(148,163,184,0.4)' }}>JPEG · PNG · 16:9 recommended</Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* ── Estimated Total ────────────────────────────── */}
              {(() => {
                const feedRate   = pricing?.feed_rate_per_hr ?? 15
                const startUtc   = channelType === 'live_event' ? toUtcIso(startDate, fromTimeInput(startTime), TZ) : null
                const endUtc     = channelType === 'live_event' ? toUtcIso(endDate,   fromTimeInput(endTime),   TZ) : null
                const hours      = (startUtc && endUtc) ? Math.max(0, (new Date(endUtc) - new Date(startUtc)) / 3_600_000) : null
                const streamCost = hours != null ? hours * feedRate : null
                const vodCost    = downloadable ? 5 : 0
                const total      = streamCost != null ? streamCost + vodCost : (downloadable ? vodCost : null)

                return (
                  <Box sx={{ border: `1px solid ${AP.accentBdr}`, borderRadius: 1.5, bgcolor: AP.accentDim }}>
                    <Box sx={{ px: 1.75, py: 1.25, display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                      {streamCost != null && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.72rem' }}>
                            Stream ({hours % 1 === 0 ? hours : hours.toFixed(1)} hr{hours !== 1 ? 's' : ''})
                          </Typography>
                          <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.72rem' }}>{fmtUSD(streamCost)}</Typography>
                        </Box>
                      )}
                      {downloadable && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.72rem' }}>Downloadable Recording</Typography>
                          <Typography variant="caption" sx={{ color: AP.live, fontSize: '0.72rem', fontWeight: 700 }}>+{fmtUSD(vodCost)}</Typography>
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.72rem' }}>CDN</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(148,163,184,0.4)', fontSize: '0.72rem' }}>—</Typography>
                      </Box>
                      <Divider sx={{ borderColor: AP.accentBdr, my: 0.25 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#cbd5e1', letterSpacing: '0.06em' }}>ESTIMATED TOTAL</Typography>
                        <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: AP.accent }}>
                          {total != null ? fmtUSD(total) : streamCost == null ? '—' : fmtUSD(vodCost)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mt: 0.25 }}>
                        <InfoOutlinedIcon sx={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', mt: '2px', flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ color: 'rgba(148,163,184,0.4)', fontSize: '0.65rem', lineHeight: 1.4 }}>
                          CDN delivery cost is calculated after the stream ends based on actual viewer minutes.
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                )
              })()}
            </>
          ) : (
            /* ── Result card ─────────────────────────────────── */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Alert severity="success" sx={{ fontSize: '0.8rem' }}>
                <strong>{result.name}</strong> created successfully!
                {result.downloadable && (
                  <Box component="span" sx={{ display: 'block', fontSize: '0.75rem', mt: 0.25, color: 'inherit', opacity: 0.85 }}>
                    Recording will be available for download for 10 days after the stream ends.
                  </Box>
                )}
              </Alert>

              {/* Connection Details */}
              <Box sx={{ bgcolor: 'rgba(0,0,0,0.3)', border: `1px solid ${AP.accentBdr}`, borderRadius: 1.5, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={sectionLabel}>CONNECTION DETAILS</Typography>

                {(result.ingest_address || result.raw?.ingest_address) && (
                  <CopyRow
                    fieldKey="ingest"
                    label="INGEST URL"
                    value={result.ingest_address || result.raw?.ingest_address}
                    icon={<LinkIcon />}
                  />
                )}
                {(result.ingest_stream_key || result.raw?.connection_code) && (
                  <CopyRow
                    fieldKey="key"
                    label="STREAM KEY"
                    value={result.ingest_stream_key || result.raw?.connection_code}
                    icon={<VpnKeyIcon />}
                  />
                )}
                {result.stream_url && (
                  <CopyRow
                    fieldKey="playback"
                    label="PLAYBACK URL (HLS)"
                    value={result.stream_url}
                    icon={<PlayArrowIcon />}
                  />
                )}
              </Box>

              {/* Stream Info */}
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 1.5, p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography sx={sectionLabel}>STREAM INFO</Typography>
                {[
                  { label: 'STREAM ID',  value: result.id },
                  { label: 'SITE ID',    value: result.site_id || 'nowvcKsD' },
                  { label: 'TYPE',       value: result.stream_type || '—' },
                  { label: 'INGEST FORMAT', value: result.ingest_format || '—' },
                ].map(row => (
                  <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: AP.muted, fontWeight: 700, letterSpacing: '0.07em', fontSize: '0.6rem' }}>{row.label}</Typography>
                    <Typography variant="caption" sx={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.7rem' }}>{row.value}</Typography>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: AP.muted, fontWeight: 700, letterSpacing: '0.07em', fontSize: '0.6rem' }}>STATUS</Typography>
                  <Chip
                    label={
                      // No status back yet right after creation → still Creating.
                      // Otherwise defer to the shared status map so this reads the
                      // same "Scheduled" (Event) vs "Creating" (24/7) rule as every
                      // other stream status display in the app.
                      result.status
                        ? getStatusDisplay({ status: result.status, stream_type: result.stream_type }).label
                        : 'Creating'
                    }
                    size="small"
                    sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: 'rgba(255,255,255,0.06)', color: AP.muted }}
                  />
                </Box>
                {result.stream_warmup && result.stream_type !== '24/7' && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: AP.muted, fontWeight: 700, letterSpacing: '0.07em', fontSize: '0.6rem' }}>WARM-UP</Typography>
                    <Typography variant="caption" sx={{ color: AP.warn, fontFamily: 'monospace', fontSize: '0.65rem' }}>
                      {result.stream_warmup} min before go-live
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* YouTube result */}
              {result.youtube && (
                <Box sx={{ border: '1px solid rgba(255,0,0,0.3)', borderRadius: 2, bgcolor: 'rgba(255,0,0,0.05)', p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box component="img"
                      src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg"
                      sx={{ width: 16, height: 16 }}
                    />
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff' }}>YouTube Live Created</Typography>
                    {ytThumbStatus === 'uploading' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                        <CircularProgress size={10} sx={{ color: AP.muted }} />
                        <Typography sx={{ fontSize: '0.63rem', color: AP.muted }}>Uploading thumbnail…</Typography>
                      </Box>
                    )}
                    {ytThumbStatus === 'done' && (
                      <Typography sx={{ fontSize: '0.63rem', color: AP.live, ml: 'auto' }}>● Thumbnail set</Typography>
                    )}
                    {ytThumbStatus === 'error' && (
                      <Typography sx={{ fontSize: '0.63rem', color: '#f87171', ml: 'auto' }}>Thumbnail upload failed</Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <CopyRow fieldKey="yt_watch" label="WATCH URL" value={result.youtube.watch_url}
                      icon={<LinkIcon />}
                    />
                    <CopyRow fieldKey="yt_rtmp" label="RTMP URL" value={result.youtube.rtmp_url}
                      icon={<LinkIcon />}
                    />
                    <CopyRow fieldKey="yt_key" label="STREAM KEY" value={result.youtube.stream_key}
                      icon={<VpnKeyIcon />}
                    />
                  </Box>
                </Box>
              )}

              {/* Facebook result */}
              {result.facebook && (
                <Box sx={{ border: '1px solid rgba(24,119,242,0.35)', borderRadius: 2, bgcolor: 'rgba(24,119,242,0.06)', p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box sx={{ width: 16, height: 16, borderRadius: '4px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Box component="svg" viewBox="0 0 24 24" sx={{ width: 9, height: 9, fill: '#fff' }}>
                        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                      </Box>
                    </Box>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff' }}>Facebook Live Created</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <CopyRow fieldKey="fb_watch" label="WATCH URL"  value={result.facebook.watch_url}   icon={<LinkIcon />}  />
                    <CopyRow fieldKey="fb_rtmp"  label="RTMP URL"   value={result.facebook.rtmp_url}    icon={<LinkIcon />}  />
                    <CopyRow fieldKey="fb_key"   label="STREAM KEY" value={result.facebook.stream_key}  icon={<VpnKeyIcon />} />
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>{/* end scrollable content */}

        {/* Footer */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }}>
          <Button onClick={onClose} sx={{ color: '#a8bcd4' }}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && (
            <Button
              onClick={handleCreate}
              disabled={!isValid || loading}
              variant="contained"
              sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}
            >
              {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Create'}
            </Button>
          )}
        </Box>
      </Box>{/* end outer Box */}
    </Drawer>
  )
}

// ─── Tournament card (with collapsible days table) ────────────────────────────

function TournamentCard({ tournament, channels, token, onRefresh, onAddDay, onEditDay, onDeleteDay, onOpenPicker, onEditTournament, onDeleteTournament }) { // eslint-disable-line no-unused-vars
  const { tenant } = useTenant()
  const TZ         = tenant?.timezone || 'America/New_York'
  const [expanded, setExpanded] = useState(false)

  const dateRange = getTournamentDateRange(tournament)

  return (
    <Paper
      elevation={0}
      sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', mb: 2 }}
    >
      {/* Tournament header row */}
      <Box
        sx={{
          px: 2, py: 1.5,
          display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
          background: `linear-gradient(90deg, ${AP.accentDim} 0%, transparent 70%)`,
          borderBottom: expanded ? '1px solid rgba(255,255,255,0.07)' : 'none',
          cursor: 'pointer',
          '&:hover': { background: `linear-gradient(90deg, ${AP.accentMid} 0%, transparent 70%)` },
        }}
        onClick={() => setExpanded(v => !v)}
      >
        <IconButton size="small" sx={{ color: AP.accent, p: 0, mr: 0.5 }} onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 20 }} /> : <ExpandMoreIcon sx={{ fontSize: 20 }} />}
        </IconButton>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem', lineHeight: 1.2 }}>
            {tournament.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
            {tournament.location && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                <LocationOnIcon sx={{ fontSize: 12, color: '#a8bcd4' }} />
                <Typography variant="caption" sx={{ color: '#a8bcd4', fontSize: '0.7rem' }}>{tournament.location}</Typography>
              </Box>
            )}
            {dateRange && (
              <Typography variant="caption" sx={{ color: 'rgba(168,188,212,0.6)', fontSize: '0.7rem' }}>
                {tournament.location ? '·' : ''} {dateRange}
              </Typography>
            )}
            <Chip
              label={`${tournament.days?.length || 0} day${(tournament.days?.length || 0) !== 1 ? 's' : ''}`}
              size="small"
              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: 'rgba(255,255,255,0.07)', color: '#a8bcd4' }}
            />
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }} onClick={e => e.stopPropagation()}>
          <Tooltip title="Add session">
            <Button
              size="small"
              startIcon={<AddIcon sx={{ fontSize: '14px !important' }} />}
              variant="outlined"
              onClick={() => onAddDay(tournament)}
              sx={{ fontSize: '0.7rem', py: 0.3, px: 1, borderColor: AP.accentBdr, color: AP.accent, '&:hover': { borderColor: AP.accent } }}
            >
              Add Session
            </Button>
          </Tooltip>
          <Tooltip title="Edit event">
            <IconButton size="small" onClick={() => onEditTournament(tournament)} sx={{ color: '#a8bcd4', '&:hover': { color: '#fff' } }}>
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete event">
            <IconButton size="small" onClick={() => onDeleteTournament(tournament)} sx={{ color: '#a8bcd4', '&:hover': { color: '#f44336' } }}>
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Days table (collapsible) */}
      <Collapse in={expanded}>
        {!tournament.days?.length ? (
          <Box sx={{ px: 3, py: 2.5, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'rgba(168,188,212,0.5)', fontStyle: 'italic', fontSize: '0.82rem' }}>
              No sessions scheduled. Click "+ Add Session" to get started.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { color: '#a8bcd4', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', borderColor: 'rgba(255,255,255,0.05)' } }}>
                <TableCell>SESSION</TableCell>
                <TableCell>DATE</TableCell>
                <TableCell>STREAMS</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {tournament.days.map(day => {
                const dayStreams = getSessionStreams(day)
                return (
                <TableRow key={day.id} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)', py: 1.25 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff' }}>{day.label}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: '#fff', fontWeight: 600, display: 'block', whiteSpace: 'nowrap' }}>{formatDate(day.date)}</Typography>
                    <Typography variant="caption" sx={{ color: '#a8bcd4', whiteSpace: 'nowrap' }}>{day.start_time} – {day.end_time} {getTzLabel(day.tz || TZ)}</Typography>
                  </TableCell>

                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {dayStreams.length === 0 ? (
                        <Typography variant="caption" sx={{ color: 'rgba(168,188,212,0.4)', fontSize: '0.68rem', fontStyle: 'italic' }}>No streams assigned</Typography>
                      ) : dayStreams.map((st, idx) => (
                        <Box
                          key={st.id ?? idx}
                          onClick={() => onOpenPicker(idx, day, tournament.id)}
                          sx={{
                            display: 'inline-flex', alignItems: 'center', gap: 0.5,
                            cursor: 'pointer', px: 1, py: 0.4, borderRadius: 1,
                            border: '1px solid',
                            borderColor: st.url ? 'rgba(76,175,80,0.5)' : 'rgba(255,255,255,0.1)',
                            bgcolor: st.url ? 'rgba(76,175,80,0.07)' : 'transparent',
                            '&:hover': { borderColor: st.url ? '#4caf50' : AP.accent, bgcolor: st.url ? 'rgba(76,175,80,0.12)' : AP.accentDim },
                          }}
                        >
                          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: st.url ? '#4caf50' : 'rgba(168,188,212,0.3)', flexShrink: 0 }} />
                          <Typography variant="caption" sx={{ color: st.url ? '#fff' : 'rgba(168,188,212,0.4)', fontWeight: st.url ? 700 : 400, fontSize: '0.68rem' }}>
                            {st.name || `Stream ${idx + 1}`}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </TableCell>

                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      <Tooltip title="Edit session">
                        <IconButton size="small" onClick={() => onEditDay(day, tournament)} sx={{ color: '#a8bcd4', '&:hover': { color: '#fff' } }}>
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete session">
                        <IconButton size="small" onClick={() => onDeleteDay(day, tournament)} sx={{ color: '#a8bcd4', '&:hover': { color: '#f44336' } }}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </Box>
        )}
      </Collapse>
    </Paper>
  )
}

// ─── Tournament cost card ─────────────────────────────────────────────────────

function TournamentCostCard({ tournament, cdnRecords = [] }) {
  const [expanded,     setExpanded]     = useState(true)
  const [expandedDays, setExpandedDays] = useState(new Set())
  const dateRange = getTournamentDateRange(tournament)
  const hasCost   = tournament.tournamentTotal > 0

  function fmtUSD(n) { return '$' + Number(n || 0).toFixed(2) }
  function fmtGB(n)  { return Number(n || 0).toFixed(2) + ' GB' }

  function toggleDay(date) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

  const statusChip = (source) => {
    const cfg = {
      logged:    { label: 'LOGGED',    bg: AP.accentDim,                     color: AP.accent, border: AP.accentBdr },
      live:      { label: 'LIVE',      bg: 'rgba(16,185,129,0.15)',           color: '#10b981', border: 'rgba(16,185,129,0.4)' },
      pending:   { label: 'PENDING',   bg: 'rgba(245,158,11,0.12)',           color: '#f59e0b', border: 'rgba(245,158,11,0.4)' },
      scheduled: { label: 'SCHEDULED', bg: 'rgba(99,102,241,0.1)',            color: '#818cf8', border: 'rgba(99,102,241,0.3)' },
      none:      { label: 'NO DATA',   bg: 'rgba(168,188,212,0.06)',          color: 'rgba(168,188,212,0.35)', border: 'rgba(168,188,212,0.15)' },
    }[source] || {}
    return (
      <Chip label={cfg.label} size="small" sx={{
        fontSize: '0.57rem', height: 16, fontWeight: 700, letterSpacing: '0.05em',
        bgcolor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      }} />
    )
  }

  return (
    <Paper elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', mb: 2 }}>
      {/* Card header */}
      <Box
        sx={{
          px: 2, py: 1.5,
          display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
          background: `linear-gradient(90deg, ${AP.accentDim} 0%, transparent 70%)`,
          borderBottom: expanded ? '1px solid rgba(255,255,255,0.07)' : 'none',
          cursor: 'pointer',
          '&:hover': { background: `linear-gradient(90deg, ${AP.accentMid} 0%, transparent 70%)` },
        }}
        onClick={() => setExpanded(v => !v)}
      >
        <IconButton size="small" sx={{ color: AP.accent, p: 0, mr: 0.5 }} onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 20 }} /> : <ExpandMoreIcon sx={{ fontSize: 20 }} />}
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem', lineHeight: 1.2 }}>{tournament.name}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
            {tournament.location && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                <LocationOnIcon sx={{ fontSize: 12, color: '#a8bcd4' }} />
                <Typography variant="caption" sx={{ color: '#a8bcd4', fontSize: '0.7rem' }}>{tournament.location}</Typography>
              </Box>
            )}
            {dateRange && (
              <Typography variant="caption" sx={{ color: 'rgba(168,188,212,0.6)', fontSize: '0.7rem' }}>
                {tournament.location ? '·' : ''} {dateRange}
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography sx={{
            color: hasCost ? AP.accent : 'rgba(168,188,212,0.35)',
            fontWeight: 700, fontSize: '1.05rem',
            fontFamily: "'Bayon', sans-serif", letterSpacing: '0.04em', lineHeight: 1,
          }}>
            {hasCost ? fmtUSD(tournament.tournamentTotal) : '—'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(168,188,212,0.45)', fontSize: '0.62rem' }}>
            feed fees + CDN
          </Typography>
        </Box>
      </Box>

      <Collapse in={expanded}>
        {!tournament.days?.length ? (
          <Box sx={{ px: 3, py: 2.5, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'rgba(168,188,212,0.5)', fontStyle: 'italic', fontSize: '0.82rem' }}>
              No sessions scheduled.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { color: '#a8bcd4', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', borderColor: 'rgba(255,255,255,0.05)', whiteSpace: 'nowrap' } }}>
                  <TableCell>SESSION</TableCell>
                  <TableCell>DATE</TableCell>
                  <TableCell>FEEDS</TableCell>
                  <TableCell>STREAM HRS</TableCell>
                  <TableCell>GB DEL</TableCell>
                  <TableCell>FEED FEE</TableCell>
                  <TableCell>CDN COST</TableCell>
                  <TableCell>TOTAL</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tournament.days.map(day => {
                  const logged    = day.source === 'logged'
                  const pending   = day.source === 'pending'
                  const live      = day.source === 'live'
                  const scheduled = day.source === 'scheduled'
                  const none      = day.source === 'none'
                  const dayOpen   = expandedDays.has(day.date)
                  const dayFeeds  = cdnRecords.filter(r => r.date === day.date && Number(r.tournament_id) === tournament.id)
                  const clickable = logged || pending || live

                  return (
                    <React.Fragment key={day.id || day.date}>
                      {/* ── Day summary row ── */}
                      <TableRow
                        onClick={() => clickable && toggleDay(day.date)}
                        sx={{
                          '& td': { borderColor: dayOpen ? 'transparent' : 'rgba(255,255,255,0.05)', py: 1.25 },
                          bgcolor: dayOpen ? 'rgba(99,102,241,0.04)' : 'transparent',
                          opacity: (none || scheduled) ? 0.5 : 1,
                          cursor: clickable ? 'pointer' : 'default',
                          '&:hover td': clickable ? { bgcolor: 'rgba(255,255,255,0.025)' } : {},
                        }}
                      >
                        <TableCell sx={{ pl: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            {clickable && (
                              <Box sx={{ color: AP.muted, display: 'flex', alignItems: 'center', transition: 'transform 0.15s', transform: dayOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                <ChevronRightIcon sx={{ fontSize: 16 }} />
                              </Box>
                            )}
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff', fontSize: '0.82rem' }}>{day.label}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ color: '#a8bcd4', whiteSpace: 'nowrap' }}>{formatDate(day.date)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ color: '#a8bcd4' }}>
                            {day.feedCount > 0 ? day.feedCount : '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ color: '#a8bcd4' }}>
                            {day.stream_hours > 0
                              ? `${Number(day.stream_hours).toFixed(2)}h${(live || pending) ? ' (est.)' : ''}`
                              : '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ color: '#a8bcd4' }}>
                            {logged ? fmtGB(day.gb_delivered) : '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ color: '#a8bcd4' }}>
                            {logged ? fmtUSD(day.cost_feed)
                              : (live || pending) && day.est_feed > 0 ? fmtUSD(day.est_feed)
                              : '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {logged ? (
                            <Typography variant="caption" sx={{ color: '#a8bcd4' }}>{fmtUSD(day.cost_cdn)}</Typography>
                          ) : (
                            <Typography variant="caption" sx={{
                              fontStyle: 'italic', whiteSpace: 'nowrap',
                              color: live ? '#10b981' : pending ? '#f59e0b' : 'rgba(168,188,212,0.3)',
                              fontSize: '0.68rem',
                            }}>
                              {live ? 'In progress…' : pending ? 'Pending' : scheduled ? 'Upcoming' : '—'}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{
                            color: logged ? AP.accent : 'rgba(168,188,212,0.35)',
                            fontWeight: logged ? 700 : 400,
                            fontSize:   logged ? '0.78rem' : '0.72rem',
                          }}>
                            {logged ? fmtUSD(day.cost_total) : '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>

                      {/* ── Expanded feed rows (same columns as day row) ── */}
                      {dayOpen && (dayFeeds.length === 0 ? (
                        <TableRow sx={{ '& td': { borderColor: 'rgba(255,255,255,0.04)', bgcolor: 'rgba(0,0,0,0.15)' } }}>
                          <TableCell colSpan={8} sx={{ pl: 5, py: 1.5 }}>
                            <Typography variant="caption" sx={{ color: AP.muted, fontStyle: 'italic', fontSize: '0.75rem' }}>
                              No feeds logged for this session yet.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : dayFeeds.map(f => (
                        <TableRow key={f.id} sx={{
                          '& td': { borderColor: 'rgba(255,255,255,0.04)', py: 1, bgcolor: 'rgba(0,0,0,0.15)' },
                          '&:last-child td': { borderBottom: '1px solid rgba(255,255,255,0.05)' },
                        }}>
                          {/* DAY col → feed name indented */}
                          <TableCell sx={{ pl: 4 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ width: 2, height: 28, bgcolor: AP.accentBdr, borderRadius: 1, flexShrink: 0 }} />
                              <Box>
                                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: AP.text }}>{f.channel_name}</Typography>
                                <Typography sx={{ fontSize: '0.6rem', color: AP.muted, fontFamily: 'monospace' }}>{f.channel_id}</Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          {/* DATE col → same date as parent day */}
                          <TableCell>
                            <Typography sx={{ fontSize: '0.7rem', color: AP.muted, whiteSpace: 'nowrap' }}>
                              {formatDate(f.date)}
                            </Typography>
                          </TableCell>
                          {/* FEEDS col → empty */}
                          <TableCell />
                          {/* STREAM HRS */}
                          <TableCell sx={{ fontSize: '0.75rem', color: AP.muted }}>{Number(f.stream_hours).toFixed(2)}h</TableCell>
                          {/* GB DEL */}
                          <TableCell sx={{ fontSize: '0.75rem', color: AP.muted }}>{Number(f.minutes_delivered) > 0 ? fmtGB(f.gb_delivered) : '—'}</TableCell>
                          {/* FEED FEE */}
                          <TableCell sx={{ fontSize: '0.75rem', color: AP.muted }}>{fmtUSD(f.cost_feed)}</TableCell>
                          {/* CDN COST */}
                          <TableCell>
                            {Number(f.minutes_delivered) > 0
                              ? <Typography sx={{ fontSize: '0.75rem', color: AP.muted }}>{fmtUSD(f.cost_cdn)}</Typography>
                              : <Chip label="Pending" size="small" sx={{ height: 16, fontSize: '0.58rem', fontWeight: 700, bgcolor: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }} />
                            }
                          </TableCell>
                          {/* TOTAL */}
                          <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: AP.accent }}>{fmtUSD(f.cost_total)}</TableCell>
                        </TableRow>
                      )))}

                    </React.Fragment>
                  )
                })}
                {/* Subtotal */}
                {hasCost && (
                  <TableRow sx={{ '& td': { borderColor: 'rgba(255,255,255,0.07)', borderTop: '1px solid rgba(255,255,255,0.1)', py: 1 } }}>
                    <TableCell colSpan={6} sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" sx={{ color: '#a8bcd4', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.08em' }}>
                        EVENT TOTAL
                      </Typography>
                    </TableCell>
                    <TableCell colSpan={2}>
                      <Typography sx={{ color: AP.accent, fontWeight: 700, fontSize: '0.88rem', fontFamily: "'Bayon', sans-serif" }}>
                        {fmtUSD(tournament.tournamentTotal)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        )}
      </Collapse>
    </Paper>
  )
}

// ─── Costs page ───────────────────────────────────────────────────────────────

function CostsPage({ tournaments, channels, cdnRecords = [], cdnPricing }) {
  const { tenant } = useTenant()
  const TZ         = tenant?.timezone || 'America/New_York'

  function fmtUSD(n) { return '$' + Number(n || 0).toFixed(2) }

  // ── date → JW channels map ─────────────────────────────────────────────────
  const channelsByDate = {}
  channels.forEach(ch => {
    if (!ch.stream_start) return
    const date = new Date(ch.stream_start).toLocaleDateString('en-CA', { timeZone: TZ })
    if (!channelsByDate[date]) channelsByDate[date] = []
    channelsByDate[date].push(ch)
  })

  function streamHours(ch) {
    const s = new Date(ch.stream_start)
    const e = ch.stream_end ? new Date(ch.stream_end) : new Date()
    return Math.max(0, (e - s) / 3_600_000)
  }
  function estFeedFee(ch) {
    const overrides = cdnPricing?.channel_overrides?.[ch.id] || {}
    const rate = overrides.feed_rate_per_hr ?? cdnPricing?.feed_rate_per_hr ?? 15
    return streamHours(ch) * rate
  }

  // ── Build enriched tournament rollup from cdn records ────────────────────
  const tournamentRollup = tournaments.map(t => {
    let tournamentTotal = 0
    const enrichedDays = (t.days || []).map(day => {
      const recs       = cdnRecords.filter(r => r.date === day.date && Number(r.tournament_id) === t.id)
      const jwChannels = channelsByDate[day.date] || []

      if (recs.length > 0) {
        // LOGGED — sum all cdn records for this day
        const totals = recs.reduce((s, r) => ({
          stream_hours: s.stream_hours + (r.stream_hours  || 0),
          gb_delivered: s.gb_delivered + (r.gb_delivered  || 0),
          cost_feed:    s.cost_feed    + (r.cost_feed     || 0),
          cost_cdn:     s.cost_cdn     + (r.cost_cdn      || 0),
          cost_total:   s.cost_total   + (r.cost_total    || 0),
        }), { stream_hours: 0, gb_delivered: 0, cost_feed: 0, cost_cdn: 0, cost_total: 0 })
        tournamentTotal += totals.cost_total
        return { ...day, ...totals, feedCount: recs.length, source: 'logged' }
      } else if (jwChannels.length > 0) {
        // Determine day status from JW channel status field
        const isActive    = jwChannels.some(ch => ['active','streaming'].includes(ch.status?.toLowerCase()))
        const hasEnded    = jwChannels.some(ch => ch.stream_end && new Date(ch.stream_end) <= new Date())
        const isScheduled = !isActive && !hasEnded
        const source      = isActive ? 'live' : hasEnded ? 'pending' : 'scheduled'
        const estHours    = jwChannels.reduce((s, ch) => s + streamHours(ch), 0)
        const est_feed    = isActive ? jwChannels.reduce((s, ch) => s + estFeedFee(ch), 0) : 0
        return { ...day, stream_hours: isScheduled ? 0 : estHours, est_feed, feedCount: jwChannels.length, source }
      }
      return { ...day, feedCount: 0, stream_hours: 0, source: 'none' }
    })
    return { ...t, days: enrichedDays, tournamentTotal }
  })

  const grandTotal = tournamentRollup.reduce((s, t) => s + t.tournamentTotal, 0)

  // Unattributed cdn records (no tournament_id)
  const unattributed = cdnRecords.filter(r => !r.tournament_id)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* ── Tournament Cost Rollup ─────────────────────────────── */}
      <Paper elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{
          px: 2, py: 1.5,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: `linear-gradient(90deg, ${AP.accentDim} 0%, transparent 60%)`,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AttachMoneyIcon sx={{ color: AP.accent, fontSize: 18 }} />
            <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem' }}>
              EVENT COSTS
            </Typography>
          </Box>
          {grandTotal > 0 && (
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ color: AP.accent, fontWeight: 700, fontSize: '1.1rem', fontFamily: "'Bayon', sans-serif", letterSpacing: '0.04em', lineHeight: 1 }}>
                {fmtUSD(grandTotal)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(168,188,212,0.5)', fontSize: '0.62rem' }}>
                all events · feed fees + CDN
              </Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ p: 2 }}>
          {tournamentRollup.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'rgba(168,188,212,0.5)', textAlign: 'center', py: 2 }}>
              No events found.
            </Typography>
          ) : (
            tournamentRollup.map(t => (
              <TournamentCostCard key={t.id} tournament={t} cdnRecords={cdnRecords} />
            ))
          )}
        </Box>
      </Paper>

      {/* ── Unattributed records (no tournament_id) ───────────── */}
      {unattributed.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{
            px: 2, py: 1.5,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            background: `linear-gradient(90deg, ${AP.accentDim} 0%, transparent 60%)`,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LiveTvIcon sx={{ color: AP.muted, fontSize: 18 }} />
              <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem', color: AP.muted }}>
                UNATTRIBUTED FEEDS
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(168,188,212,0.4)', fontSize: '0.65rem' }}>
                — not linked to a tournament
              </Typography>
            </Box>
          </Box>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { color: '#a8bcd4', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', borderColor: 'rgba(255,255,255,0.05)', whiteSpace: 'nowrap' } }}>
                  <TableCell>DATE</TableCell>
                  <TableCell>LABEL</TableCell>
                  <TableCell>FEED</TableCell>
                  <TableCell>STREAM HRS</TableCell>
                  <TableCell>GB DEL</TableCell>
                  <TableCell>FEED FEE</TableCell>
                  <TableCell>CDN COST</TableCell>
                  <TableCell>TOTAL</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unattributed.map(r => (
                  <TableRow key={r.id} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)', py: 1 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                    <TableCell sx={{ fontSize: '0.75rem', color: AP.muted, whiteSpace: 'nowrap' }}>{r.date}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: AP.text }}>{r.label}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: AP.text }}>{r.channel_name}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: AP.muted }}>{Number(r.stream_hours).toFixed(2)}h</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: AP.muted }}>{Number(r.gb_delivered || 0).toFixed(2)} GB</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: AP.muted }}>{fmtUSD(r.cost_feed)}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: AP.muted }}>{fmtUSD(r.cost_cdn)}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: AP.accent }}>{fmtUSD(r.cost_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}

      {/* ── Pricing footnote ──────────────────────────────────── */}
      {cdnPricing && (
        <Typography variant="caption" sx={{ color: 'rgba(168,188,212,0.35)', fontSize: '0.65rem', textAlign: 'right' }}>
          Rates: ${cdnPricing.feed_rate_per_hr}/hr per feed · ${cdnPricing.cdn_rate_per_gb}/GB CDN
          {Object.keys(cdnPricing.channel_overrides || {}).length > 0 && ' · Per-channel overrides active'}
        </Typography>
      )}
    </Box>
  )
}

// ─── Preview player dialog ────────────────────────────────────────────────────

function PreviewPlayerDialog({ open, onClose, onExited, channelName, streamUrl }) {
  const playerRef = useRef(null)
  const divRef    = useRef(null)

  useEffect(() => {
    if (!open || !streamUrl) return
    let cancelled = false
    loadJWScript()
      .then(() => {
        if (cancelled || !divRef.current || !window.jwplayer) return
        if (playerRef.current) { try { playerRef.current.remove() } catch (_) {} }
        playerRef.current = window.jwplayer(PREVIEW_DIV_ID).setup({
          file: streamUrl,
          width: '100%',
          aspectratio: '16:9',
          autostart: true,
          mute: true,
        })
      })
      .catch(err => console.error('JW preview failed:', err))
    return () => {
      cancelled = true
      // Remove JW player before React unmounts the div to avoid DOM conflicts
      if (playerRef.current) {
        try { playerRef.current.remove() } catch (_) {}
        playerRef.current = null
      }
    }
  }, [open, streamUrl])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      TransitionProps={{ onExited }}
      PaperProps={{ sx: { bgcolor: '#000', border: `1px solid ${AP.accentBdr}`, borderRadius: 2 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, px: 2, bgcolor: AP.paper, borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LiveTvIcon sx={{ color: AP.accent, fontSize: 16 }} />
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: AP.text }}>
            {channelName || 'Preview'}
          </Typography>
          <Chip label="ADMIN PREVIEW" size="small" sx={{ height: 16, fontSize: '0.57rem', fontWeight: 700, bgcolor: AP.accentMid, color: AP.accent }} />
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: AP.muted, '&:hover': { color: AP.text } }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {/* Always keep the div mounted while the dialog is alive — never conditionally
            swap it out mid-animation or JW's direct DOM manipulation conflicts with
            React's reconciler (removeChild NotFoundError). */}
        <div id={PREVIEW_DIV_ID} ref={divRef} style={{ width: '100%' }}>
          {!streamUrl && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, bgcolor: '#000' }}>
              <Typography variant="body2" sx={{ color: AP.muted }}>No stream URL available</Typography>
            </Box>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tenant settings panel ────────────────────────────────────────────────────

function ColorField({ label, value, onChange }) {
  const safe = /^#[0-9a-fA-F]{3,6}$/.test(value) ? value : '#000000'
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <TextField
        size="small" fullWidth label={label}
        value={value} onChange={e => onChange(e.target.value)}
        inputProps={{ spellCheck: false }}
        sx={{ '& input': { fontFamily: 'monospace', fontSize: '0.82rem' } }}
      />
      <Box
        component="input" type="color" value={safe}
        onChange={e => onChange(e.target.value)}
        sx={{ width: 38, height: 38, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 1, p: '3px', bgcolor: 'transparent', flexShrink: 0 }}
      />
    </Box>
  )
}

const COMPONENT_LABELS = {
  video_player:    'Video Player',
  camera_selector: 'Camera Selector',
  event_schedule:  'Event Schedule',
  command_center:  'Command Center',
  pre_show_screen: 'Pre-Show Screen',
}

function TenantSettingsPanel({ token, tenantId }) {
  const [form, setForm]       = useState(null)
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tenant', { headers: { 'X-Tenant-Id': tenantId } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setForm({
          title:    data.title    || '',
          subtitle: data.subtitle || '',
          logo_url: data.logo_url || '',
          timezone: data.timezone || 'America/New_York',
          colors: {
            primary:    data.colors?.primary    || '#e65d2c',
            secondary:  data.colors?.secondary  || '#0a205a',
            background: data.colors?.background || '#060e24',
            paper:      data.colors?.paper      || '#0d1e42',
          },
          components: {
            video_player:    data.components?.video_player    !== false,
            camera_selector: data.components?.camera_selector !== false,
            event_schedule:  data.components?.event_schedule  !== false,
            command_center:  data.components?.command_center  !== false,
            pre_show_screen: data.components?.pre_show_screen !== false,
          },
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function setField(path, value) {
    setForm(f => {
      const [top, sub] = path.split('.')
      if (!sub) return { ...f, [top]: value }
      return { ...f, [top]: { ...f[top], [sub]: value } }
    })
  }

  async function handleSave() {
    setSaving(true); setSaveMsg(''); setSaveErr('')
    try {
      const res = await fetch('/api/tenant', {
        method: 'PUT',
        headers: authHeader(token, tenantId),
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSaveMsg('Settings saved — changes will take effect on next page load.')
      setTimeout(() => setSaveMsg(''), 6000)
    } catch (err) {
      setSaveErr(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress size={28} sx={{ color: AP.accent }} />
    </Box>
  )
  if (!form) return <Alert severity="error">Failed to load tenant settings</Alert>

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {saveMsg && <Alert severity="success">{saveMsg}</Alert>}
      {saveErr && <Alert severity="error">{saveErr}</Alert>}

      {/* ── Row 1: Branding + Feature Flags side by side ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>

        {/* Branding */}
        <Paper elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.07)', background: `linear-gradient(90deg, ${AP.accentDim} 0%, transparent 60%)` }}>
            <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '0.95rem' }}>BRANDING</Typography>
          </Box>
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
            <TextField size="small" fullWidth label="Team / Organization Name" value={form.title} onChange={e => setField('title', e.target.value)} />
            <TextField size="small" fullWidth label="Subtitle" value={form.subtitle} onChange={e => setField('subtitle', e.target.value)} placeholder="e.g. Sport Fishing Championship" />
            <TextField size="small" fullWidth label="Logo URL" value={form.logo_url} onChange={e => setField('logo_url', e.target.value)} placeholder="https://..." />
            <TextField
              select size="small" fullWidth label="Default Timezone"
              value={form.timezone || 'America/New_York'}
              onChange={e => setField('timezone', e.target.value)}
              helperText="All event times are displayed in this timezone"
            >
              {TIMEZONE_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
            {form.logo_url && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box component="img" src={form.logo_url} alt="Logo preview"
                  sx={{ width: 44, height: 44, objectFit: 'contain', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1, bgcolor: 'rgba(0,0,0,0.4)', p: 0.5, flexShrink: 0 }} />
                <Typography variant="caption" sx={{ color: AP.muted }}>Logo preview</Typography>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Feature Flags */}
        <Paper elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.07)', background: `linear-gradient(90deg, ${AP.accentDim} 0%, transparent 60%)` }}>
            <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '0.95rem' }}>FEATURE FLAGS</Typography>
          </Box>
          <Box sx={{ px: 2, py: 0.5 }}>
            {Object.entries(COMPONENT_LABELS).map(([key, label], i, arr) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <Box>
                  <Typography variant="body2" sx={{ color: AP.text, fontWeight: 600, fontSize: '0.82rem' }}>{label}</Typography>
                  <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.6rem', fontFamily: 'monospace' }}>{key}</Typography>
                </Box>
                <Switch
                  checked={form.components[key]}
                  onChange={e => setField(`components.${key}`, e.target.checked)}
                  size="small"
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked':                     { color: AP.accent },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track':  { bgcolor: AP.accent },
                  }}
                />
              </Box>
            ))}
          </Box>
        </Paper>
      </Box>

      {/* ── Row 2: Color Palette (full width, compact) ── */}
      <Paper elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.07)', background: `linear-gradient(90deg, ${AP.accentDim} 0%, transparent 60%)`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PaletteIcon sx={{ color: AP.accent, fontSize: 16 }} />
          <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '0.95rem' }}>COLOR PALETTE</Typography>
        </Box>
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
          <ColorField label="Primary"    value={form.colors.primary}    onChange={v => setField('colors.primary', v)} />
          <ColorField label="Secondary"  value={form.colors.secondary}  onChange={v => setField('colors.secondary', v)} />
          <ColorField label="Background" value={form.colors.background} onChange={v => setField('colors.background', v)} />
          <ColorField label="Paper"      value={form.colors.paper}      onChange={v => setField('colors.paper', v)} />
        </Box>
      </Paper>

      {/* ── Save ── */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov }, fontWeight: 700, px: 3 }}
        >
          {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Save Settings'}
        </Button>
      </Box>
    </Box>
  )
}

// ─── YouTube Integration ──────────────────────────────────────────────────────

const YOUTUBE_ICON_URL = 'https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg'

function useYoutubeIntegration(token, tenantId) {
  const [status,        setStatus]        = useState(null)   // null | { connected, channel_name, channel_thumbnail }
  const [loading,       setLoading]       = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [connecting,    setConnecting]    = useState(false)

  useEffect(() => {
    fetch('/api/youtube-status', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : null)
      .then(data => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [token, tenantId])

  async function connect() {
    setConnecting(true)
    try {
      const res = await fetch('/api/oauth-ticket', { headers: authHeader(token, tenantId) })
      if (!res.ok) throw new Error('Failed to start YouTube connection')
      const { ticket } = await res.json()
      window.location.href = `/api/youtube-auth?ticket=${encodeURIComponent(ticket)}`
    } catch (err) {
      alert(err.message)
      setConnecting(false)
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect YouTube? Future streams will not simulcast to YouTube.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/youtube-disconnect', {
        method: 'DELETE',
        headers: authHeader(token, tenantId),
      })
      setStatus({ connected: false })
    } catch (err) {
      alert('Failed to disconnect: ' + err.message)
    } finally {
      setDisconnecting(false)
    }
  }

  return { status, loading, connecting, disconnecting, connect, disconnect }
}

function YouTubeEditDialog({ open, onClose, integration }) {
  const { status, loading, connecting, disconnecting, connect, disconnect } = integration

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box component="img" src={YOUTUBE_ICON_URL} sx={{ width: 22, height: 22 }} />
        YouTube
        <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography sx={{ fontSize: '0.75rem', color: AP.muted, mt: -1, mb: 0.5 }}>Simulcast live streams to your YouTube channel</Typography>

        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={14} sx={{ color: AP.muted }} />
            <Typography sx={{ fontSize: '0.75rem', color: AP.muted }}>Checking connection…</Typography>
          </Box>
        ) : status?.connected ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {status.channel_thumbnail && (
                <Box component="img" src={status.channel_thumbnail}
                  sx={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(255,0,0,0.4)' }}
                />
              )}
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{status.channel_name || 'Google Account (no channel)'}</Typography>
                <Typography sx={{ fontSize: '0.68rem', color: AP.live }}>● Connected</Typography>
              </Box>
              <Button
                size="small" variant="outlined"
                onClick={disconnect}
                disabled={disconnecting}
                sx={{ fontSize: '0.72rem', borderColor: 'rgba(239,68,68,0.4)', color: '#f87171',
                  '&:hover': { borderColor: '#f87171', bgcolor: 'rgba(239,68,68,0.08)' } }}
              >
                {disconnecting ? <CircularProgress size={12} /> : 'Disconnect'}
              </Button>
            </Box>
            {!status.channel_name && (
              <Box sx={{ bgcolor: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 1.5, px: 1.5, py: 1 }}>
                <Typography sx={{ fontSize: '0.7rem', color: '#fbbf24', lineHeight: 1.5 }}>
                  No YouTube channel found on this account. To simulcast, the connected Google account must have a YouTube channel.{' '}
                  <Box component="a" href="https://www.youtube.com/create_channel" target="_blank" rel="noopener noreferrer"
                    sx={{ color: '#fbbf24', textDecoration: 'underline' }}>
                    Create one on YouTube
                  </Box>
                  {' '}then disconnect and reconnect here.
                </Typography>
              </Box>
            )}
          </Box>
        ) : (
          <Button
            variant="contained"
            onClick={connect}
            disabled={connecting}
            startIcon={
              connecting ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : (
                <Box component="img" src={YOUTUBE_ICON_URL} sx={{ width: 16, height: 16 }} />
              )
            }
            sx={{ bgcolor: '#ff0000', '&:hover': { bgcolor: '#cc0000' }, fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none', alignSelf: 'flex-start' }}
          >
            Connect YouTube Account
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Facebook Integration ─────────────────────────────────────────────────────

// Facebook "f" logo — inline SVG keeps us dependency-free
const FACEBOOK_F_PATH = 'M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z'

function FacebookIcon({ size = 24 }) {
  return (
    <Box sx={{ width: size, height: size, borderRadius: '6px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Box component="svg" viewBox="0 0 24 24" sx={{ width: size * 0.58, height: size * 0.58, fill: '#fff' }}>
        <path d={FACEBOOK_F_PATH} />
      </Box>
    </Box>
  )
}

function useFacebookIntegration(token, tenantId) {
  const [status,        setStatus]        = useState(null)   // null | { connected, page_id, page_name, page_picture }
  const [loading,       setLoading]       = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [connecting,    setConnecting]    = useState(false)

  useEffect(() => {
    fetch('/api/facebook-status', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : null)
      .then(data => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [token, tenantId])

  async function connect() {
    setConnecting(true)
    try {
      const res = await fetch('/api/oauth-ticket', { headers: authHeader(token, tenantId) })
      if (!res.ok) throw new Error('Failed to start Facebook connection')
      const { ticket } = await res.json()
      window.location.href = `/api/facebook-auth?ticket=${encodeURIComponent(ticket)}`
    } catch (err) {
      alert(err.message)
      setConnecting(false)
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect Facebook? Future streams will not simulcast to Facebook.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/facebook-disconnect', {
        method:  'DELETE',
        headers: authHeader(token, tenantId),
      })
      setStatus({ connected: false })
    } catch (err) {
      alert('Failed to disconnect: ' + err.message)
    } finally {
      setDisconnecting(false)
    }
  }

  return { status, loading, connecting, disconnecting, connect, disconnect }
}

function FacebookEditDialog({ open, onClose, integration }) {
  const { status, loading, connecting, disconnecting, connect, disconnect } = integration

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <FacebookIcon size={22} />
        Facebook
        <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography sx={{ fontSize: '0.75rem', color: AP.muted, mt: -1, mb: 0.5 }}>Simulcast live streams to your Facebook Page</Typography>

        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={14} sx={{ color: AP.muted }} />
            <Typography sx={{ fontSize: '0.75rem', color: AP.muted }}>Checking connection…</Typography>
          </Box>
        ) : status?.connected ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {status.page_picture && (
              <Box component="img" src={status.page_picture}
                sx={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(24,119,242,0.5)' }}
              />
            )}
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{status.page_name || 'Facebook Page'}</Typography>
              <Typography sx={{ fontSize: '0.68rem', color: '#60a5fa' }}>● Connected</Typography>
            </Box>
            <Button
              size="small" variant="outlined"
              onClick={disconnect}
              disabled={disconnecting}
              sx={{ fontSize: '0.72rem', borderColor: 'rgba(239,68,68,0.4)', color: '#f87171',
                '&:hover': { borderColor: '#f87171', bgcolor: 'rgba(239,68,68,0.08)' } }}
            >
              {disconnecting ? <CircularProgress size={12} /> : 'Disconnect'}
            </Button>
          </Box>
        ) : (
          <Button
            variant="contained"
            onClick={connect}
            disabled={connecting}
            startIcon={connecting ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <FacebookIcon size={16} />}
            sx={{ bgcolor: '#1877F2', '&:hover': { bgcolor: '#1464d0' }, fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none', alignSelf: 'flex-start' }}
          >
            Connect Facebook Page
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Ingest Points Panel ──────────────────────────────────────────────────────

const INGEST_POINT_FORMATS = [
  { value: 'rtmp',    label: 'RTMP'    },
  { value: 'srt',     label: 'SRT'     },
  { value: 'rtp',     label: 'RTP'     },
  { value: 'rtp_fec', label: 'RTP FEC' },
]

function IngestPointsPanel({ token, tenantId }) {
  const [points,       setPoints]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [newName,      setNewName]      = useState('')
  const [newFormat,    setNewFormat]    = useState('rtmp')
  const [showForm,     setShowForm]     = useState(false)
  const [creating,     setCreating]     = useState(false)
  const [deletingId,   setDeletingId]   = useState(null)
  const [formError,    setFormError]    = useState('')

  useEffect(() => { fetchPoints() }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  function fetchPoints() {
    setLoading(true)
    // Single request — the backend merges all formats via spaced-out
    // sequential JW calls instead of firing 4 parallel ones from here,
    // which was tripping JW's 60/min rate limit.
    fetch('/api/ingest-points?all=1', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : { ingest_points: [] })
      .then(d => setPoints(d.ingest_points || []))
      .catch(() => setPoints([]))
      .finally(() => setLoading(false))
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    setFormError('')
    try {
      const res = await fetch('/api/create-ingest-point', {
        method:  'POST',
        headers: authHeader(token, tenantId),
        body:    JSON.stringify({ name: newName.trim(), ingest_format: newFormat }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || `Error ${res.status}`); return }
      setNewName('')
      setShowForm(false)
      fetchPoints()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(point) {
    if (!point.available) return // blocked — shown via UI, not confirm
    if (!confirm(`Delete ingest point "${point.name}"? This cannot be undone.`)) return
    setDeletingId(point.id)
    try {
      await fetch('/api/delete-ingest-point', {
        method:  'DELETE',
        headers: authHeader(token, tenantId),
        body:    JSON.stringify({ id: point.id }),
      })
      setPoints(prev => prev.filter(p => p.id !== point.id))
    } catch (_) { /* non-fatal */ } finally {
      setDeletingId(null)
    }
  }

  const fmtColors = {
    rtmp:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
    srt:     { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.3)'  },
    rtp:     { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)'  },
    rtp_fec: { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)'  },
  }

  return (
    <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, pt: 2, pb: showForm ? 1.5 : 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <RouterIcon sx={{ fontSize: 22, color: AP.muted }} />
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', lineHeight: 1.2 }}>Ingest Points</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: AP.muted }}>Dedicated encoder connection slots</Typography>
          </Box>
        </Box>
        <Button
          size="small" variant="outlined"
          onClick={() => { setShowForm(v => !v); setNewName(''); setFormError('') }}
          startIcon={showForm ? null : <AddIcon sx={{ fontSize: '14px !important' }} />}
          sx={{ fontSize: '0.72rem', borderColor: showForm ? 'rgba(255,255,255,0.15)' : AP.accentBdr, color: showForm ? AP.muted : AP.accent, '&:hover': { borderColor: '#fff', color: '#fff' } }}
        >
          {showForm ? 'Cancel' : 'New'}
        </Button>
      </Box>

      {/* Inline create form */}
      {showForm && (
        <Box sx={{ mx: 2.5, mb: 2, p: 1.5, borderRadius: 1.5, border: `1px solid ${AP.accentBdr}`, bgcolor: AP.accentDim }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              size="small" placeholder="e.g. Main Court Encoder"
              value={newName} onChange={e => { setNewName(e.target.value); setFormError('') }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              error={!!formError} helperText={formError || ' '}
              sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: '0.8rem' } }}
            />
            <Box component="select"
              value={newFormat}
              onChange={e => setNewFormat(e.target.value)}
              sx={{ bgcolor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 1, color: '#fff', fontSize: '0.75rem', px: 1, py: '7px', cursor: 'pointer', outline: 'none', mt: '1px' }}
            >
              {INGEST_POINT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Box>
            <Button
              variant="contained" size="small"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              sx={{ mt: '1px', flexShrink: 0, bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov }, fontSize: '0.72rem', fontWeight: 700 }}
            >
              {creating ? <CircularProgress size={13} sx={{ color: '#fff' }} /> : 'Create'}
            </Button>
          </Box>
        </Box>
      )}

      {/* List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={18} sx={{ color: AP.muted }} />
        </Box>
      ) : points.length === 0 ? (
        <Box sx={{ px: 2.5, pb: 2.5, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(148,163,184,0.4)', fontStyle: 'italic' }}>No ingest points yet</Typography>
        </Box>
      ) : (
        <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {points.map((p, i) => {
            const fc = fmtColors[p.format] || { color: AP.muted, bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)' }
            return (
              <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.25, borderBottom: i < points.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                {/* Format badge */}
                <Box sx={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', px: 0.9, py: 0.3, borderRadius: '4px', bgcolor: fc.bg, color: fc.color, border: `1px solid ${fc.border}`, flexShrink: 0, textTransform: 'uppercase' }}>
                  {p.format?.replace('_', ' ') || '—'}
                </Box>
                {/* Name */}
                <Typography sx={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0' }}>{p.name}</Typography>
                {/* Availability */}
                <Box sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', px: 0.9, py: 0.25, borderRadius: '20px', flexShrink: 0,
                  ...(p.available
                    ? { color: '#10b981', bgcolor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }
                    : { color: '#f59e0b', bgcolor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }
                  ),
                }}>
                  {p.available ? 'Available' : 'In Use'}
                </Box>
                {/* Delete */}
                <Tooltip title={!p.available ? 'Cannot delete — ingest point is currently in use' : 'Delete ingest point'}>
                  <span>
                    <IconButton size="small"
                      onClick={() => handleDelete(p)}
                      disabled={deletingId === p.id || !p.available}
                      sx={{
                        flexShrink: 0,
                        color: !p.available ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.4)',
                        '&:hover': { color: p.available ? '#f87171' : 'rgba(148,163,184,0.2)' },
                        '&.Mui-disabled': { color: 'rgba(148,163,184,0.2)' },
                      }}
                    >
                      {deletingId === p.id
                        ? <CircularProgress size={13} sx={{ color: AP.muted }} />
                        : <DeleteIcon sx={{ fontSize: 15 }} />
                      }
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

// ─── CDN read-only panel (tenant admin view) ──────────────────────────────────

function CdnReadOnlyPanel({ records = [], channels = [], pricing, tournaments = [] }) {
  const [monthFilter, setMonthFilter] = useState('all')

  function fmtUSD(n) { return '$' + Number(n || 0).toFixed(2) }
  function fmtGB(n)  { return Number(n || 0).toFixed(3) + ' GB' }
  function fmtDate(ds) {
    if (!ds) return '—'
    return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  function monthLabel(yyyymm) {
    if (!yyyymm) return ''
    const [y, m] = yyyymm.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  function chDate(ch) {
    return new Date(ch.stream_start).toLocaleDateString('en-CA', { timeZone: TZ })
  }
  function streamHours(ch) {
    const s = new Date(ch.stream_start)
    const e = ch.stream_end ? new Date(ch.stream_end) : new Date()
    return Math.max(0, (e - s) / 3_600_000)
  }

  // Build unified feed rows from JW channels + logged cdn records
  // Each JW channel that has run = one row, with status: live | pending | logged
  const channelRows = channels
    .filter(ch => ch.stream_start)
    .map(ch => {
      const date   = chDate(ch)
      const record = records.find(r => r.channel_id === ch.id && r.date === date)
      // Use JW status field: 'active' = streaming, ended stream_end = pending, future = scheduled
      const jwStatus  = ch.status?.toLowerCase()
      const isActive  = jwStatus === 'active' || jwStatus === 'streaming'
      const hasEnded  = ch.stream_end && new Date(ch.stream_end) <= new Date()
      const chStatus  = record ? 'logged' : isActive ? 'live' : hasEnded ? 'pending' : 'scheduled'
      return {
        key:         `ch-${ch.id}`,
        date,
        channel_id:  ch.id,
        channel_name: ch.name || ch.id,
        label:       ch.name || ch.id,
        stream_hours: streamHours(ch),
        status:      chStatus,
        record,      // cdn_record if logged
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  // Also include cdn records whose channel is no longer in JW (historical)
  const channelIds = new Set(channelRows.map(r => r.channel_id + '_' + r.date))
  const orphanRecords = records.filter(r => !channelIds.has(r.channel_id + '_' + r.date))

  // Build combined list for the selected month
  const allRows = [
    ...channelRows.map(r => ({ type: 'channel', ...r })),
    ...orphanRecords.map(r => ({ type: 'record', ...r, status: 'logged', key: `rec-${r.id}` })),
  ].filter(r => monthFilter === 'all' || r.date?.startsWith(monthFilter))

  const months = [...new Set(
    [...channelRows.map(r => r.date?.slice(0, 7)), ...records.map(r => r.date?.slice(0, 7))].filter(Boolean)
  )].sort().reverse()

  const loggedRows = allRows.filter(r => r.status === 'logged')
  const totalCost  = loggedRows.reduce((s, r) => s + (r.record?.cost_total || r.cost_total || 0), 0)
  const totalFeed  = loggedRows.reduce((s, r) => s + (r.record?.cost_feed  || r.cost_feed  || 0), 0)
  const totalCdn   = loggedRows.reduce((s, r) => s + (r.record?.cost_cdn   || r.cost_cdn   || 0), 0)
  const pendingCount = allRows.filter(r => r.status === 'pending').length

  const statusChip = (status) => {
    const cfg = {
      live:      { label: 'LIVE',      bg: 'rgba(16,185,129,0.15)',  color: '#10b981', border: 'rgba(16,185,129,0.4)' },
      pending:   { label: 'PENDING',   bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', border: 'rgba(245,158,11,0.4)' },
      logged:    { label: 'LOGGED',    bg: AP.accentDim,             color: AP.accent, border: AP.accentBdr },
      scheduled: { label: 'SCHEDULED', bg: 'rgba(99,102,241,0.1)',   color: '#818cf8', border: 'rgba(99,102,241,0.3)' },
    }[status] || {}
    return (
      <Chip label={cfg.label} size="small" sx={{
        fontSize: '0.58rem', height: 16, fontWeight: 700, letterSpacing: '0.05em',
        bgcolor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      }} />
    )
  }

  return (
    <Paper elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{
        px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: `linear-gradient(90deg, ${AP.accentDim} 0%, transparent 60%)`,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LiveTvIcon sx={{ color: AP.accent, fontSize: 18 }} />
          <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem' }}>
            FEEDS & CDN COSTS
          </Typography>
          {pendingCount > 0 && (
            <Chip label={`${pendingCount} PENDING`} size="small"
              sx={{ fontSize: '0.6rem', height: 18, bgcolor: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }} />
          )}
        </Box>
        <TextField
          select size="small" value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          sx={{ minWidth: 160, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 28 } }}
        >
          <MenuItem value="all">All time</MenuItem>
          {months.map(mk => <MenuItem key={mk} value={mk}>{monthLabel(mk)}</MenuItem>)}
        </TextField>
      </Box>

      {/* Summary row */}
      {loggedRows.length > 0 && (
        <Box sx={{
          px: 2, py: 1, display: 'flex', gap: 3, flexWrap: 'wrap',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          bgcolor: 'rgba(99,102,241,0.04)',
        }}>
          {[
            { label: 'Total Cost',  value: fmtUSD(totalCost), accent: true },
            { label: 'Feed Fees',   value: fmtUSD(totalFeed) },
            { label: 'CDN Cost',    value: fmtUSD(totalCdn) },
            { label: 'Feeds',       value: `${loggedRows.length} logged${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}` },
          ].map(({ label, value, accent }) => (
            <Box key={label}>
              <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
              </Typography>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: accent ? AP.accent : AP.text, lineHeight: 1.2 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Feed table */}
      {allRows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <LiveTvIcon sx={{ color: 'rgba(168,188,212,0.2)', fontSize: 36, mb: 1 }} />
          <Typography variant="body2" sx={{ color: 'rgba(168,188,212,0.5)' }}>
            No feeds {monthFilter !== 'all' ? `for ${monthLabel(monthFilter)}` : 'yet'}.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Status', 'Date', 'Feed', 'Stream Hrs', 'GB Delivered', 'Feed Fee', 'CDN Cost', 'Total'].map(h => (
                  <TableCell key={h} sx={{ color: AP.muted, fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {allRows.map(row => {
                const rec = row.record || (row.type === 'record' ? row : null)
                return (
                  <TableRow key={row.key} hover sx={{ opacity: row.status === 'pending' ? 0.7 : 1 }}>
                    <TableCell>{statusChip(row.status)}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{row.channel_name || row.label}</Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: AP.muted, fontFamily: 'monospace' }}>{row.channel_id}</Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>
                      {row.stream_hours != null ? `${Number(row.stream_hours).toFixed(2)}h` : '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{rec ? fmtGB(rec.gb_delivered) : '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{rec ? fmtUSD(rec.cost_feed) : '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{rec ? fmtUSD(rec.cost_cdn) : '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', fontWeight: rec ? 700 : 400, color: rec ? AP.accent : AP.muted }}>
                      {rec                           ? fmtUSD(rec.cost_total)
                        : row.status === 'live'      ? 'In progress…'
                        : row.status === 'pending'   ? 'Awaiting CDN data'
                        : row.status === 'scheduled' ? 'Upcoming'
                        : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
              {loggedRows.length > 0 && (
                <TableRow sx={{ bgcolor: AP.accentDim }}>
                  <TableCell colSpan={7} sx={{ fontSize: '0.75rem', fontWeight: 700, color: AP.muted }}>
                    {monthFilter === 'all' ? 'Grand Total' : `${monthLabel(monthFilter)} Total`} ({loggedRows.length} logged)
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.85rem', fontWeight: 800, color: AP.accent }}>{fmtUSD(totalCost)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      )}

      {pricing && (
        <Box sx={{ px: 2, py: 1, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Typography variant="caption" sx={{ color: 'rgba(168,188,212,0.4)', fontSize: '0.65rem' }}>
            Rates: ${pricing.feed_rate_per_hr}/hr per feed · ${pricing.cdn_rate_per_gb}/GB CDN · {pricing.gb_per_50_min} GB per 50 min
            {Object.keys(pricing.channel_overrides || {}).length > 0 && ' · Per-channel overrides active'}
          </Typography>
        </Box>
      )}
    </Paper>
  )
}

// ─── Tenant config (JW Player + BrightSpot share the /api/tenant record) ──────

function useTenantSettings(token, tenantId) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(() => {
    setLoading(true)
    return fetch('/api/tenant', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); return d })
      .catch(() => { setData(null); return null })
      .finally(() => setLoading(false))
  }, [token, tenantId])

  useEffect(() => { refetch() }, [refetch])

  async function save(patch) {
    const res = await fetch('/api/tenant', {
      method: 'PUT',
      headers: authHeader(token, tenantId),
      body: JSON.stringify(patch),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to save')
    setData(json)
    return json
  }

  return { data, loading, save }
}

function JwIcon({ size = 24 }) {
  return (
    <Box sx={{ width: size, height: size, borderRadius: '6px', bgcolor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Typography sx={{ fontSize: size * 0.36, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>JW</Typography>
    </Box>
  )
}

function JwPlayerEditDialog({ open, onClose, tenant, tenantLoading, saveTenant }) {
  const [jwSiteId, setJwSiteId]       = useState('')
  const [jwApiSecret, setJwApiSecret] = useState('')
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    if (!open) return
    setJwSiteId(tenant?.jw_site_id || '')
    setJwApiSecret(tenant?.jw_api_secret || '')
    setError(''); setSaved(false)
  }, [open, tenant])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      await saveTenant({ jw_site_id: jwSiteId.trim() || null, jw_api_secret: jwApiSecret.trim() || null })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <JwIcon size={22} />
        JW Player
        <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <Box component="form" onSubmit={handleSave}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {tenantLoading ? (
            <CircularProgress size={20} sx={{ color: AP.accent }} />
          ) : (
            <>
              {error && <Alert severity="error" sx={{ fontSize: '0.78rem' }}>{error}</Alert>}
              <TextField size="small" label="JW Site ID" fullWidth autoFocus value={jwSiteId} onChange={e => setJwSiteId(e.target.value)} />
              <TextField size="small" label="JW API Secret" fullWidth value={jwApiSecret} onChange={e => setJwApiSecret(e.target.value)} />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} sx={{ color: AP.muted }}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving || tenantLoading}
            sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}>
            {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : saved ? 'Saved' : 'Save'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

// ─── BrightSpot CMS integration ───────────────────────────────────────────────
// Defaults point at Griffin's UAT BrightSpot instance (the environment this
// integration was built/spiked against) so the fields aren't blank on first load.
const BRIGHTSPOT_DEFAULTS = {
  cmsUrl:   'https://cms.griffin-uat.lower.griffin-media.brightspot.cloud',
  siteUrl:  'https://news9.griffin-uat.lower.griffin-media.brightspot.cloud',
  apiKey:   'BIPiEDEezXTX6KJsgwN939PV4XwJyshyzZm2NXB',
  clientId: '',
}

function BrightSpotIcon({ size = 24 }) {
  return (
    <Box sx={{ width: size, height: size, borderRadius: '6px', bgcolor: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Typography sx={{ fontSize: size * 0.32, fontWeight: 900, color: '#fff', lineHeight: 1 }}>BS</Typography>
    </Box>
  )
}

function BrightSpotEditDialog({ open, onClose, tenant, tenantLoading, saveTenant, token, tenantId }) {
  const [cmsUrl, setCmsUrl]     = useState(BRIGHTSPOT_DEFAULTS.cmsUrl)
  const [siteUrl, setSiteUrl]   = useState(BRIGHTSPOT_DEFAULTS.siteUrl)
  const [apiKey, setApiKey]     = useState(BRIGHTSPOT_DEFAULTS.apiKey)
  const [clientId, setClientId] = useState(BRIGHTSPOT_DEFAULTS.clientId)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // { severity, message } | null

  useEffect(() => {
    if (!open) return
    setCmsUrl(tenant?.brightspot_cms_url || BRIGHTSPOT_DEFAULTS.cmsUrl)
    setSiteUrl(tenant?.brightspot_site_url || BRIGHTSPOT_DEFAULTS.siteUrl)
    setApiKey(tenant?.brightspot_api_key || BRIGHTSPOT_DEFAULTS.apiKey)
    setClientId(tenant?.brightspot_client_id || BRIGHTSPOT_DEFAULTS.clientId)
    setError(''); setSaved(false); setTestResult(null)
  }, [open, tenant])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      await saveTenant({
        brightspot_cms_url:   cmsUrl.trim() || null,
        brightspot_site_url:  siteUrl.trim() || null,
        brightspot_api_key:   apiKey.trim() || null,
        brightspot_client_id: clientId.trim() || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch('/api/brightspot-proxy', {
        method: 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({
          url:      (siteUrl || cmsUrl).trim(),
          apiKey:   apiKey.trim(),
          endpoint: '/api/getAlerts',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const summary = typeof data.body === 'string' ? data.body : JSON.stringify(data.body)
      if (data.ok && data.body?.status === 'ok') {
        setTestResult({ severity: 'success', message: `Connected — ${summary}` })
      } else if (data.ok) {
        setTestResult({ severity: 'warning', message: `Responded (HTTP ${data.status}) — ${summary}` })
      } else {
        setTestResult({ severity: 'error', message: `BrightSpot returned HTTP ${data.status} — ${summary}` })
      }
    } catch (err) {
      setTestResult({ severity: 'error', message: err.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <BrightSpotIcon size={22} />
        BrightSpot CMS
        <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <Box component="form" onSubmit={handleSave}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {tenantLoading ? (
            <CircularProgress size={20} sx={{ color: AP.accent }} />
          ) : (
            <>
              {error && <Alert severity="error" sx={{ fontSize: '0.78rem' }}>{error}</Alert>}
              {testResult && <Alert severity={testResult.severity} sx={{ fontSize: '0.78rem', wordBreak: 'break-word' }}>{testResult.message}</Alert>}
              <TextField size="small" label="CMS URL" fullWidth autoFocus value={cmsUrl} onChange={e => setCmsUrl(e.target.value)} />
              <TextField size="small" label="Site URL (optional)" fullWidth value={siteUrl} onChange={e => setSiteUrl(e.target.value)}
                helperText="Your BrightSpot publication or delivery URL" />
              <TextField size="small" type="password" label="API Key" fullWidth value={apiKey} onChange={e => setApiKey(e.target.value)} />
              <TextField size="small" label="Client ID" fullWidth value={clientId} onChange={e => setClientId(e.target.value)}
                helperText="REST Management API client ID — used for encoder page search/publish" />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" size="small" onClick={handleTest} disabled={testing || tenantLoading}
            sx={{ borderColor: AP.accentBdr, color: AP.accent, '&:hover': { borderColor: AP.accent, bgcolor: AP.accentDim } }}>
            {testing ? <CircularProgress size={16} sx={{ color: AP.accent }} /> : 'Test Connection'}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose} sx={{ color: AP.muted }}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving || tenantLoading}
            sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}>
            {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : saved ? 'Saved' : 'Save'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

// ─── Integrations: compact tile list + "Add Integration" picker modal ─────────

function IntegrationTile({ icon, name, description, statusLabel, statusColor, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, p: 2, cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)',
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
        '&:hover': { borderColor: AP.accentBdr, bgcolor: 'rgba(255,255,255,0.03)' },
      }}
    >
      {icon}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: '#fff' }}>{name}</Typography>
        <Typography sx={{ fontSize: '0.68rem', color: AP.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {description}
        </Typography>
      </Box>
      <Chip label={statusLabel} size="small"
        sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, flexShrink: 0, maxWidth: 140,
          bgcolor: `${statusColor}1f`, color: statusColor }} />
      <ChevronRightIcon sx={{ color: AP.muted, fontSize: 18, flexShrink: 0 }} />
    </Box>
  )
}

function IntegrationPickerDialog({ open, onClose, items, onSelect }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        Add Integration
        <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, pb: 1 }}>
          {items.map(item => (
            <Box key={item.id} onClick={() => onSelect(item.id)}
              sx={{
                position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                p: 2, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2,
                '&:hover': { borderColor: AP.accentBdr, bgcolor: 'rgba(255,255,255,0.03)' },
              }}
            >
              {item.configured && (
                <CheckCircleIcon sx={{ position: 'absolute', top: 6, right: 6, fontSize: 16, color: AP.live }} />
              )}
              {item.icon}
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff', textAlign: 'center' }}>{item.name}</Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  )
}

function IntegrationsPanel({ token, tenantId }) {
  const { data: tenant, loading: tenantLoading, save: saveTenant } = useTenantSettings(token, tenantId)
  const youtube  = useYoutubeIntegration(token, tenantId)
  const facebook = useFacebookIntegration(token, tenantId)

  const [openKey, setOpenKey]       = useState(null) // null | 'jw' | 'youtube' | 'facebook' | 'brightspot'
  const [pickerOpen, setPickerOpen] = useState(false)

  const items = [
    {
      id: 'jw', name: 'JW Player', description: 'Video hosting & clip delivery', icon: <JwIcon />,
      configured: !!tenant?.jw_site_id,
      statusLabel: tenantLoading ? '…' : tenant?.jw_site_id ? 'Configured' : 'Not configured',
      statusColor: tenant?.jw_site_id ? AP.live : AP.warn,
    },
    {
      id: 'youtube', name: 'YouTube', description: 'Simulcast to your YouTube channel',
      icon: <Box component="img" src={YOUTUBE_ICON_URL} sx={{ width: 24, height: 24 }} />,
      configured: !!youtube.status?.connected,
      statusLabel: youtube.loading ? '…' : youtube.status?.connected ? (youtube.status.channel_name || 'Connected') : 'Not connected',
      statusColor: youtube.status?.connected ? AP.live : AP.warn,
    },
    {
      id: 'facebook', name: 'Facebook', description: 'Simulcast to your Facebook Page', icon: <FacebookIcon />,
      configured: !!facebook.status?.connected,
      statusLabel: facebook.loading ? '…' : facebook.status?.connected ? (facebook.status.page_name || 'Connected') : 'Not connected',
      statusColor: facebook.status?.connected ? AP.live : AP.warn,
    },
    {
      id: 'brightspot', name: 'BrightSpot CMS', description: 'Publish clips & alerts to your CMS', icon: <BrightSpotIcon />,
      configured: !!tenant?.brightspot_cms_url,
      statusLabel: tenantLoading ? '…' : tenant?.brightspot_cms_url ? 'Configured' : 'Not configured',
      statusColor: tenant?.brightspot_cms_url ? AP.live : AP.warn,
    },
  ]

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', color: AP.muted, textTransform: 'uppercase' }}>Integrations</Typography>
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={() => setPickerOpen(true)}
          sx={{ fontSize: '0.72rem', color: AP.accent, minWidth: 0, p: '2px 8px' }}>
          Add
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.filter(item => item.configured).map(item => (
          <IntegrationTile key={item.id} {...item} onClick={() => setOpenKey(item.id)} />
        ))}
        {items.every(item => !item.configured) && !tenantLoading && (
          <Typography sx={{ fontSize: '0.78rem', color: AP.muted, fontStyle: 'italic', py: 1 }}>
            No integrations added yet — click Add to connect one.
          </Typography>
        )}
      </Box>

      <IntegrationPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={items}
        onSelect={key => { setPickerOpen(false); setOpenKey(key) }}
      />

      <JwPlayerEditDialog
        open={openKey === 'jw'} onClose={() => setOpenKey(null)}
        tenant={tenant} tenantLoading={tenantLoading} saveTenant={saveTenant}
      />
      <BrightSpotEditDialog
        open={openKey === 'brightspot'} onClose={() => setOpenKey(null)}
        tenant={tenant} tenantLoading={tenantLoading} saveTenant={saveTenant}
        token={token} tenantId={tenantId}
      />
      <YouTubeEditDialog open={openKey === 'youtube'} onClose={() => setOpenKey(null)} integration={youtube} />
      <FacebookEditDialog open={openKey === 'facebook'} onClose={() => setOpenKey(null)} integration={facebook} />
    </>
  )
}

// ─── Team management (per-tenant Admin/Read-only members) ────────────────────

function TenantMembersPanel({ token, tenantId, canManage }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', role: 'read_only' })
  const [saving, setSaving] = useState(false)

  const fetchMembers = useCallback(() => {
    setLoading(true)
    fetch('/api/tenant-members', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : { members: [] })
      .then(data => setMembers(data.members || []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false))
  }, [token, tenantId])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/tenant-members', {
        method: 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add member')
      setForm({ email: '', password: '', role: 'read_only' })
      setShowForm(false)
      fetchMembers()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRoleChange(userId, role) {
    await fetch('/api/tenant-members', {
      method: 'PATCH',
      headers: authHeader(token, tenantId),
      body: JSON.stringify({ userId, role }),
    })
    fetchMembers()
  }

  async function handleRemove(userId, email) {
    if (!confirm(`Remove ${email} from this organization?`)) return
    await fetch('/api/tenant-members', {
      method: 'DELETE',
      headers: authHeader(token, tenantId),
      body: JSON.stringify({ userId }),
    })
    fetchMembers()
  }

  return (
    <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)', p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>Team</Typography>
        {canManage && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setShowForm(v => !v)}
            sx={{ fontSize: '0.72rem', color: AP.accent }}>
            {showForm ? 'Cancel' : 'Add Member'}
          </Button>
        )}
      </Box>

      {showForm && (
        <Box component="form" onSubmit={handleAdd} sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <TextField size="small" type="email" label="Email" required value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} sx={{ minWidth: 180 }} />
          <TextField size="small" type="password" label="Temporary Password" required value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} sx={{ minWidth: 160 }} />
          <TextField select size="small" label="Role" value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })} sx={{ minWidth: 130 }}>
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="read_only">Read Only</MenuItem>
          </TextField>
          <Button type="submit" variant="contained" disabled={saving} size="small"
            sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}>
            {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Create'}
          </Button>
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2, fontSize: '0.78rem' }}>{error}</Alert>}

      {loading ? (
        <CircularProgress size={20} sx={{ color: AP.accent }} />
      ) : members.length === 0 ? (
        <Typography sx={{ fontSize: '0.8rem', color: AP.muted }}>No team members yet.</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: AP.muted, fontSize: '0.68rem' }}>EMAIL</TableCell>
              <TableCell sx={{ color: AP.muted, fontSize: '0.68rem' }}>ROLE</TableCell>
              {canManage && <TableCell sx={{ color: AP.muted, fontSize: '0.68rem' }} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {members.map(m => (
              <TableRow key={m.userId}>
                <TableCell sx={{ fontSize: '0.8rem', color: '#e2e8f0' }}>{m.email || m.userId}</TableCell>
                <TableCell sx={{ fontSize: '0.8rem' }}>
                  {canManage ? (
                    <TextField select size="small" value={m.role} variant="standard"
                      onChange={e => handleRoleChange(m.userId, e.target.value)}
                      sx={{ '& .MuiInputBase-root': { fontSize: '0.78rem', color: '#e2e8f0' } }}>
                      <MenuItem value="admin">Admin</MenuItem>
                      <MenuItem value="read_only">Read Only</MenuItem>
                    </TextField>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>{m.role === 'admin' ? 'Admin' : 'Read Only'}</span>
                  )}
                </TableCell>
                {canManage && (
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleRemove(m.userId, m.email)} sx={{ color: 'rgba(248,113,113,0.5)' }}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </Box>
      )}
    </Box>
  )
}

// ─── Tenants (Super Admin only, global) ───────────────────────────────────────

function TenantsPanel({ token }) {
  const [tenantsList, setTenantsList] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [showForm, setShowForm]       = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', timezone: 'America/New_York' })
  const [saving, setSaving] = useState(false)
  const [editTenant, setEditTenant] = useState(null) // { id, name, timezone } | null
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError]   = useState('')
  const [copiedId, setCopiedId]     = useState('')

  function copyId(id) {
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(''), 1500)
  }

  const fetchTenants = useCallback(() => {
    setLoading(true)
    fetch('/api/tenants', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { tenants: [] })
      .then(data => setTenantsList(data.tenants || []))
      .catch(() => setTenantsList([]))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { fetchTenants() }, [fetchTenants])

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create tenant')
      setForm({ name: '', slug: '', timezone: 'America/New_York' })
      setShowForm(false)
      fetchTenants()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function openEdit(t) {
    setEditError('')
    setEditTenant({ id: t.id, name: t.name, timezone: t.timezone || 'America/New_York' })
  }

  async function handleEditSave(e) {
    e.preventDefault()
    setEditSaving(true); setEditError('')
    try {
      const body = { id: editTenant.id, name: editTenant.name, timezone: editTenant.timezone }
      const res = await fetch('/api/tenants', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update tenant')
      setEditTenant(null)
      fetchTenants()
    } catch (err) {
      setEditError(err.message)
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)', p: 2.5, maxWidth: 860 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>Tenants</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setShowForm(v => !v)} sx={{ fontSize: '0.72rem', color: AP.accent }}>
          {showForm ? 'Cancel' : 'New Tenant'}
        </Button>
      </Box>

      {showForm && (
        <Box component="form" onSubmit={handleCreate} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2, p: 2, border: `1px solid ${AP.accentBdr}`, borderRadius: 1.5, bgcolor: AP.accentDim }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField size="small" label="Name" required fullWidth value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <TextField size="small" label="Slug (optional)" fullWidth value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="e.g. acme-sports" />
          </Box>
          <Typography sx={{ fontSize: '0.68rem', color: AP.muted }}>
            JW Player credentials are configured later, from the tenant's own Settings page.
          </Typography>
          <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start', bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}>
            {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Create Tenant'}
          </Button>
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2, fontSize: '0.78rem' }}>{error}</Alert>}

      {loading ? (
        <CircularProgress size={20} sx={{ color: AP.accent }} />
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: AP.muted, fontSize: '0.68rem' }}>NAME</TableCell>
              <TableCell sx={{ color: AP.muted, fontSize: '0.68rem' }}>ID</TableCell>
              <TableCell sx={{ color: AP.muted, fontSize: '0.68rem' }}>SLUG</TableCell>
              <TableCell sx={{ color: AP.muted, fontSize: '0.68rem' }}>JW PLAYER</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {tenantsList.map(t => (
              <TableRow key={t.id}>
                <TableCell sx={{ fontSize: '0.8rem', color: '#e2e8f0' }}>{t.name}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>
                      {t.id}
                    </Typography>
                    <Tooltip title={copiedId === t.id ? 'Copied!' : 'Copy'}>
                      <IconButton size="small" onClick={() => copyId(t.id)} sx={{ color: copiedId === t.id ? AP.live : AP.muted, p: 0.25 }}>
                        {copiedId === t.id ? <CheckCircleIcon sx={{ fontSize: 13 }} /> : <ContentCopyIcon sx={{ fontSize: 13 }} />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t.slug || '—'}</TableCell>
                <TableCell>
                  <Chip label={t.jwConfigured ? 'Configured' : 'Not configured'} size="small"
                    sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700,
                      bgcolor: t.jwConfigured ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                      color: t.jwConfigured ? '#10b981' : '#f59e0b' }} />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(t)} sx={{ color: AP.muted }}>
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </Box>
      )}

      <Dialog open={!!editTenant} onClose={() => setEditTenant(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Edit Tenant</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {editError && <Alert severity="error" sx={{ fontSize: '0.78rem' }}>{editError}</Alert>}
          {editTenant && (
            <>
              <TextField size="small" label="Name" fullWidth value={editTenant.name}
                onChange={e => setEditTenant({ ...editTenant, name: e.target.value })} />
              <TextField
                select size="small" label="Timezone" fullWidth
                value={editTenant.timezone || 'America/New_York'}
                onChange={e => setEditTenant({ ...editTenant, timezone: e.target.value })}
              >
                {TIMEZONE_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </TextField>
              <Typography sx={{ fontSize: '0.68rem', color: AP.muted }}>
                JW Player credentials are managed from the tenant's own Settings page, not here.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditTenant(null)} sx={{ color: '#a8bcd4' }}>Cancel</Button>
          <Button onClick={handleEditSave} disabled={editSaving} variant="contained"
            sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}>
            {editSaving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ─── Super Admins (Super Admin only, global) ─────────────────────────────────

function SuperAdminsPanel({ token }) {
  const [admins, setAdmins]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })
  const [saving, setSaving] = useState(false)

  const fetchAdmins = useCallback(() => {
    setLoading(true)
    fetch('/api/super-admins', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { superAdmins: [] })
      .then(data => setAdmins(data.superAdmins || []))
      .catch(() => setAdmins([]))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { fetchAdmins() }, [fetchAdmins])

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/super-admins', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add Super Admin')
      setForm({ email: '', password: '' })
      setShowForm(false)
      fetchAdmins()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(userId, email) {
    if (!confirm(`Revoke Super Admin access for ${email}?`)) return
    const res = await fetch('/api/super-admins', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) fetchAdmins()
    else { const data = await res.json(); alert(data.error || 'Failed to revoke') }
  }

  return (
    <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)', p: 2.5, maxWidth: 560 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>Super Admins</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setShowForm(v => !v)} sx={{ fontSize: '0.72rem', color: AP.accent }}>
          {showForm ? 'Cancel' : 'Add Super Admin'}
        </Button>
      </Box>
      <Typography sx={{ fontSize: '0.72rem', color: AP.muted, mb: 2 }}>
        Trilogy Digital agency staff only — full access across every tenant, plus Costs/Pricing and the ability to create new tenants.
      </Typography>

      {showForm && (
        <Box component="form" onSubmit={handleAdd} sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <TextField size="small" type="email" label="Email" required value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} sx={{ minWidth: 180 }} />
          <TextField size="small" type="password" label="Password (new users only)" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} sx={{ minWidth: 200 }} />
          <Button type="submit" variant="contained" disabled={saving} size="small"
            sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}>
            {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Grant'}
          </Button>
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2, fontSize: '0.78rem' }}>{error}</Alert>}

      {loading ? (
        <CircularProgress size={20} sx={{ color: AP.accent }} />
      ) : (
        <Table size="small">
          <TableBody>
            {admins.map(a => (
              <TableRow key={a.id}>
                <TableCell sx={{ fontSize: '0.8rem', color: '#e2e8f0' }}>{a.email}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleRevoke(a.id, a.email)} sx={{ color: 'rgba(248,113,113,0.5)' }}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

// Map pathname → { activeTab, dashboardView }
const PATH_MAP = {
  '/admin/streams':     { activeTab: 'dashboard',    dashboardView: 'streams' },
  '/admin/events':      { activeTab: 'dashboard',    dashboardView: 'events'  },
  '/admin/encoders':    { activeTab: 'encoders',     dashboardView: 'streams' },
  '/admin/routers':     { activeTab: 'routers',      dashboardView: 'streams' },
  '/admin/costs':       { activeTab: 'costs',        dashboardView: 'streams' },
  '/admin/settings':    { activeTab: 'settings',     dashboardView: 'streams' },
  '/admin/tenants':     { activeTab: 'tenants',      dashboardView: 'streams' },
  '/admin/superadmins': { activeTab: 'superadmins',  dashboardView: 'streams' },
}
// Map { tab, view } → canonical path
function tabToPath(tab, view) {
  if (tab === 'dashboard')   return view === 'events' ? '/admin/events' : '/admin/streams'
  if (tab === 'encoders')    return '/admin/encoders'
  if (tab === 'routers')     return '/admin/routers'
  if (tab === 'costs')       return '/admin/costs'
  if (tab === 'settings')    return '/admin/settings'
  if (tab === 'tenants')     return '/admin/tenants'
  if (tab === 'superadmins') return '/admin/superadmins'
  return '/admin/streams'
}

function Dashboard({ token, tenantId, tenantName, isSuperAdmin, tenantRole, tenants, onSwitchTenant, onLogout }) {
  const navigate   = useNavigate()
  const location   = useLocation()
  const { tenant } = useTenant()
  const TZ         = tenant?.timezone || 'America/New_York'
  const tzLabel    = getTzLabel(TZ)
  const theme      = useTheme()
  const isMobile   = useMediaQuery(theme.breakpoints.down('md'))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tournaments, setTournaments] = useState([])
  const [channels, setChannels] = useState([])
  const [loadingTournaments, setLoadingTournaments] = useState(true)
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [error, setError] = useState('')
  const [channelError, setChannelError] = useState('')

  const [costRecords, setCostRecords] = useState([])
  const [costRecordDialog, setCostRecordDialog] = useState({ open: false, initial: null })
  const [cdnRecords, setCdnRecords] = useState([])
  const [cdnPricing, setCdnPricing] = useState(null)

  const [tournamentDialog, setTournamentDialog] = useState({ open: false, initial: null })
  const [dayDialog, setDayDialog] = useState({ open: false, initial: null, tournament: null })
  const [pickerDialog, setPickerDialog] = useState({ open: false, slot: null, day: null, tournamentId: null })
  const [createStreamOpen, setCreateStreamOpen] = useState(false)
  const [createStreamKey, setCreateStreamKey]   = useState(0)
  const [selectedChannel, setSelectedChannel]   = useState(null)
  const { activeTab, dashboardView } = PATH_MAP[location.pathname]
    || (location.pathname.startsWith('/admin/encoders') ? { activeTab: 'encoders', dashboardView: 'streams' } : { activeTab: 'dashboard', dashboardView: 'streams' })
  const [streamFilter,     setStreamFilter]     = useState('all')
  const [streamTypeFilter, setStreamTypeFilter] = useState('all')
  const [previewDialog, setPreviewDialog] = useState({ open: false, channelName: '', streamUrl: '' })
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' })

  const showSnack = (message, severity = 'success') =>
    setSnack({ open: true, message, severity })

  const fetchTournaments = useCallback(async () => {
    setLoadingTournaments(true)
    try {
      const res = await fetch('/api/tournaments', { headers: { 'X-Tenant-Id': tenantId } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load tournaments')
      setTournaments(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingTournaments(false)
    }
  }, [tenantId])

  const fetchChannels = useCallback(async () => {
    setLoadingChannels(true)
    setChannelError('')
    try {
      const res = await fetch('/api/channels', { headers: authHeader(token, tenantId) })
      if (res.status === 401) { onLogout(); return }
      const data = await res.json()
      if (!res.ok) throw new Error(`${data.error}${data.detail ? ` — ${data.detail}` : ''}`)
      setChannels(data.channels || [])
    } catch (err) {
      setChannelError(err.message)
    } finally {
      setLoadingChannels(false)
    }
  }, [token, tenantId, onLogout])

  const fetchCostRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/cost-records', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setCostRecords(await res.json())
    } catch {}
  }, [token])

  const fetchCdnData = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        fetch('/api/cdn-records', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/pricing',     { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (cRes.ok) setCdnRecords(await cRes.json())
      if (pRes.ok) setCdnPricing(await pRes.json())
    } catch {}
  }, [token])

  useEffect(() => {
    fetchTournaments()
    fetchChannels()
    fetchCostRecords()
    fetchCdnData()
  }, [fetchTournaments, fetchChannels, fetchCostRecords, fetchCdnData])

  // ── Handle ?yt=, ?fb= URL params after OAuth redirects ──────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const yt = params.get('yt')
    const fb = params.get('fb')
    if (yt === 'connected') showSnack('YouTube connected successfully!', 'success')
    if (yt === 'error') {
      const msg = params.get('msg')
      showSnack(msg ? `YouTube error: ${msg}` : 'YouTube connection failed. Check console.', 'error')
    }
    if (fb === 'connected')  showSnack('Facebook Page connected successfully!', 'success')
    if (fb === 'no_pages')   showSnack('Facebook connected but no Pages found. Make sure you manage a Facebook Page.', 'warning')
    if (fb === 'error') {
      const msg = params.get('msg')
      showSnack(msg ? `Facebook error: ${msg}` : 'Facebook connection failed. Check console.', 'error')
    }
    // Clean up query params without reloading
    if (yt || fb) navigate(location.pathname, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Background VOD expiry sweeper ─────────────────────────────────────────────
  // Runs immediately on load, then every hour. Any past downloadable stream whose
  // stream_end is ≥ VOD_TTL_DAYS old has its JW VOD media asset deleted.
  // The channel row stays in the list for historical reference — only the
  // downloadable VOD media is removed from JW.
  useEffect(() => {
    if (!token) return

    async function sweepExpiredVods(currentChannels) {
      const expired = (currentChannels || []).filter(
        ch => ch.enable_live_to_vod &&
              resolveIdleStatus(ch) === 'past' && isVodExpired(ch)
      )
      if (!expired.length) return

      console.log(`[VOD sweep] Found ${expired.length} expired VOD(s), removing JW media…`)
      await Promise.allSettled(
        expired.map(ch =>
          fetch('/api/delete-vod-media', {
            method: 'DELETE',
            headers: authHeader(token, tenantId),
            body: JSON.stringify({ media_id: ch.vod_media_id }),
          })
            .then(r => r.json())
            .then(data => {
              if (data.ok) {
                console.log(`[VOD sweep] Removed VOD media for ${ch.name || ch.id}`)
                // Keep the channel in the list — just clear the VOD fields so the
                // download card/icon no longer shows
                setChannels(prev => prev.map(c =>
                  c.id === ch.id ? { ...c, enable_live_to_vod: false, vod_media_id: null } : c
                ))
              }
            })
            .catch(err => console.error(`[VOD sweep] Failed for ${ch.id}:`, err))
        )
      )
    }

    // Run immediately with current channels snapshot
    setChannels(prev => { sweepExpiredVods(prev); return prev })

    // Then re-run every hour
    const intervalId = setInterval(() => {
      setChannels(prev => { sweepExpiredVods(prev); return prev })
    }, 60 * 60 * 1000)

    return () => clearInterval(intervalId)
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cost record CRUD ──────────────────────────────────────────────────────────

  async function saveCostRecord(form) {
    const isEdit = !!costRecordDialog.initial?.id
    const res = await fetch('/api/cost-records', {
      method: isEdit ? 'PUT' : 'POST',
      headers: authHeader(token, tenantId),
      body: JSON.stringify(isEdit ? { id: costRecordDialog.initial.id, ...form } : form),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    await fetchCostRecords()
  }

  async function deleteCostRecord(id, label) {
    if (!confirm(`Remove historical record for "${label}"?`)) return
    try {
      const res = await fetch('/api/cost-records', {
        method: 'DELETE',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await fetchCostRecords()
      showSnack(`Record for "${label}" removed`)
    } catch (err) {
      showSnack(`Failed: ${err.message}`, 'error')
    }
  }

  // ── Tournament CRUD ──────────────────────────────────────────────────────────

  async function saveTournament({ sessions, ...eventForm }) {
    const isEdit = !!tournamentDialog.initial?.id
    const res = await fetch('/api/tournaments', {
      method: isEdit ? 'PUT' : 'POST',
      headers: authHeader(token, tenantId),
      body: JSON.stringify(isEdit ? { id: tournamentDialog.initial.id, ...eventForm } : eventForm),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    // Save any inline sessions
    if (sessions?.length) {
      for (const sess of sessions) {
        const { _key, _existingId, ...sessData } = sess
        // Skip sessions with no label or date
        if (!sessData.label && !sessData.date) continue
        const streams = (sessData.streams || []).filter(s => s.url || s.name)
        const sessRes = await fetch('/api/tournament-days', {
          method: _existingId ? 'PUT' : 'POST',
          headers: authHeader(token, tenantId),
          body: JSON.stringify({
            tournament_id: data.id,
            ...(_existingId ? { id: _existingId } : {}),
            ...sessData,
            streams,
          }),
        })
        if (!sessRes.ok) {
          const errData = await sessRes.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to save a session')
        }
      }
    }

    await fetchTournaments()
    showSnack(isEdit ? `Event "${data.name}" updated` : `Event "${data.name}" created`)
  }

  async function deleteTournament(tournament) {
    if (!confirm(`Delete tournament "${tournament.name}" and all its days?\n\nThis cannot be undone.`)) return
    try {
      const res = await fetch('/api/tournaments', {
        method: 'DELETE',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({ id: tournament.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await fetchTournaments()
      showSnack(`Tournament "${tournament.name}" deleted`)
    } catch (err) {
      showSnack(`Failed to delete: ${err.message}`, 'error')
    }
  }

  // ── Day CRUD ─────────────────────────────────────────────────────────────────

  async function saveDay(formWithStreams) {
    const { tournament } = dayDialog
    const isEdit = !!dayDialog.initial?.id
    const res = await fetch('/api/tournament-days', {
      method: isEdit ? 'PUT' : 'POST',
      headers: authHeader(token, tenantId),
      body: JSON.stringify({
        tournament_id: tournament.id,
        ...(isEdit ? { id: dayDialog.initial.id } : {}),
        ...formWithStreams,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    await fetchTournaments()
    showSnack(isEdit ? `"${data.label}" updated` : `"${data.label}" added to ${tournament.name}`)
  }

  async function deleteDay(day, tournament) {
    if (!confirm(`Delete "${day.label}" from ${tournament.name}?`)) return
    try {
      const res = await fetch('/api/tournament-days', {
        method: 'DELETE',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({ tournament_id: tournament.id, id: day.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await fetchTournaments()
      showSnack(`"${day.label}" deleted`)
    } catch (err) {
      showSnack(`Failed to delete: ${err.message}`, 'error')
    }
  }

  // ── Stream assignment ─────────────────────────────────────────────────────────

  async function assignCamera(streamIndex, tournamentId, picked) {
    const { day } = pickerDialog
    if (!day) return
    const url  = picked?.url  ?? null
    const name = picked?.name ?? null
    setPickerDialog({ open: false, slot: null, day: null, tournamentId: null })
    try {
      // Build updated streams array from current session
      const existingStreams = getSessionStreams(day)
      let updatedStreams
      if (url === null) {
        // Clear — remove stream at index
        updatedStreams = existingStreams.filter((_, i) => i !== streamIndex)
      } else {
        // Assign — update or add stream at index
        updatedStreams = [...existingStreams]
        if (streamIndex < updatedStreams.length) {
          updatedStreams[streamIndex] = { ...updatedStreams[streamIndex], url, name: name || updatedStreams[streamIndex].name }
        } else {
          updatedStreams.push({ id: Date.now(), url, name: name || `Stream ${streamIndex + 1}` })
        }
      }
      const res = await fetch('/api/tournament-days', {
        method: 'PUT',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({
          tournament_id: tournamentId,
          id: day.id,
          streams: updatedStreams,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await fetchTournaments()
      showSnack(picked ? `Stream ${streamIndex + 1} assigned to ${day.label}` : `Stream ${streamIndex + 1} cleared`, 'success')
    } catch (err) {
      showSnack(`Failed to save: ${err.message}`, 'error')
    }
  }

  function openPicker(streamIndex, day, tournamentId) {
    setPickerDialog({ open: true, slot: streamIndex, day, tournamentId })
  }

  // ── JW channel management ─────────────────────────────────────────────────────

  async function deleteChannel(id, name, youtubeBroadcastId, youtubeStreamId, facebookLiveVideoId) {
    if (!confirm(`Destroy stream "${name}"?\n\nThis cannot be undone.`)) return
    try {
      const res = await fetch('/api/delete-stream', {
        method: 'DELETE',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({
          id,
          name,
          ...(youtubeBroadcastId   ? { youtube_broadcast_id:   youtubeBroadcastId   } : {}),
          ...(youtubeStreamId      ? { youtube_stream_id:      youtubeStreamId      } : {}),
          ...(facebookLiveVideoId  ? { facebook_live_video_id: facebookLiveVideoId  } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(`${data.error}${data.detail ? ` — ${data.detail}` : ''}`)
      // Optimistically remove from state immediately — JW propagation can lag
      setChannels(prev => prev.filter(ch => ch.id !== id))
      // Background refresh to stay in sync with JW
      fetchChannels()
    } catch (err) {
      alert(`Failed to delete stream: ${err.message}`)
    }
  }

  // ── Stats helpers ────────────────────────────────────────────────────────────
  const liveNow = channels.filter(ch => ['active','streaming'].includes(ch.status)).length
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const sessionsToday = tournaments.reduce((sum, t) => sum + (t.days || []).filter(d => d.date === todayStr).length, 0)
  const totalCdnCost = cdnRecords
    .filter(r => (r.tenant_id || 'default') === tenantId)
    .reduce((sum, r) => sum + (r.cost_total || 0), 0)

  const isReadOnly = tenantRole === 'read_only'

  const NAV_ITEMS = [
    { section: 'MANAGEMENT', items: [
      { label: 'Live Streams',    tab: 'dashboard', view: 'streams', count: channels.length },
      { label: 'Encoders',        tab: 'encoders',  view: null },
      { label: 'Routers',         tab: 'routers',   view: null },
    ]},
    ...(isReadOnly ? [] : [{ section: 'SYSTEM', items: [
      { label: 'Settings', tab: 'settings', view: null },
    ]}]),
    ...(isSuperAdmin ? [
      { section: 'FINANCE', items: [
        { label: 'Costs', tab: 'costs', view: null },
      ]},
      { section: 'PLATFORM', items: [
        { label: 'Tenants',      tab: 'tenants',     view: null, count: tenants?.length },
        { label: 'Super Admins', tab: 'superadmins', view: null },
      ]},
    ] : []),
  ]

  function navClick(tab, view) {
    navigate(tabToPath(tab, view))
  }

  function isNavActive(tab, view) {
    if (activeTab !== tab) return false
    if (view && tab === 'dashboard') return dashboardView === view
    return true
  }

  // Shared sidebar contents (used both in the permanent desktop rail and the mobile drawer)
  const sidebarContent = (
    <Box sx={{ bgcolor: '#0a0f1a', display: 'flex', flexDirection: 'column', py: 2, height: '100%', overflow: 'auto' }}>
      {isMobile && (
        <Box sx={{ px: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 1, borderBottom: '1px solid rgba(255,255,255,0.06)', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EHLLogo size={20} dark animate />
              <Typography sx={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 700 }}>{tenantName || 'Admin'}</Typography>
            </Box>
            <IconButton onClick={() => setSidebarOpen(false)} sx={{ color: '#a8bcd4' }} size="small">
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {isSuperAdmin && (
              <Chip label="SUPER ADMIN" size="small"
                sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', bgcolor: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.35)' }} />
            )}
            {isReadOnly && (
              <Chip label="READ-ONLY" size="small"
                sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', bgcolor: 'rgba(148,163,184,0.12)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)' }} />
            )}
            {liveNow > 0 && (
              <Chip label={`${liveNow} LIVE`} size="small"
                sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, bgcolor: AP.liveDim, color: AP.live, border: `1px solid ${AP.liveBdr}` }} />
            )}
          </Box>
          {tenants && tenants.length > 1 && (
            <TextField
              select
              size="small"
              value={tenantId}
              onChange={e => onSwitchTenant?.(e.target.value)}
              sx={{
                mt: 0.5,
                '& .MuiInputBase-root': { fontSize: '0.78rem', color: '#a8bcd4', height: 40 },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.12)' },
              }}
            >
              {tenants.map(t => <MenuItem key={t.id} value={t.id} sx={{ fontSize: '0.85rem' }}>{t.name}</MenuItem>)}
            </TextField>
          )}
        </Box>
      )}
      {NAV_ITEMS.map(({ section, items }) => (
        <Box key={section} sx={{ mb: 2 }}>
          <Typography sx={{ px: 2, pb: 0.75, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(148,163,184,0.5)', textTransform: 'uppercase' }}>
            {section}
          </Typography>
          {items.map(item => {
            const active = isNavActive(item.tab, item.view)
            return (
              <Box
                key={item.label}
                onClick={() => { navClick(item.tab, item.view); if (isMobile) setSidebarOpen(false) }}
                sx={{
                  px: 2, py: { xs: 1.1, md: 0.85 }, display: 'flex', alignItems: 'center', gap: 1,
                  cursor: 'pointer', borderRadius: '0 6px 6px 0', mr: 1,
                  minHeight: { xs: 44, md: 'auto' },
                  bgcolor: active ? AP.accentDim : 'transparent',
                  borderLeft: active ? `2px solid ${AP.accent}` : '2px solid transparent',
                  '&:hover': { bgcolor: active ? AP.accentMid : 'rgba(255,255,255,0.04)' },
                }}
              >
                <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: active ? AP.accent : 'rgba(148,163,184,0.4)', flexShrink: 0 }} />
                <Typography sx={{ fontSize: { xs: '0.85rem', md: '0.78rem' }, fontWeight: active ? 700 : 500, color: active ? '#e2e8f0' : '#94a3b8', flex: 1 }}>
                  {item.label}
                </Typography>
                {item.count != null && (
                  <Chip label={item.count} size="small" sx={{ height: 16, fontSize: '0.58rem', fontWeight: 700, bgcolor: 'rgba(255,255,255,0.07)', color: '#64748b', minWidth: 20 }} />
                )}
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )

  return (
    <Box height="100vh" display="flex" flexDirection="column" sx={{ bgcolor: 'background.default', overflow: 'hidden' }}>
      {/* Topbar */}
      <Box height={48} display="flex" alignItems="center" px={{ xs: 1, sm: 2 }} gap={{ xs: 1, sm: 1.5 }}
        sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', bgcolor: '#0a0f1a', flexShrink: 0, zIndex: 10 }}
      >
        {/* Hamburger — mobile/tablet only */}
        <IconButton
          onClick={() => setSidebarOpen(true)}
          sx={{ color: '#a8bcd4', display: { xs: 'inline-flex', md: 'none' }, mr: 0.5 }}
          size="small"
        >
          <MenuIcon sx={{ fontSize: 22 }} />
        </IconButton>

        {/* Topbar logo */}
        <EHLLogo size={20} dark animate />
        <Typography variant="caption" sx={{ color: '#334155', fontSize: '0.7rem', display: { xs: 'none', md: 'inline' } }}>Admin</Typography>
        {tenantName && (
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem', display: { xs: 'none', md: 'inline' } }}>· {tenantName}</Typography>
        )}
        {isSuperAdmin && (
          <Chip label="SUPER ADMIN" size="small"
            sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.05em', bgcolor: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.35)', display: { xs: 'none', md: 'inline-flex' } }} />
        )}
        {isReadOnly && (
          <Chip label="READ-ONLY" size="small"
            sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.05em', bgcolor: 'rgba(148,163,184,0.12)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)', display: { xs: 'none', md: 'inline-flex' } }} />
        )}
        {liveNow > 0 && (
          <Chip label={`${liveNow} LIVE`} size="small"
            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: AP.liveDim, color: AP.live, border: `1px solid ${AP.liveBdr}`, display: { xs: 'none', sm: 'inline-flex' } }} />
        )}
        <Box ml="auto" display="flex" gap={1} alignItems="center">
          {tenants && tenants.length > 1 && (
            <TextField
              select
              size="small"
              value={tenantId}
              onChange={e => onSwitchTenant?.(e.target.value)}
              sx={{
                display: { xs: 'none', md: 'flex' },
                '& .MuiInputBase-root': { fontSize: '0.72rem', color: '#a8bcd4', height: 30 },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.12)' },
                minWidth: 140,
              }}
            >
              {tenants.map(t => <MenuItem key={t.id} value={t.id} sx={{ fontSize: '0.78rem' }}>{t.name}</MenuItem>)}
            </TextField>
          )}
          <Tooltip title="Logout">
            <IconButton onClick={onLogout} sx={{ color: '#a8bcd4' }} size="small">
              <LogoutIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Layout */}
      <Box display="flex" flex={1} overflow="hidden">
        {/* Sidebar — permanent rail on desktop, overlay drawer on mobile/tablet */}
        <Box
          sx={{
            display: { xs: 'none', md: 'block' },
            width: 200, flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {sidebarContent}
        </Box>
        <Drawer
          anchor="left"
          open={isMobile && sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: 260, boxSizing: 'border-box' } }}
        >
          {sidebarContent}
        </Drawer>

        {/* Main content */}
        <Box flex={1} overflow="auto">
          {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

          {activeTab === 'dashboard' && (
            <>
              {/* Stats row — temporarily hidden; flip SHOW_STATS_ROW to true to restore */}
              {SHOW_STATS_ROW && (
              <Box display="grid" sx={{ gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, gap: { xs: 1, sm: 1.5 }, p: { xs: 1, sm: 2 }, pb: 0 }}>
                {[
                  { label: 'Live Now',       value: liveNow,        color: AP.live,    dim: AP.liveDim   },
                  { label: 'Sessions Today', value: sessionsToday,  color: AP.accent,  dim: AP.accentDim },
                  { label: 'Event Cost',     value: `$${totalCdnCost.toFixed(2)}`, color: AP.warn, dim: AP.warnDim },
                  { label: 'Total Streams',  value: channels.length, color: AP.slate,  dim: AP.slateDim  },
                ].map(({ label, value, color, dim }) => (
                  <Paper key={label} elevation={0} sx={{ p: 2, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, bgcolor: dim }}>
                    <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {label}
                    </Typography>
                    <Typography sx={{ color, fontWeight: 700, fontSize: '1.6rem', fontFamily: "'Bayon', sans-serif", lineHeight: 1.2, mt: 0.25 }}>
                      {value}
                    </Typography>
                  </Paper>
                ))}
              </Box>
              )}

              {/* Single-panel content area — switches based on nav selection */}
              <Box sx={{ p: { xs: 1, sm: 2 } }}>

                {/* Events panel */}
                {dashboardView === 'events' && <Paper elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                  <Box sx={{
                    px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    background: `linear-gradient(90deg, ${AP.accentDim} 0%, transparent 60%)`,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem' }}>
                        EVENTS
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="Refresh">
                        <IconButton size="small" onClick={fetchTournaments} sx={{ color: '#a8bcd4' }}>
                          <RefreshIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        variant="outlined"
                        onClick={() => setTournamentDialog({ open: true, initial: null })}
                        sx={{ fontSize: '0.72rem', borderColor: AP.accentBdr, color: AP.accent, '&:hover': { borderColor: AP.accent } }}
                      >
                        Add Event
                      </Button>
                    </Box>
                  </Box>

                  <Box sx={{ p: loadingTournaments ? 0 : 2 }}>
                    {loadingTournaments ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress size={28} sx={{ color: AP.accent }} />
                      </Box>
                    ) : tournaments.length === 0 ? (
                      <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(168,188,212,0.5)' }}>
                          No events yet. Click "Add Event" to create one.
                        </Typography>
                      </Box>
                    ) : (
                      tournaments.map(t => (
                        <TournamentCard
                          key={t.id}
                          tournament={t}
                          channels={channels}
                          token={token}
                          onRefresh={fetchTournaments}
                          onAddDay={tournament => setDayDialog({ open: true, initial: null, tournament })}
                          onEditDay={(day, tournament) => setDayDialog({ open: true, initial: day, tournament })}
                          onDeleteDay={deleteDay}
                          onOpenPicker={openPicker}
                          onEditTournament={tournament => setTournamentDialog({ open: true, initial: tournament })}
                          onDeleteTournament={deleteTournament}
                        />
                      ))
                    )}
                  </Box>
                </Paper>}

                {/* Streams panel */}
                {dashboardView === 'streams' && <Box>
                  <Box sx={{
                    px: 1, py: 1.5, display: 'flex', flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: { xs: 1.25, sm: 0 },
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem' }}>
                        LIVE STREAMS
                      </Typography>
                      {/* Type filter — Both / Events / 24/7 */}
                      <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1.5, p: '2px', gap: '2px' }}>
                        {[
                          { value: 'all',   label: 'Both'   },
                          { value: 'event', label: 'Events' },
                          { value: '24/7',  label: '24/7'   },
                        ].map(opt => (
                          <Box
                            key={opt.value}
                            onClick={() => {
                              setStreamTypeFilter(opt.value)
                              // Reset status filter when switching to 24/7 since those concepts don't apply
                              if (opt.value === '24/7') setStreamFilter('all')
                            }}
                            sx={{
                              px: 1.25, py: 0.35, borderRadius: 1, cursor: 'pointer',
                              fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.04em',
                              transition: 'all 0.15s',
                              bgcolor: streamTypeFilter === opt.value ? AP.accentDim : 'transparent',
                              color:   streamTypeFilter === opt.value ? AP.accent    : AP.muted,
                              border:  streamTypeFilter === opt.value ? `1px solid ${AP.accentBdr}` : '1px solid transparent',
                              '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.07)' },
                            }}
                          >
                            {opt.label}
                          </Box>
                        ))}
                      </Box>
                      {/* Status filter — hidden for 24/7 since scheduled/past don't apply */}
                      {streamTypeFilter !== '24/7' && (
                        <Box component="select"
                          value={streamFilter}
                          onChange={e => setStreamFilter(e.target.value)}
                          sx={{
                            bgcolor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 1, color: AP.muted, fontSize: '0.7rem', px: 1, py: 0.4,
                            cursor: 'pointer', outline: 'none',
                            '&:hover': { borderColor: 'rgba(255,255,255,0.25)' },
                          }}
                        >
                          <option value="all">All</option>
                          <option value="live">Live</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="past">Past Event</option>
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'space-between', sm: 'flex-end' }, gap: 1 }}>
                      <Tooltip title="Refresh channels">
                        <IconButton size="small" onClick={fetchChannels} sx={{ color: '#a8bcd4' }}>
                          <RefreshIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                      {!isReadOnly && (
                        <Button
                          size="small"
                          startIcon={<LiveTvIcon sx={{ fontSize: '14px !important' }} />}
                          variant="outlined"
                          onClick={() => { setCreateStreamKey(k => k + 1); setCreateStreamOpen(true) }}
                          sx={{ fontSize: '0.72rem', borderColor: AP.accentBdr, color: AP.accent, whiteSpace: 'nowrap', minHeight: { xs: 44, sm: 'auto' }, flex: { xs: 1, sm: 'initial' }, '&:hover': { borderColor: AP.accent } }}
                        >
                          New Live Stream
                        </Button>
                      )}
                    </Box>
                  </Box>

              {channelError && (
                <Alert severity="warning" sx={{ m: 2, fontSize: '0.8rem' }}>{channelError}</Alert>
              )}

              {loadingChannels ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={28} sx={{ color: AP.accent }} />
                </Box>
              ) : (
                <>
                {/* ── Column header bar — hidden on mobile, rows read as cards there ── */}
                <Box sx={{
                  display: { xs: 'none', sm: 'grid' },
                  gridTemplateColumns: '1fr 110px 100px 160px',
                  px: 1, py: 0.75,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  {['Stream title', 'Status', 'Destinations', 'Schedule'].map((col, i) => (
                    <Typography key={col} sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(148,163,184,0.5)', textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'left' }}>
                      {col}
                    </Typography>
                  ))}
                </Box>

                {/* ── Rows ── */}
                <Box>
                    {(() => {
                      // ── Sort helper (newest first) ───────────────────────────
                      const sortByStart = (a, b) => {
                        if (!a.stream_start && !b.stream_start) return (a.name || '').localeCompare(b.name || '')
                        if (!a.stream_start) return 1
                        if (!b.stream_start) return -1
                        const d = new Date(b.stream_start) - new Date(a.stream_start)
                        return d !== 0 ? d : (a.name || '').localeCompare(b.name || '')
                      }

                      // ── Enrich CDN records → synthetic past stream rows ──────
                      // Only skip channels that are currently active/scheduled in JW.
                      // Idle/past JW channels are included via cdnRecords so each day
                      // shows as its own row (instead of deduplicating by channel ID).
                      const jwActiveIds = new Set(
                        channels
                          .filter(ch => ['active','requested','scheduled','creating'].includes(ch.status?.toLowerCase()))
                          .map(ch => ch.id)
                      )
                      // Also track JW channel+date combos already represented in the list
                      const jwDateKeys = new Set(
                        channels.map(ch => `${ch.id}::${ch.stream_start ? ch.stream_start.slice(0,10) : ''}`)
                      )

                      // Helper: parse "8:00 AM" → decimal hours
                      const parseHr = t => {
                        if (!t) return null
                        const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i)
                        if (!m) return null
                        let h = parseInt(m[1]); const min = parseInt(m[2]); const ap = m[3].toUpperCase()
                        if (ap === 'PM' && h !== 12) h += 12
                        if (ap === 'AM' && h === 12) h = 0
                        return h + min / 60
                      }
                      // Helper: combine date string + time string into UTC ISO
                      const toIso = (date, timeStr) => {
                        const hr = parseHr(timeStr)
                        if (!date || hr === null) return null
                        const d = new Date(date + 'T00:00:00')
                        d.setHours(Math.floor(hr), Math.round((hr % 1) * 60))
                        return d.toISOString()
                      }

                      const syntheticPast = []
                      cdnRecords.forEach(r => {
                        if (!r.channel_id) return
                        // cdn_records is agency-wide (Super Admins fetch it globally for
                        // billing), but these synthetic rows back the per-tenant Live
                        // Streams view — never let another tenant's history bleed in.
                        if ((r.tenant_id || 'default') !== tenantId) return
                        // Skip if channel is currently live/scheduled in JW
                        if (jwActiveIds.has(r.channel_id)) return
                        // Skip if JW already has this channel on this same date
                        if (jwDateKeys.has(`${r.channel_id}::${r.date || ''}`)) return

                        // Find the tournament day that matches this channel + date
                        let dayStart = null, dayEnd = null, dayLabel = null
                        for (const t of tournaments) {
                          for (const d of (t.days || [])) {
                            if (d.date !== r.date) continue
                            const urls = [d.camera1_url, d.camera2_url].filter(Boolean)
                            if (urls.some(u => u.includes(r.channel_id))) {
                              dayStart = toIso(d.date, d.start_time)
                              dayEnd   = toIso(d.date, d.end_time)
                              dayLabel = d.label || null
                              break
                            }
                          }
                          if (dayStart) break
                        }

                        syntheticPast.push({
                          id:           r.channel_id,
                          _cdnDate:     r.date,           // used for unique row key
                          name:         r.channel_name,
                          status:       'idle',
                          stream_type:  'event',
                          stream_url:   null,
                          stream_start: dayStart || (r.date ? `${r.date}T09:00:00` : null),
                          stream_end:   dayEnd   || (r.date ? `${r.date}T18:00:00` : null),
                          ingest_url:   null,
                          ingest_key:   null,
                          _fromCdn:     true,
                          _cdnLabel:    dayLabel || r.label || null,
                        })
                      })

                      // ── Build full list and apply filter ─────────────────────
                      const allChannels = [...channels, ...syntheticPast].sort(sortByStart)
                      const filterGroup = ch => {
                        // Type filter
                        if (streamTypeFilter === 'event' && ch.stream_type !== 'event') return false
                        if (streamTypeFilter === '24/7'  && ch.stream_type !== '24/7')  return false
                        // Status filter
                        const s = ch.status?.toLowerCase()
                        if (streamFilter === 'live')      return s === 'active' || s === 'streaming'
                        if (streamFilter === 'scheduled') return ['requested','scheduled','creating','starting','ready','preview'].includes(s)
                        if (streamFilter === 'past') {
                          if (['stopping','destroying','deleting'].includes(s)) return true
                          if (s === 'idle') return ch.stream_type === '24/7' ? false : resolveIdleStatus(ch) === 'past'
                          return false
                        }
                        return true
                      }
                      const visibleChannels = allChannels.filter(filterGroup)

                      // ── Format timestamps ────────────────────────────────────
                      const fmtTime = iso => {
                        if (!iso) return null
                        return new Date(iso).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          timeZone: TZ,
                        })
                      }
                      const fmtWindow = (startIso, endIso) => {
                        const s = fmtTime(startIso)
                        const e = fmtTime(endIso)
                        if (!s && !e) return '—'
                        // If same calendar day, show date once: "Apr 24 · 8:00 AM – 5:00 PM ET"
                        const sDate = startIso ? new Date(startIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ }) : null
                        const eDate = endIso   ? new Date(endIso).toLocaleDateString('en-US',   { month: 'short', day: 'numeric', timeZone: TZ }) : null
                        if (s && e && sDate === eDate) {
                          const sTime = s.replace(/^[A-Za-z]+ \d+,?\s*/, '')
                          const eTime = e.replace(/^[A-Za-z]+ \d+,?\s*/, '')
                          return { date: sDate, range: `${sTime} – ${eTime} ${tzLabel}` }
                        }
                        if (s && e) return { date: null, range: `${s} – ${e} ${tzLabel}` }
                        if (s)      return { date: null, range: `${s} ${tzLabel}` }
                        return       { date: null, range: `– ${e} ${tzLabel}` }
                      }

                      if (visibleChannels.length === 0) return (
                        <Box sx={{ textAlign: 'center', py: 5 }}>
                          <Typography sx={{ color: AP.muted, fontStyle: 'italic', fontSize: '0.82rem' }}>
                            No streams match the selected filter.
                          </Typography>
                        </Box>
                      )

                      return visibleChannels.map(ch => {
                        const s = ch.status?.toLowerCase()
                        const cfg          = getStatusDisplay(ch)
                        const cfgKey       = cfg.key
                        const spinupStatus = getSpinupStatus(ch)
                        const isLiveNow    = s === 'active' || s === 'streaming'
                        const is247        = ch.stream_type === '24/7'

                        // ── Thumbnail icon ──────────────────────────────────────
                        const thumbIcon = is247
                          ? <AllInclusiveIcon sx={{ fontSize: 17, opacity: 0.7 }} />
                          : <EventIcon       sx={{ fontSize: 17, opacity: 0.7 }} />
                        const thumbBg = isLiveNow
                          ? 'rgba(16,185,129,0.18)'
                          : cfgKey === 'scheduled' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)'
                        const thumbBorder = isLiveNow
                          ? 'rgba(16,185,129,0.35)'
                          : cfgKey === 'scheduled' ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)'
                        const thumbColor = isLiveNow
                          ? '#10b981'
                          : cfgKey === 'scheduled' ? AP.accent : AP.muted

                        // ── Schedule cell content ───────────────────────────────
                        const scheduleCell = (() => {
                          if (is247 && isLiveNow) {
                            const startIso = ch.stream_start || ch.created_at
                            if (startIso) {
                              const d = new Date(startIso)
                              return (
                                <Box>
                                  <Typography sx={{ color: AP.muted, fontSize: '0.58rem', letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 700, lineHeight: 1.2 }}>Started</Typography>
                                  <Typography sx={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600 }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })}</Typography>
                                  <Typography sx={{ color: AP.muted, fontSize: '0.68rem' }}>{d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })} {tzLabel}</Typography>
                                </Box>
                              )
                            }
                            return <Typography sx={{ color: AP.muted, fontSize: '0.72rem' }}>24/7 Live</Typography>
                          }
                          if (is247 && ch.created_at) {
                            return (
                              <Box>
                                <Typography sx={{ color: AP.muted, fontSize: '0.58rem', letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 700, lineHeight: 1.2 }}>Created</Typography>
                                <Typography sx={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600 }}>{new Date(ch.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ })}</Typography>
                              </Box>
                            )
                          }
                          const w = fmtWindow(ch.stream_start, ch.stream_end)
                          if (w === '—') return <Typography sx={{ color: 'rgba(168,188,212,0.25)', fontSize: '0.72rem' }}>—</Typography>
                          return (
                            <Box>
                              {w.date && <Typography sx={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.3 }}>{w.date}</Typography>}
                              <Typography sx={{ color: AP.muted, fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{w.range}</Typography>
                            </Box>
                          )
                        })()

                        return (
                          <Box
                            key={ch._fromCdn ? `cdn-${ch.id}-${ch._cdnDate}` : ch.id}
                            onClick={() => navigate(`/admin/stream/${ch.id}`, { state: { channel: ch } })}
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: { xs: '1fr auto', sm: '1fr 110px 100px 160px' },
                              gridTemplateAreas: {
                                xs: '"title title" "status dest" "sched sched"',
                                sm: '"title status dest sched"',
                              },
                              rowGap: { xs: 0.75, sm: 0 },
                              alignItems: 'center',
                              px: 1, py: { xs: 1.5, sm: 1.25 },
                              minHeight: { xs: 44, sm: 'auto' },
                              cursor: 'pointer',
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              transition: 'background 0.12s',
                              '&:last-child': { borderBottom: 'none' },
                              '&:hover': { bgcolor: 'rgba(255,255,255,0.025)', borderRadius: 1.5 },
                            }}
                          >
                            {/* ── Title cell ── */}
                            <Box sx={{ gridArea: 'title', display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                              {/* Thumbnail */}
                              <Box sx={{
                                width: 44, height: 34, borderRadius: 1.5, flexShrink: 0,
                                bgcolor: thumbBg, border: `1px solid ${thumbBorder}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: thumbColor, position: 'relative', overflow: 'hidden',
                              }}>
                                {thumbIcon}
                                {isLiveNow && (
                                  <Box sx={{
                                    position: 'absolute', bottom: 3, right: 4,
                                    width: 5, height: 5, borderRadius: '50%', bgcolor: '#10b981',
                                    boxShadow: '0 0 4px #10b981',
                                    animation: 'liveDotList 1.8s ease-in-out infinite',
                                    '@keyframes liveDotList': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                                  }} />
                                )}
                              </Box>

                              {/* Name + meta */}
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: { xs: '100%', sm: 340 } }}>
                                    {ch.name}
                                  </Typography>
                                  {ch.enable_live_to_vod && (
                                    <Tooltip title={isVodExpired(ch) ? 'Recording expired' : 'Downloadable recording'}>
                                      <DownloadIcon sx={{ fontSize: 12, color: isVodExpired(ch) ? AP.muted : AP.live, flexShrink: 0 }} />
                                    </Tooltip>
                                  )}
                                </Box>
                                <Typography sx={{ fontSize: '0.62rem', color: 'rgba(148,163,184,0.4)', fontFamily: 'monospace', mt: '1px' }}>
                                  {ch.id.slice(0, 8)}… · {is247 ? '24/7' : 'Event'}
                                </Typography>
                              </Box>
                            </Box>

                            {/* ── Status cell ── */}
                            <Box sx={{ gridArea: 'status', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {!spinupStatus && (
                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: '7px', height: 20, borderRadius: '5px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, lineHeight: 1, width: 'fit-content' }}>
                                  {isLiveNow && <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: cfg.color, flexShrink: 0 }} />}
                                  {cfg.label}
                                </Box>
                              )}
                              {spinupStatus === 'starting_soon' && <Box sx={{ display: 'inline-flex', alignItems: 'center', px: '7px', height: 20, borderRadius: '5px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em', backgroundColor: AP.warnDim, color: AP.warn, border: `1px solid rgba(245,158,11,0.4)`, lineHeight: 1, width: 'fit-content' }}>Starting Soon</Box>}
                              {spinupStatus === 'winding_down' && <Box sx={{ display: 'inline-flex', alignItems: 'center', px: '7px', height: 20, borderRadius: '5px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em', backgroundColor: AP.slateDim, color: AP.slate, border: `1px solid rgba(100,116,139,0.4)`, lineHeight: 1, width: 'fit-content' }}>Winding Down</Box>}
                            </Box>

                            {/* ── Destinations cell ── */}
                            <Box sx={{ gridArea: 'dest', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              {ch.youtube_broadcast_id && (
                                <Tooltip title="YouTube">
                                  <Box component="img" src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg" sx={{ width: 18, height: 18, opacity: 0.85, flexShrink: 0 }} />
                                </Tooltip>
                              )}
                              {ch.facebook_live_video_id && (
                                <Tooltip title="Facebook">
                                  <Box sx={{ width: 18, height: 18, borderRadius: '4px', bgcolor: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.85 }}>
                                    <Box component="svg" viewBox="0 0 24 24" sx={{ width: 10, height: 10, fill: '#fff' }}>
                                      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.288h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                                    </Box>
                                  </Box>
                                </Tooltip>
                              )}
                              {!ch.youtube_broadcast_id && !ch.facebook_live_video_id && (
                                <Typography sx={{ color: 'rgba(148,163,184,0.25)', fontSize: '0.72rem' }}>—</Typography>
                              )}
                            </Box>

                            {/* ── Schedule cell ── */}
                            <Box sx={{ gridArea: 'sched' }}>{scheduleCell}</Box>
                          </Box>
                        )
                      })
                    })()}
                  </Box>
                </>
              )}
                </Box>}
              </Box>
            </>
          )}

          {activeTab === 'encoders' && (
            <Box sx={{ p: { xs: 1, sm: 2 } }}>
              <Routes>
                <Route index element={<EncoderList token={token} tenantId={tenantId} readOnly={isReadOnly} />} />
                <Route path="new" element={<EncoderForm mode="create" token={token} tenantId={tenantId} />} />
                <Route path=":id/edit" element={<EncoderForm mode="edit" token={token} tenantId={tenantId} />} />
                <Route path=":id" element={<EncoderControl token={token} tenantId={tenantId} readOnly={isReadOnly} />} />
              </Routes>
            </Box>
          )}

          {activeTab === 'routers' && (
            <Box sx={{ p: { xs: 1, sm: 2 } }}>
              <Box sx={{
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)',
                p: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5,
              }}>
                <RouterIcon sx={{ fontSize: 32, color: AP.muted }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>Routers</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: AP.muted, fontStyle: 'italic' }}>Coming soon</Typography>
              </Box>
            </Box>
          )}

          {activeTab === 'costs' && isSuperAdmin && (
            <Box sx={{ p: { xs: 1, sm: 2 }, pb: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <CostsPage
                tournaments={tournaments}
                channels={channels}
                cdnRecords={cdnRecords}
                cdnPricing={cdnPricing}
              />
              <CdnRecordsPanel token={token} />
              <PricingPanel token={token} />
            </Box>
          )}

          {activeTab === 'settings' && !isReadOnly && (
            <Box sx={{ p: { xs: 1, sm: 2 }, pb: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>

              {/* ── Team: who has access to this organization ── */}
              <TenantMembersPanel token={token} tenantId={tenantId} canManage={tenantRole === 'admin' || isSuperAdmin} />

              {/* ── Bottom row: Integrations + Infrastructure side by side ── */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <IntegrationsPanel token={token} tenantId={tenantId} />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', color: AP.muted, textTransform: 'uppercase' }}>Infrastructure</Typography>
                  <IngestPointsPanel token={token} tenantId={tenantId} />
                </Box>

              </Box>
            </Box>
          )}

          {activeTab === 'tenants' && isSuperAdmin && (
            <Box sx={{ p: { xs: 1, sm: 2 } }}>
              <TenantsPanel token={token} />
            </Box>
          )}

          {activeTab === 'superadmins' && isSuperAdmin && (
            <Box sx={{ p: { xs: 1, sm: 2 } }}>
              <SuperAdminsPanel token={token} />
            </Box>
          )}

        </Box>
      </Box>

      {/* ── Dialogs / Drawers ─────────────────────────────────── */}
      <PreviewPlayerDialog
        open={previewDialog.open}
        channelName={previewDialog.channelName}
        streamUrl={previewDialog.streamUrl}
        onClose={() => setPreviewDialog(p => ({ ...p, open: false }))}
        onExited={() => setPreviewDialog({ open: false, channelName: '', streamUrl: '' })}
      />
      <CostRecordDialog
        open={costRecordDialog.open}
        initial={costRecordDialog.initial}
        onClose={() => setCostRecordDialog({ open: false, initial: null })}
        onSave={saveCostRecord}
      />
      <EventDrawer
        open={tournamentDialog.open}
        initial={tournamentDialog.initial}
        onClose={() => setTournamentDialog({ open: false, initial: null })}
        onSave={saveTournament}
      />
      <SessionDrawer
        open={dayDialog.open}
        initial={dayDialog.initial}
        tournament={dayDialog.tournament}
        channels={channels}
        onClose={() => setDayDialog({ open: false, initial: null, tournament: null })}
        onSaved={saveDay}
        onOpenPicker={openPicker}
      />
      <ChannelPickerDialog
        open={pickerDialog.open}
        slot={pickerDialog.slot}
        day={pickerDialog.day}
        channels={channels}
        onClose={() => setPickerDialog({ open: false, slot: null, day: null, tournamentId: null })}
        onPick={picked => assignCamera(pickerDialog.slot, pickerDialog.tournamentId, picked)}
      />
      <StreamDetailDrawer
        open={!!selectedChannel}
        channel={selectedChannel}
        token={token}
        tenantId={tenantId}
        readOnly={isReadOnly}
        onClose={() => setSelectedChannel(null)}
        onDelete={(id, name, ytBroadcastId, ytStreamId, fbLiveVideoId) => deleteChannel(id, name, ytBroadcastId, ytStreamId, fbLiveVideoId)}
        onPreview={ch => setPreviewDialog({ open: true, channelName: ch.name, streamUrl: ch.stream_url })}
      />
      <CreateStreamDrawer
        key={createStreamKey}
        open={createStreamOpen}
        token={token}
        tenantId={tenantId}
        onClose={() => setCreateStreamOpen(false)}
        onCreated={() => fetchChannels()}
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.severity}
          onClose={() => setSnack(s => ({ ...s, open: false }))}
          sx={{ width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Admin() {
  const [authSession, setAuthSession] = useState(null)   // Supabase session | null
  const [authLoading, setAuthLoading] = useState(true)
  const [me, setMe]               = useState(null)       // { isSuperAdmin, tenants } | null
  const [meLoading, setMeLoading] = useState(false)
  const [activeTenantId, setActiveTenantId] = useState(() => sessionStorage.getItem(ACTIVE_TENANT_KEY) || '')

  // Track the live Supabase auth session (handles sign-in, sign-out, and
  // silent background token refresh so long live-events don't get logged out)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session || null)
      setAuthLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setAuthSession(sess || null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Persist the current token so independently-routed pages (StreamPage) can
  // read it the same simple way they always have.
  useEffect(() => {
    if (authSession?.access_token) {
      sessionStorage.setItem(SESSION_KEY, authSession.access_token)
    } else {
      sessionStorage.removeItem(SESSION_KEY)
    }
  }, [authSession?.access_token])

  // Fetch role + tenant memberships whenever the auth session (re)appears
  useEffect(() => {
    if (!authSession?.access_token) { setMe(null); return }
    setMeLoading(true)
    fetch('/api/auth-me', { headers: { Authorization: `Bearer ${authSession.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setMe(data))
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false))
  }, [authSession?.access_token])

  // Auto-select the tenant when there's exactly one; drop an invalid stored choice
  useEffect(() => {
    if (!me) return
    const stillValid = me.tenants.some(t => t.id === activeTenantId)
    if (stillValid) return
    if (me.tenants.length === 1) {
      selectTenant(me.tenants[0])
    } else {
      setActiveTenantId('')
      sessionStorage.removeItem(ACTIVE_TENANT_KEY)
      sessionStorage.removeItem(ROLE_KEY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  function selectTenant(t) {
    setActiveTenantId(t.id)
    sessionStorage.setItem(ACTIVE_TENANT_KEY, t.id)
    sessionStorage.setItem(ROLE_KEY, me?.isSuperAdmin ? 'super_admin' : t.role)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(ACTIVE_TENANT_KEY)
    sessionStorage.removeItem(ROLE_KEY)
    setMe(null)
    setActiveTenantId('')
  }

  const activeTenant = me?.tenants.find(t => t.id === activeTenantId) || null
  const tenantRole   = activeTenant ? (me.isSuperAdmin ? 'admin' : activeTenant.role) : null

  let body
  if (authLoading || (authSession && meLoading)) {
    body = (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: AP.accent }} />
      </Box>
    )
  } else if (!authSession) {
    body = <LoginScreen />
  } else if (!me) {
    body = (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <Typography sx={{ color: AP.muted }}>Couldn't load your account. Please try again.</Typography>
        <Button variant="outlined" onClick={handleLogout}>Log out</Button>
      </Box>
    )
  } else if (!activeTenant) {
    body = <TenantPicker tenants={me.tenants} onSelect={selectTenant} onLogout={handleLogout} />
  } else {
    body = (
      <Dashboard
        token={authSession.access_token}
        tenantId={activeTenant.id}
        tenantName={activeTenant.name}
        isSuperAdmin={me.isSuperAdmin}
        tenantRole={tenantRole}
        tenants={me.tenants}
        onSwitchTenant={id => {
          const t = me.tenants.find(x => x.id === id)
          if (t) selectTenant(t)
        }}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <ThemeProvider theme={adminTheme}>
      <CssBaseline />
      {body}
    </ThemeProvider>
  )
}

