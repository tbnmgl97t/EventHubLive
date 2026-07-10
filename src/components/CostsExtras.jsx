import React, { useState, useEffect, useCallback } from 'react'
import {
  Box, Paper, Typography, TextField, Button, CircularProgress,
  Alert, IconButton, Chip, Tooltip, Snackbar, MenuItem,
  Table, TableBody, TableCell, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider,
} from '@mui/material'
import AddIcon         from '@mui/icons-material/Add'
import DeleteIcon      from '@mui/icons-material/Delete'
import EditIcon        from '@mui/icons-material/Edit'
import RefreshIcon     from '@mui/icons-material/Refresh'
import SaveIcon        from '@mui/icons-material/Save'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import CloudIcon       from '@mui/icons-material/Cloud'
import TuneIcon        from '@mui/icons-material/Tune'

// ─── CDN Records & Pricing panels ──────────────────────────────────────────────
//
// These panels used to live in a standalone "TD Admin" component (now
// removed), gated behind a Trilogy-Digital-only password.
// They are now Super-Admin-only panels inside the main admin app. The data
// stays global/agency-wide — it is intentionally NOT scoped to any tenant, so
// these components do not send any tenant header, matching /api/cdn-records
// and /api/pricing which remain global, Super-Admin-gated endpoints.

// Palette matching the indigo accent used elsewhere in the admin dashboard
// (see AP in Admin.jsx) — duplicated locally since this file is standalone.
const AP = {
  accent:    '#6366f1',
  accentHov: '#4f46e5',
  accentDim: 'rgba(99,102,241,0.08)',
  accentBdr: 'rgba(99,102,241,0.3)',
  danger:    '#ef4444',
  paper:     '#161b2e',
  border:    'rgba(255,255,255,0.08)',
  muted:     '#94a3b8',
  text:      '#e2e8f0',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Number(n).toFixed(2)
}

function fmtGB(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(3) + ' GB'
}

function fmtDate(ds) {
  if (!ds) return '—'
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function monthKey(dateStr) {
  return dateStr?.slice(0, 7) ?? ''
}

function monthLabel(yyyymm) {
  if (!yyyymm) return ''
  const [y, m] = yyyymm.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function SectionHeader({ icon, title, action }) {
  return (
    <Box sx={{
      px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${AP.border}`,
      background: `linear-gradient(90deg, ${AP.accentDim} 0%, transparent 60%)`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {React.cloneElement(icon, { sx: { color: AP.accent, fontSize: 18 } })}
        <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem' }}>
          {title}
        </Typography>
      </Box>
      {action}
    </Box>
  )
}

// ─── CDN Record dialog ────────────────────────────────────────────────────────

const EMPTY_CDN = {
  date: '', label: '', tournament_id: '',
  channel_id: '', channel_name: '',
  stream_hours: '', minutes_delivered: '',
}

function CdnRecordDialog({ open, initial, tournaments, pricing, onClose, onSave }) {
  const [form, setForm]     = useState(EMPTY_CDN)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initial ? {
        date:              initial.date,
        label:             initial.label,
        tournament_id:     initial.tournament_id ?? '',
        channel_id:        initial.channel_id,
        channel_name:      initial.channel_name,
        stream_hours:      initial.stream_hours,
        minutes_delivered: initial.minutes_delivered,
      } : EMPTY_CDN)
    }
  }, [open, initial])

  const set = f => e => setForm(prev => ({ ...prev, [f]: e.target.value }))

  // Live cost preview
  const hrs  = Number(form.stream_hours)      || 0
  const mins = Number(form.minutes_delivered) || 0
  const gbRate      = pricing?.gb_per_50_min  ?? 4
  const feedRate    = pricing?.feed_rate_per_hr ?? 15
  const cdnRate     = pricing?.cdn_rate_per_gb  ?? 0.05
  const gb_preview  = (mins / 50) * gbRate
  const cost_feed   = hrs  * feedRate
  const cost_cdn    = gb_preview * cdnRate
  const cost_total  = cost_feed + cost_cdn

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ ...form, id: initial?.id })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const isValid = form.date && form.label && form.channel_id && form.channel_name &&
    form.stream_hours !== '' && form.minutes_delivered !== ''

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
      PaperProps={{ sx: { bgcolor: AP.paper, border: `1px solid ${AP.border}` } }}>
      <DialogTitle sx={{ borderBottom: `1px solid ${AP.border}`, py: 1.5, px: 2, fontSize: '0.95rem', fontWeight: 700 }}>
        {initial ? 'Edit CDN Record' : 'Add CDN Record'}
      </DialogTitle>
      <DialogContent sx={{ pt: '20px !important', pb: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="Date" type="date" value={form.date} onChange={set('date')}
            size="small" fullWidth InputLabelProps={{ shrink: true }} />
          <TextField label="Label" value={form.label} onChange={set('label')} size="small" fullWidth
            placeholder="KWC 2026 Session 3" />
        </Box>
        <TextField label="Event (optional)" select value={form.tournament_id} onChange={set('tournament_id')}
          size="small" fullWidth>
          <MenuItem value="">— None —</MenuItem>
          {tournaments.map(t => (
            <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
          ))}
        </TextField>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="Channel ID" value={form.channel_id} onChange={set('channel_id')}
            size="small" fullWidth placeholder="die1qpMr" />
          <TextField label="Channel Name" value={form.channel_name} onChange={set('channel_name')}
            size="small" fullWidth placeholder="Main Deck" />
        </Box>
        <Divider />
        <Typography variant="caption" sx={{ color: AP.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Usage Data
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="Stream Hours" type="number" value={form.stream_hours} onChange={set('stream_hours')}
            size="small" fullWidth inputProps={{ step: '0.25', min: 0 }}
            helperText="How long feed ran" />
          <TextField label="Minutes Delivered" type="number" value={form.minutes_delivered} onChange={set('minutes_delivered')}
            size="small" fullWidth inputProps={{ step: '1', min: 0 }}
            helperText="From CDN analytics" />
        </Box>

        {/* Live cost preview */}
        {(hrs > 0 || mins > 0) && (
          <Box sx={{
            p: 1.5, borderRadius: 1, bgcolor: AP.accentDim,
            border: `1px solid ${AP.accentBdr}`, display: 'flex', gap: 3, flexWrap: 'wrap',
          }}>
            <Box>
              <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.62rem', textTransform: 'uppercase' }}>GB Delivered</Typography>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>{gb_preview.toFixed(2)} GB</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.62rem', textTransform: 'uppercase' }}>Feed Fee</Typography>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>${cost_feed.toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.62rem', textTransform: 'uppercase' }}>CDN Cost</Typography>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>${cost_cdn.toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.62rem', textTransform: 'uppercase' }}>Total</Typography>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: AP.accent }}>${cost_total.toFixed(2)}</Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2 }}>
        <Button onClick={onClose} size="small" sx={{ color: AP.muted }}>Cancel</Button>
        <Button
          variant="contained" size="small" startIcon={<SaveIcon />}
          onClick={handleSave} disabled={!isValid || saving}
          sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Log from JW dialog ───────────────────────────────────────────────────────
// Shows all JW feeds with stream hours pre-filled; only Minutes Delivered is entered.

function LogFromJwDialog({ open, channels, records, tournaments, pricing, token, onClose, onSaved, showSnack }) {
  // minutes_delivered keyed by channel id
  const [minutesMap, setMinutesMap] = useState({})
  const [tournamentMap, setTournamentMap] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setMinutesMap({}); setTournamentMap({}) }
  }, [open])

  // Only show channels that have actually run (have stream_start)
  const loggable = channels.filter(ch => ch.stream_start)

  // Check if a channel already has a CDN record logged for its stream date
  function existingRecord(ch) {
    const date = new Date(ch.stream_start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    return records.find(r => r.channel_id === ch.id && r.date === date) || null
  }

  function streamHours(ch) {
    const start = new Date(ch.stream_start)
    const end   = ch.stream_end ? new Date(ch.stream_end) : new Date()
    return Math.max(0, (end - start) / 3_600_000)
  }

  function streamDate(ch) {
    return new Date(ch.stream_start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  }

  function previewCost(ch) {
    const mins  = Number(minutesMap[ch.id]) || 0
    const hrs   = streamHours(ch)
    const gbPer = pricing?.gb_per_50_min    ?? 4
    const fRate = pricing?.feed_rate_per_hr ?? 15
    const cRate = pricing?.cdn_rate_per_gb  ?? 0.05
    const gb    = (mins / 50) * gbPer
    return {
      feed: hrs  * fRate,
      cdn:  gb   * cRate,
      total: (hrs * fRate) + (gb * cRate),
    }
  }

  async function handleSave() {
    const toLog = loggable.filter(ch => minutesMap[ch.id] !== undefined && minutesMap[ch.id] !== '')
    if (!toLog.length) { showSnack('Enter minutes for at least one feed', 'warning'); return }

    setSaving(true)
    try {
      for (const ch of toLog) {
        const body = {
          date:              streamDate(ch),
          label:             ch.name || ch.id,
          tournament_id:     tournamentMap[ch.id] ? Number(tournamentMap[ch.id]) : null,
          channel_id:        ch.id,
          channel_name:      ch.name || ch.id,
          stream_hours:      parseFloat(streamHours(ch).toFixed(4)),
          minutes_delivered: Number(minutesMap[ch.id]),
        }
        const res = await fetch('/api/cdn-records', {
          method: 'POST', headers: authHeader(token), body: JSON.stringify(body),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(`Failed for ${ch.name}: ${d.error}`)
        }
      }
      showSnack(`Logged ${toLog.length} feed${toLog.length > 1 ? 's' : ''}`)
      onSaved()
      onClose()
    } catch (err) {
      showSnack(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md"
      PaperProps={{ sx: { bgcolor: AP.paper, border: `1px solid ${AP.border}` } }}>
      <DialogTitle sx={{ borderBottom: `1px solid ${AP.border}`, py: 1.5, px: 2, fontSize: '0.95rem', fontWeight: 700 }}>
        Log CDN Usage
      </DialogTitle>
      <DialogContent sx={{ pt: 2, pb: 1 }}>
        <Typography variant="caption" sx={{ color: AP.muted, mb: 2, display: 'block' }}>
          Stream hours are pulled automatically. Enter <strong>Minutes Delivered</strong> from the analytics dashboard for each feed you want to log.
        </Typography>

        {loggable.length === 0 ? (
          <Typography sx={{ color: AP.muted, py: 2, textAlign: 'center' }}>No feeds with stream data found.</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Feed', 'Date', 'Stream Hrs', 'Event', 'Mins Delivered', 'Est. Cost'].map(h => (
                    <TableCell key={h} sx={{ color: AP.muted, fontSize: '0.7rem', fontWeight: 600 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loggable.map(ch => {
                  const hrs     = streamHours(ch)
                  const cost    = previewCost(ch)
                  const hasMins = minutesMap[ch.id] !== undefined && minutesMap[ch.id] !== ''
                  const logged  = existingRecord(ch)
                  return (
                    <TableRow key={ch.id} hover sx={{ opacity: logged ? 0.55 : hasMins ? 1 : 0.75 }}>
                      <TableCell sx={{ fontSize: '0.78rem' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Box>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{ch.name || ch.id}</Typography>
                            <Typography sx={{ fontSize: '0.65rem', color: AP.muted, fontFamily: 'monospace' }}>{ch.id}</Typography>
                          </Box>
                          {logged && (
                            <Chip label="LOGGED" size="small" sx={{
                              fontSize: '0.58rem', height: 16, fontWeight: 700,
                              bgcolor: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)',
                            }} />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{fmtDate(streamDate(ch))}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{hrs.toFixed(2)}h</TableCell>
                      <TableCell>
                        {logged ? (
                          <Typography sx={{ fontSize: '0.75rem', color: AP.muted }}>Already logged</Typography>
                        ) : (
                          <TextField select size="small" value={tournamentMap[ch.id] || ''}
                            onChange={e => setTournamentMap(m => ({ ...m, [ch.id]: e.target.value }))}
                            sx={{ minWidth: 140, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 28 } }}>
                            <MenuItem value="">— None —</MenuItem>
                            {tournaments.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                          </TextField>
                        )}
                      </TableCell>
                      <TableCell>
                        {logged ? (
                          <Typography sx={{ fontSize: '0.75rem', color: AP.muted }}>{Number(logged.minutes_delivered).toLocaleString()} min</Typography>
                        ) : (
                          <TextField type="number" size="small" placeholder="e.g. 2029"
                            value={minutesMap[ch.id] ?? ''}
                            onChange={e => setMinutesMap(m => ({ ...m, [ch.id]: e.target.value }))}
                            inputProps={{ min: 0, step: 1 }}
                            sx={{ width: 110, '& .MuiInputBase-root': { fontSize: '0.8rem', height: 32 } }} />
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700, color: logged ? '#10b981' : hasMins ? AP.accent : AP.muted }}>
                        {logged ? `$${logged.cost_total?.toFixed(2)}` : hasMins ? `$${cost.total.toFixed(2)}` : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2 }}>
        <Button onClick={onClose} size="small" sx={{ color: AP.muted }}>Cancel</Button>
        <Button variant="contained" size="small" startIcon={<SaveIcon />}
          onClick={handleSave} disabled={saving || loggable.length === 0}
          sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}>
          {saving ? 'Saving…' : 'Log Feeds'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── CdnRecordsPanel ──────────────────────────────────────────────────────────
// Super-Admin-only, global CDN usage/cost record management. Fetches its own
// data (records, tournaments, channels, pricing) — takes just a `token` prop,
// matching the panel convention used in Admin.jsx (e.g. TenantSettingsPanel).

export function CdnRecordsPanel({ token }) {
  const [records, setRecords]         = useState([])
  const [tournaments, setTournaments] = useState([])
  const [pricing, setPricing]         = useState(null)
  const [channels, setChannels]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [snack, setSnack]             = useState({ open: false, message: '', severity: 'success' })

  const [dialog, setDialog]           = useState({ open: false, initial: null })
  const [jwDialog, setJwDialog]       = useState(false)
  const [monthFilter, setMonthFilter] = useState('all')
  const [deleting, setDeleting]       = useState(null)

  const showSnack = (message, severity = 'success') => setSnack({ open: true, message, severity })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, tRes, pRes, chRes] = await Promise.all([
        fetch('/api/cdn-records', { headers: authHeader(token) }),
        fetch('/api/tournaments'),
        fetch('/api/pricing', { headers: authHeader(token) }),
        fetch('/api/channels', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (rRes.ok)  setRecords(await rRes.json())
      if (tRes.ok)  setTournaments(await tRes.json())
      if (pRes.ok)  setPricing(await pRes.json())
      if (chRes.ok) { const d = await chRes.json(); setChannels(d.channels || []) }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Build month options from existing records
  const months = [...new Set(records.map(r => monthKey(r.date)).filter(Boolean))].sort().reverse()

  const filtered = monthFilter === 'all'
    ? records
    : records.filter(r => monthKey(r.date) === monthFilter)

  async function handleSave(form) {
    const isEdit = !!form.id
    const url    = '/api/cdn-records'
    const method = isEdit ? 'PUT' : 'POST'
    const body   = {
      ...form,
      tournament_id: form.tournament_id !== '' ? Number(form.tournament_id) : null,
    }
    const res = await fetch(url, { method, headers: authHeader(token), body: JSON.stringify(body) })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || 'Save failed')
    }
    showSnack(isEdit ? 'Record updated' : 'Record added')
    fetchAll()
  }

  async function handleDelete(id) {
    setDeleting(id)
    try {
      const res = await fetch('/api/cdn-records', {
        method: 'DELETE',
        headers: authHeader(token),
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Delete failed')
      showSnack('Record deleted', 'info')
      fetchAll()
    } catch (err) {
      showSnack(err.message, 'error')
    } finally {
      setDeleting(null)
    }
  }

  const subtotal     = filtered.reduce((s, r) => s + (r.cost_total  || 0), 0)
  const subtotalFeed = filtered.reduce((s, r) => s + (r.cost_feed   || 0), 0)
  const subtotalCdn  = filtered.reduce((s, r) => s + (r.cost_cdn    || 0), 0)

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress size={28} sx={{ color: AP.accent }} />
    </Box>
  )

  return (
    <>
      <Paper elevation={0} sx={{ border: `1px solid ${AP.border}`, borderRadius: 2, overflow: 'hidden' }}>
        <SectionHeader
          icon={<CloudIcon />}
          title="CDN RECORDS"
          action={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                select size="small" value={monthFilter}
                onChange={e => setMonthFilter(e.target.value)}
                sx={{ minWidth: 160, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 30 } }}
              >
                <MenuItem value="all">All months</MenuItem>
                {months.map(mk => (
                  <MenuItem key={mk} value={mk}>{monthLabel(mk)}</MenuItem>
                ))}
              </TextField>
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={fetchAll} sx={{ color: AP.muted }}>
                  <RefreshIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Button
                size="small" variant="contained"
                onClick={() => setJwDialog(true)}
                sx={{ fontSize: '0.72rem', bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}
              >
                Log CDN Usage
              </Button>
              <Button
                size="small" variant="outlined" startIcon={<AddIcon />}
                onClick={() => setDialog({ open: true, initial: null })}
                sx={{ fontSize: '0.72rem', borderColor: AP.accentBdr, color: AP.accent, '&:hover': { borderColor: AP.accent } }}
              >
                Manual Entry
              </Button>
            </Box>
          }
        />

        {filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" sx={{ color: AP.muted }}>No records for this period.</Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Date', 'Label', 'Channel', 'Stream Hrs', 'Mins Del.', 'GB Del.', 'Feed Fee', 'CDN Cost', 'Total', ''].map(h => (
                    <TableCell key={h} sx={{ color: AP.muted, fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{r.label}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{r.channel_name}</Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: AP.muted, fontFamily: 'monospace' }}>{r.channel_id}</Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{r.stream_hours}h</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{Number(r.minutes_delivered).toLocaleString()}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{fmtGB(r.gb_delivered)}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{fmtUSD(r.cost_feed)}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{fmtUSD(r.cost_cdn)}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700, color: AP.accent }}>{fmtUSD(r.cost_total)}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => setDialog({ open: true, initial: r })} sx={{ color: AP.muted, '&:hover': { color: AP.accent } }}>
                            <EditIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" disabled={deleting === r.id}
                            onClick={() => handleDelete(r.id)}
                            sx={{ color: AP.muted, '&:hover': { color: AP.danger } }}>
                            {deleting === r.id
                              ? <CircularProgress size={13} />
                              : <DeleteIcon sx={{ fontSize: 15 }} />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Subtotal row */}
                <TableRow sx={{ bgcolor: AP.accentDim }}>
                  <TableCell colSpan={7} sx={{ fontSize: '0.75rem', fontWeight: 700, color: AP.muted }}>
                    {monthFilter === 'all' ? 'Grand Total' : `${monthLabel(monthFilter)} Total`}
                    {' '}({filtered.length} records)
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', color: AP.muted }}>{fmtUSD(subtotalFeed)}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', color: AP.muted }}>{fmtUSD(subtotalCdn)}</TableCell>
                  <TableCell colSpan={2} sx={{ fontSize: '0.85rem', fontWeight: 800, color: AP.accent }}>
                    {fmtUSD(subtotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      <CdnRecordDialog
        open={dialog.open}
        initial={dialog.initial}
        tournaments={tournaments}
        pricing={pricing}
        onClose={() => setDialog({ open: false, initial: null })}
        onSave={handleSave}
      />

      <LogFromJwDialog
        open={jwDialog}
        channels={channels}
        records={records}
        tournaments={tournaments}
        pricing={pricing}
        token={token}
        onClose={() => setJwDialog(false)}
        onSaved={fetchAll}
        showSnack={showSnack}
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack(s => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  )
}

// ─── PricingPanel ─────────────────────────────────────────────────────────────
// Super-Admin-only, global CDN/feed pricing rate management (global rates +
// per-channel overrides). Fetches its own pricing config — takes just a
// `token` prop, matching the panel convention used in Admin.jsx.

export function PricingPanel({ token }) {
  const [pricing, setPricing]         = useState(null)
  const [loading, setLoading]         = useState(true)
  const [snack, setSnack]             = useState({ open: false, message: '', severity: 'success' })
  const [rates, setRates]             = useState({ feed_rate_per_hr: '', cdn_rate_per_gb: '', gb_per_50_min: '' })
  const [overrides, setOverrides]     = useState({})
  const [savingRates, setSavingRates] = useState(false)
  const [newOverride, setNewOverride] = useState({ channel_id: '', name: '', feed_rate_per_hr: '', cdn_rate_per_gb: '' })

  const showSnack = (message, severity = 'success') => setSnack({ open: true, message, severity })

  const fetchPricing = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pricing', { headers: authHeader(token) })
      if (res.ok) setPricing(await res.json())
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchPricing() }, [fetchPricing])

  useEffect(() => {
    if (pricing) {
      setRates({
        feed_rate_per_hr: pricing.feed_rate_per_hr ?? '',
        cdn_rate_per_gb:  pricing.cdn_rate_per_gb  ?? '',
        gb_per_50_min:    pricing.gb_per_50_min    ?? '',
      })
      setOverrides(pricing.channel_overrides || {})
    }
  }, [pricing])

  // Live effective rate preview
  const hrs    = Number(rates.feed_rate_per_hr) || 0
  const cdn    = Number(rates.cdn_rate_per_gb)  || 0
  const gbRate = Number(rates.gb_per_50_min)    || 0
  const gbPerHr      = (60 / 50) * gbRate
  const cdnPerHr     = gbPerHr * cdn
  const totalPerHr   = hrs + cdnPerHr

  async function saveRates() {
    setSavingRates(true)
    try {
      const res = await fetch('/api/pricing', {
        method: 'PUT',
        headers: authHeader(token),
        body: JSON.stringify({
          feed_rate_per_hr: Number(rates.feed_rate_per_hr),
          cdn_rate_per_gb:  Number(rates.cdn_rate_per_gb),
          gb_per_50_min:    Number(rates.gb_per_50_min),
          channel_overrides: overrides,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      showSnack('Pricing saved')
      fetchPricing()
    } catch (err) {
      showSnack(err.message, 'error')
    } finally {
      setSavingRates(false)
    }
  }

  function addOverride() {
    if (!newOverride.channel_id) return
    const entry = {}
    if (newOverride.name)             entry.name             = newOverride.name
    if (newOverride.feed_rate_per_hr) entry.feed_rate_per_hr = Number(newOverride.feed_rate_per_hr)
    if (newOverride.cdn_rate_per_gb)  entry.cdn_rate_per_gb  = Number(newOverride.cdn_rate_per_gb)
    setOverrides(o => ({ ...o, [newOverride.channel_id]: entry }))
    setNewOverride({ channel_id: '', name: '', feed_rate_per_hr: '', cdn_rate_per_gb: '' })
  }

  function removeOverride(cid) {
    setOverrides(o => { const n = { ...o }; delete n[cid]; return n })
  }

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress size={28} sx={{ color: AP.accent }} />
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* Global rates */}
      <Paper elevation={0} sx={{ border: `1px solid ${AP.border}`, borderRadius: 2, overflow: 'hidden' }}>
        <SectionHeader icon={<AttachMoneyIcon />} title="GLOBAL RATES" />
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="Feed Rate" type="number" value={rates.feed_rate_per_hr}
              onChange={e => setRates(r => ({ ...r, feed_rate_per_hr: e.target.value }))}
              size="small" inputProps={{ step: '0.01', min: 0 }}
              InputProps={{ startAdornment: <Typography sx={{ color: AP.muted, mr: 0.5, fontSize: '0.85rem' }}>$</Typography> }}
              helperText="per hour per feed" sx={{ flex: 1 }} />
            <TextField label="CDN Rate" type="number" value={rates.cdn_rate_per_gb}
              onChange={e => setRates(r => ({ ...r, cdn_rate_per_gb: e.target.value }))}
              size="small" inputProps={{ step: '0.001', min: 0 }}
              InputProps={{ startAdornment: <Typography sx={{ color: AP.muted, mr: 0.5, fontSize: '0.85rem' }}>$</Typography> }}
              helperText="per GB delivered" sx={{ flex: 1 }} />
            <TextField label="Data Rate" type="number" value={rates.gb_per_50_min}
              onChange={e => setRates(r => ({ ...r, gb_per_50_min: e.target.value }))}
              size="small" inputProps={{ step: '0.1', min: 0 }}
              helperText="GB per 50 min" sx={{ flex: 1 }} />
          </Box>

          {/* Effective rate preview */}
          {totalPerHr > 0 && (
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: AP.accentDim, border: `1px solid ${AP.accentBdr}`, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.62rem', textTransform: 'uppercase' }}>GB/hr per feed</Typography>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>{gbPerHr.toFixed(2)} GB</Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.62rem', textTransform: 'uppercase' }}>Feed fee/hr</Typography>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>${hrs.toFixed(2)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.62rem', textTransform: 'uppercase' }}>CDN cost/hr</Typography>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>${cdnPerHr.toFixed(2)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: AP.muted, fontSize: '0.62rem', textTransform: 'uppercase' }}>Effective $/hr</Typography>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: AP.accent }}>${totalPerHr.toFixed(2)}</Typography>
              </Box>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" size="small" startIcon={<SaveIcon />}
              onClick={saveRates} disabled={savingRates}
              sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}>
              {savingRates ? 'Saving…' : 'Save Rates'}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Per-channel overrides */}
      <Paper elevation={0} sx={{ border: `1px solid ${AP.border}`, borderRadius: 2, overflow: 'hidden' }}>
        <SectionHeader icon={<TuneIcon />} title="PER-CHANNEL OVERRIDES" />
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="caption" sx={{ color: AP.muted }}>
            Override global rates for specific channel IDs. Leave a field blank to inherit the global value.
          </Typography>

          {Object.keys(overrides).length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Channel ID', 'Name', 'Feed Rate/hr', 'CDN Rate/GB', ''].map(h => (
                      <TableCell key={h} sx={{ color: AP.muted, fontSize: '0.7rem', fontWeight: 600 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(overrides).map(([cid, ov]) => (
                    <TableRow key={cid} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{cid}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{ov.name || '—'}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{ov.feed_rate_per_hr != null ? `$${ov.feed_rate_per_hr}/hr` : '(global)'}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{ov.cdn_rate_per_gb  != null ? `$${ov.cdn_rate_per_gb}/GB`  : '(global)'}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => removeOverride(cid)} sx={{ color: AP.muted, '&:hover': { color: AP.danger } }}>
                          <DeleteIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          {/* Add override row */}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <TextField label="Channel ID" value={newOverride.channel_id}
              onChange={e => setNewOverride(o => ({ ...o, channel_id: e.target.value }))}
              size="small" sx={{ width: 130 }} placeholder="die1qpMr" />
            <TextField label="Name" value={newOverride.name}
              onChange={e => setNewOverride(o => ({ ...o, name: e.target.value }))}
              size="small" sx={{ width: 130 }} placeholder="Main Deck" />
            <TextField label="Feed $/hr" type="number" value={newOverride.feed_rate_per_hr}
              onChange={e => setNewOverride(o => ({ ...o, feed_rate_per_hr: e.target.value }))}
              size="small" sx={{ width: 110 }} inputProps={{ step: '0.01' }} />
            <TextField label="CDN $/GB" type="number" value={newOverride.cdn_rate_per_gb}
              onChange={e => setNewOverride(o => ({ ...o, cdn_rate_per_gb: e.target.value }))}
              size="small" sx={{ width: 110 }} inputProps={{ step: '0.001' }} />
            <Button
              variant="outlined" size="small" startIcon={<AddIcon />}
              onClick={addOverride} disabled={!newOverride.channel_id}
              sx={{ borderColor: AP.accentBdr, color: AP.accent, '&:hover': { borderColor: AP.accent } }}
            >
              Add
            </Button>
          </Box>

          {Object.keys(overrides).length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained" size="small" startIcon={<SaveIcon />}
                onClick={saveRates} disabled={savingRates}
                sx={{ bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov } }}
              >
                {savingRates ? 'Saving…' : 'Save Overrides'}
              </Button>
            </Box>
          )}
        </Box>
      </Paper>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack(s => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
