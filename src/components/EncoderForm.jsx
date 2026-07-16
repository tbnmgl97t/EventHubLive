import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box, Typography, TextField, Button, CircularProgress, Alert, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Switch, Checkbox,
  Autocomplete, useTheme, useMediaQuery,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import RefreshIcon from '@mui/icons-material/Refresh'

const AP = {
  accent:    '#6366f1',
  accentHov: '#4f46e5',
  accentDim: 'rgba(99,102,241,0.08)',
  accentBdr: 'rgba(99,102,241,0.3)',
  live:      '#10b981',
  warn:      '#f59e0b',
  warnDim:   'rgba(245,158,11,0.12)',
  muted:     '#94a3b8',
}

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

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

const EMPTY_FORM = {
  name: '', description: '',
  channel_id: '', channel_name: '',
  ingest_format: 'rtmp', region: 'us-east-1',
  ingest_url: '', stream_key: '',
  simulcast_website: true, simulcast_youtube: false, simulcast_facebook: false, simulcast_app: false,
  vod_recording: true, youtube_broadcast_id: '',
  youtube_ingest_url: '', youtube_stream_key: '',
  brightspot_page_id: '', brightspot_page_name: '',
  brightspot_video_page_id: '', brightspot_video_page_name: '',
}

function ToggleRow({ label, hint, checked, onChange, color = AP.accent, disabled }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5,
      border: `1px solid ${checked ? `${color}55` : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 1.5, p: 1.5, bgcolor: checked ? `${color}14` : 'rgba(255,255,255,0.02)',
      opacity: disabled ? 0.45 : 1,
    }}>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: checked ? '#fff' : AP.muted, lineHeight: 1.2 }}>
          {label}
        </Typography>
        {hint && <Typography sx={{ fontSize: '0.68rem', color: AP.muted, mt: 0.25 }}>{hint}</Typography>}
      </Box>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        size="small"
        sx={{
          '& .MuiSwitch-switchBase.Mui-checked': { color },
          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: color },
        }}
      />
    </Box>
  )
}

// ── BrightSpot page picker ──
// Search dropdown backed by /api/brightspot-search-pages, with a manual
// id/name fallback since BrightSpot search isn't available yet (see that
// endpoint's comments) — flipping "Search instead" back on once it works
// needs no further frontend changes.
function BrightSpotPagePicker({ label, kind, idValue, nameValue, onSelect, token, tenantId }) {
  const [manualMode, setManualMode] = useState(!!idValue)
  const [query, setQuery]     = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (manualMode) return
    clearTimeout(debounceRef.current)
    if (!query.trim()) { setOptions([]); return }
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      fetch(`/api/brightspot-search-pages?q=${encodeURIComponent(query.trim())}&kind=${kind}`, { headers: authHeader(token, tenantId) })
        .then(r => r.json())
        .then(data => {
          setUnavailable(data.available === false)
          setOptions(data.pages || [])
        })
        .catch(() => { setOptions([]); setUnavailable(true) })
        .finally(() => setLoading(false))
    }, 350)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, manualMode])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: '#cbd5e1' }}>
          {label.toUpperCase()}
        </Typography>
        <Button size="small" onClick={() => setManualMode(m => !m)}
          sx={{ fontSize: '0.68rem', color: AP.accent, textTransform: 'none', p: 0, minWidth: 0 }}>
          {manualMode ? 'Search instead' : 'Enter manually'}
        </Button>
      </Box>
      {manualMode ? (
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
          <TextField
            size="small" label={`${label} ID`} fullWidth
            value={idValue} onChange={e => onSelect(e.target.value, nameValue)}
            placeholder="BrightSpot content ID"
          />
          <TextField
            size="small" label={`${label} Name`} fullWidth
            value={nameValue || ''} onChange={e => onSelect(idValue, e.target.value)}
            placeholder="Display name"
          />
        </Box>
      ) : (
        <Autocomplete
          size="small" fullWidth
          options={options}
          loading={loading}
          filterOptions={x => x}
          getOptionLabel={opt => (typeof opt === 'string' ? opt : (opt.name || opt.id || ''))}
          isOptionEqualToValue={(opt, val) => opt.id === val?.id}
          value={idValue ? { id: idValue, name: nameValue || idValue } : null}
          onInputChange={(e, val) => setQuery(val)}
          onChange={(e, val) => onSelect(val?.id || '', val?.name || '')}
          noOptionsText={unavailable ? 'BrightSpot search not available yet' : (query ? 'No matches' : 'Type to search…')}
          renderInput={params => (
            <TextField {...params} placeholder={`Search ${label.toLowerCase()}…`}
              helperText={unavailable ? 'Search unavailable — use "Enter manually" for now' : undefined}
            />
          )}
        />
      )}
    </Box>
  )
}

export default function EncoderForm({ token, tenantId, mode }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = mode === 'edit'
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))

  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [confirmChange, setConfirmChange] = useState(false)

  const [youtubeConnected, setYoutubeConnected]   = useState(false)
  const [facebookConnected, setFacebookConnected] = useState(false)
  const [brightspotConfigured, setBrightspotConfigured] = useState(false)
  const [brightspotStatusLoaded, setBrightspotStatusLoaded] = useState(false)
  const [orphanedPagesDismissed, setOrphanedPagesDismissed] = useState(false)

  const [channels, setChannels] = useState([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [manualChannel, setManualChannel] = useState(null) // null = auto-detect; true/false = explicit user override
  const [ingestLookupLoading, setIngestLookupLoading] = useState(false)
  const [ingestLookupError, setIngestLookupError] = useState('')

  const [autoCreateYoutube, setAutoCreateYoutube] = useState(false)
  const [youtubeBroadcastTitle, setYoutubeBroadcastTitle] = useState('')
  const [creatingBroadcast, setCreatingBroadcast] = useState(false)

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  // Fetches the stream's live ingest credentials from JW directly — the bulk
  // /api/channels list only carries whatever ingest snapshot it happened to
  // have on hand, so re-fetch fresh details for the one channel just picked.
  function lookupIngestDetails(channelId) {
    if (!channelId) return
    setIngestLookupLoading(true)
    setIngestLookupError('')
    fetch(`/api/stream-ingest?id=${encodeURIComponent(channelId)}`, { headers: authHeader(token, tenantId) })
      .then(async r => {
        const data = await r.json().catch(() => null)
        if (!r.ok) throw new Error(data?.error || `Failed to look up ingest details (${r.status})`)
        return data
      })
      .then(data => {
        if (!data?.ingest_url && !data?.ingest_key) {
          setIngestLookupError('JW returned no ingest details for this channel — enter them manually below.')
          return
        }
        // Pull formats (hls_pull, srt_pull) have no stream key at all — JW pulls
        // from a source URL rather than accepting a pushed key — so a resolved
        // pull format should clear any stale key rather than leave it sitting there.
        const isPullFormat = data.ingest_format?.endsWith('_pull')
        setForm(prev => {
          if (prev.channel_id !== channelId) return prev // user picked a different channel while this was in flight
          return {
            ...prev,
            ingest_url:    data.ingest_url    || prev.ingest_url,
            stream_key:    data.ingest_key || (isPullFormat ? '' : prev.stream_key),
            ingest_format: data.ingest_format || prev.ingest_format,
          }
        })
      })
      .catch(err => setIngestLookupError(err.message))
      .finally(() => setIngestLookupLoading(false))
  }

  // Fires whenever the assigned channel actually changes (including the
  // initial load in edit mode) — but reselecting the *same* channel from the
  // dropdown doesn't change this value, so the refresh button below covers that.
  useEffect(() => {
    if (form.channel_id) lookupIngestDetails(form.channel_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.channel_id])

  const fetchEncoder = useCallback(() => {
    if (!isEdit || !id) return
    setLoading(true)
    fetch(`/api/encoders?id=${encodeURIComponent(id)}`, { headers: authHeader(token, tenantId) })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load encoder')
        return data
      })
      .then(data => setForm({ ...EMPTY_FORM, ...data }))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [isEdit, id, token, tenantId])

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
    // Same "configured" check the Settings > Integrations panel uses —
    // only show BrightSpot page assignment once the tenant has it set up.
    fetch('/api/tenant', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : null)
      .then(data => setBrightspotConfigured(!!data?.brightspot_cms_url))
      .catch(() => setBrightspotConfigured(false))
      .finally(() => setBrightspotStatusLoaded(true))
  }, [token, tenantId])

  useEffect(() => {
    if (!token) return
    setChannelsLoading(true)
    fetch('/api/channels', { headers: authHeader(token, tenantId) })
      .then(r => r.ok ? r.json() : { channels: [] })
      .then(data => setChannels((data.channels || []).filter(c => c.stream_type === '24/7')))
      .catch(() => setChannels([]))
      .finally(() => setChannelsLoading(false))
  }, [token, tenantId])

  function handleClose() {
    navigate('/admin/encoders')
  }

  async function handleSave() {
    if (!form.name.trim() || !form.channel_id.trim()) return
    if (isEdit && !confirmChange) return

    setSaving(true)
    setError('')
    try {
      let ytBroadcastId  = channelYoutubeBroadcastId || form.youtube_broadcast_id?.trim() || null
      let ytIngestUrl    = form.youtube_ingest_url || null
      let ytStreamKey    = form.youtube_stream_key || null

      if (form.simulcast_youtube && youtubeConnected && autoCreateYoutube && !ytBroadcastId) {
        setCreatingBroadcast(true)
        try {
          const ytRes = await fetch('/api/youtube-create-broadcast', {
            method: 'POST',
            headers: authHeader(token, tenantId),
            body: JSON.stringify({
              title: youtubeBroadcastTitle.trim() || form.name.trim(),
              description: form.description?.trim() || '',
              channel_id: form.channel_id.trim(),
            }),
          })
          const ytData = await ytRes.json()
          if (!ytRes.ok) throw new Error(ytData.error || 'Failed to create YouTube broadcast')
          ytBroadcastId = ytData.broadcast_id
          ytIngestUrl   = ytData.ingest_url
          ytStreamKey   = ytData.stream_key
          setForm(prev => ({ ...prev, youtube_broadcast_id: ytBroadcastId, youtube_ingest_url: ytIngestUrl, youtube_stream_key: ytStreamKey }))
        } finally {
          setCreatingBroadcast(false)
        }
      }

      const body = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        channel_id: form.channel_id.trim(),
        channel_name: form.channel_name?.trim() || null,
        ingest_format: form.ingest_format,
        region: form.region,
        ingest_url: form.ingest_url?.trim() || null,
        stream_key: form.stream_key?.trim() || null,
        simulcast_website: form.simulcast_website,
        simulcast_youtube: form.simulcast_youtube && youtubeConnected,
        simulcast_facebook: form.simulcast_facebook && facebookConnected,
        simulcast_app: form.simulcast_app,
        vod_recording: form.vod_recording,
        youtube_broadcast_id: ytBroadcastId,
        youtube_ingest_url: ytIngestUrl,
        youtube_stream_key: ytStreamKey,
        brightspot_page_id: form.brightspot_page_id?.trim() || null,
        brightspot_page_name: form.brightspot_page_name?.trim() || null,
        brightspot_video_page_id: form.brightspot_video_page_id?.trim() || null,
        brightspot_video_page_name: form.brightspot_video_page_name?.trim() || null,
      }
      const res = await fetch('/api/encoders', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify(isEdit ? { id, ...body } : body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save encoder')
      navigate('/admin/encoders')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const isValid = form.name.trim() && form.channel_id.trim() && (!isEdit || confirmChange)
  const channelKnown = channels.some(c => c.id === form.channel_id)
  // If the assigned channel already has its own persistent YouTube broadcast
  // (created when the channel/stream itself was set up with simulcast on),
  // the encoder should just reuse that broadcast's ID for privacy toggling
  // rather than creating or asking for a separate one.
  const channelYoutubeBroadcastId = channels.find(c => c.id === form.channel_id)?.youtube_broadcast_id || null
  // An explicit click on the toggle button always wins; otherwise auto-detect
  // manual mode when the assigned channel isn't in JW's known channel list.
  const manualChannelMode = manualChannel !== null
    ? manualChannel
    : (!channelsLoading && !!form.channel_id && !channelKnown)

  // Encoder still has BrightSpot page ids from before the integration was
  // disconnected — surface it rather than silently clearing (see
  // getEncoderBrightspotPages in api/_utils/brightspot.js for the matching
  // guard on the orchestration side, which never uses these unless
  // BrightSpot is actually configured right now).
  const hasOrphanedPages = brightspotStatusLoaded && !brightspotConfigured && !orphanedPagesDismissed &&
    !!(form.brightspot_page_id || form.brightspot_video_page_id)

  function clearBrightspotPages() {
    setForm(prev => ({
      ...prev,
      brightspot_page_id: '', brightspot_page_name: '',
      brightspot_video_page_id: '', brightspot_video_page_name: '',
    }))
    setOrphanedPagesDismissed(true)
  }

  return (
    <Dialog open onClose={handleClose} fullWidth maxWidth="sm" fullScreen={fullScreen}
      PaperProps={{ sx: { bgcolor: '#161b2e', border: { xs: 'none', sm: '1px solid rgba(255,255,255,0.08)' } } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem' }}>
        {isEdit ? 'Edit Encoder' : 'Add Encoder'}
        <IconButton size="small" onClick={handleClose} sx={{ color: AP.muted }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, pt: 1 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} sx={{ color: AP.accent }} />
          </Box>
        ) : (
          <>
            {error && <Alert severity="error" sx={{ fontSize: '0.78rem' }}>{error}</Alert>}

            {isEdit && (
              <Box sx={{
                display: 'flex', alignItems: 'flex-start', gap: 1.25,
                border: `1px solid ${AP.warn}55`, borderRadius: 1.5, bgcolor: AP.warnDim, p: 1.5,
              }}>
                <WarningAmberIcon sx={{ color: AP.warn, fontSize: 18, mt: '2px', flexShrink: 0 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#fde68a', lineHeight: 1.4 }}>
                    Changing the channel assignment or ingest settings will affect your hardware encoder configuration. Confirm this change?
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                    <Checkbox
                      size="small"
                      checked={confirmChange}
                      onChange={e => setConfirmChange(e.target.checked)}
                      sx={{ color: AP.warn, p: 0.5, '&.Mui-checked': { color: AP.warn } }}
                    />
                    <Typography sx={{ fontSize: '0.75rem', color: '#fde68a' }}>Yes, I understand and want to proceed</Typography>
                  </Box>
                </Box>
              </Box>
            )}

            <TextField
              size="small" label="Name" required fullWidth autoFocus
              value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Newsroom Encoder 1"
              sx={{ mt: 1.5 }}
            />
            <TextField
              size="small" label="Description" fullWidth multiline minRows={2}
              value={form.description || ''} onChange={e => set('description', e.target.value)}
              placeholder="Optional notes about this encoder's location or purpose"
            />

            {hasOrphanedPages && (
              <Alert
                severity="warning" sx={{ fontSize: '0.78rem' }}
                onClose={() => setOrphanedPagesDismissed(true)}
                action={
                  <Button size="small" onClick={clearBrightspotPages} sx={{ fontSize: '0.7rem' }}>
                    Clear
                  </Button>
                }
              >
                BrightSpot integration is disabled — this encoder's assigned pages won't be used until it's reconnected.
              </Alert>
            )}

            {brightspotConfigured && (
              <Box sx={{
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 1.5, p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', mt: 0.5,
                display: 'flex', flexDirection: 'column', gap: 1.5,
              }}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: '#cbd5e1' }}>
                  BRIGHTSPOT PAGES
                </Typography>
                <BrightSpotPagePicker
                  label="Encoder Page" kind="page"
                  idValue={form.brightspot_page_id} nameValue={form.brightspot_page_name}
                  onSelect={(id, name) => setForm(prev => ({ ...prev, brightspot_page_id: id, brightspot_page_name: name }))}
                  token={token} tenantId={tenantId}
                />
                <BrightSpotPagePicker
                  label="Encoder Video Page" kind="video"
                  idValue={form.brightspot_video_page_id} nameValue={form.brightspot_video_page_name}
                  onSelect={(id, name) => setForm(prev => ({ ...prev, brightspot_video_page_id: id, brightspot_video_page_name: name }))}
                  token={token} tenantId={tenantId}
                />
              </Box>
            )}

            <Box sx={{
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 1.5, p: 1.5, bgcolor: 'rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column', gap: 1.5,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: '#cbd5e1' }}>
                  ASSIGNED 24/7 CHANNEL
                </Typography>
                <Button
                  size="small" onClick={() => setManualChannel(!manualChannelMode)}
                  sx={{ fontSize: '0.68rem', color: AP.accent, textTransform: 'none', p: 0, minWidth: 0 }}
                >
                  {manualChannelMode ? 'Select from list instead' : 'Enter channel ID manually'}
                </Button>
              </Box>
              {manualChannelMode ? (
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
                  <TextField
                    size="small" label="Channel ID" required fullWidth
                    value={form.channel_id} onChange={e => set('channel_id', e.target.value)}
                    placeholder="JW channel/stream ID"
                  />
                  <TextField
                    size="small" label="Channel Name" fullWidth
                    value={form.channel_name || ''} onChange={e => set('channel_name', e.target.value)}
                    placeholder="Display name"
                  />
                </Box>
              ) : (
                <TextField
                  select size="small" label="Channel" required fullWidth
                  value={channels.some(c => c.id === form.channel_id) ? form.channel_id : ''}
                  onChange={e => {
                    const ch = channels.find(c => c.id === e.target.value)
                    setForm(prev => ({
                      ...prev,
                      channel_id: e.target.value,
                      channel_name: ch?.name || '',
                      ingest_url: ch?.ingest_url || prev.ingest_url,
                      stream_key: ch?.ingest_key || prev.stream_key,
                    }))
                  }}
                  disabled={channelsLoading}
                  helperText={channelsLoading ? 'Loading 24/7 channels…' : (channels.length === 0 ? 'No 24/7 channels found — enter one manually' : undefined)}
                >
                  {channels.map(c => (
                    <MenuItem key={c.id} value={c.id}>{c.name || c.id} ({c.id.slice(0, 8)}…)</MenuItem>
                  ))}
                </TextField>
              )}
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
                <TextField
                  select size="small" label="Ingest Format" fullWidth
                  value={form.ingest_format} onChange={e => set('ingest_format', e.target.value)}
                >
                  {INGEST_FORMATS.map(f => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                </TextField>
                <TextField
                  select size="small" label="Region" fullWidth
                  value={form.region} onChange={e => set('region', e.target.value)}
                >
                  {REGIONS.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                </TextField>
              </Box>
            </Box>

            <Box sx={{
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 1.5, p: 1.5, bgcolor: 'rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column', gap: 1.5,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: '#cbd5e1' }}>
                  HARDWARE ENCODER CONFIG
                </Typography>
                <Button
                  size="small" onClick={() => lookupIngestDetails(form.channel_id)}
                  disabled={!form.channel_id || ingestLookupLoading}
                  startIcon={ingestLookupLoading ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: '0.68rem', color: AP.accent, textTransform: 'none', p: 0, minWidth: 0 }}
                >
                  Refresh from channel
                </Button>
              </Box>
              {ingestLookupError && (
                <Alert severity="warning" sx={{ fontSize: '0.75rem' }} onClose={() => setIngestLookupError('')}>
                  {ingestLookupError}
                </Alert>
              )}
              <TextField
                size="small" label="JW Ingest URL" fullWidth
                value={form.ingest_url || ''} onChange={e => set('ingest_url', e.target.value)}
                placeholder="The URL your operator enters into the hardware encoder"
                helperText={ingestLookupLoading ? 'Looking up ingest details…' : undefined}
              />
              <TextField
                size="small" label="JW Stream Key" fullWidth
                value={form.stream_key || ''} onChange={e => set('stream_key', e.target.value)}
              />
              {(form.youtube_ingest_url || form.youtube_stream_key) && (
                <>
                  <TextField
                    size="small" label="YouTube Ingest URL" fullWidth disabled
                    value={form.youtube_ingest_url || ''}
                    helperText="Enter this as a second output on your hardware encoder to simulcast to YouTube"
                  />
                  <TextField
                    size="small" label="YouTube Stream Key" fullWidth disabled
                    value={form.youtube_stream_key || ''}
                  />
                </>
              )}
            </Box>

            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: '#cbd5e1', mt: 0.5 }}>
              SIMULCAST DESTINATIONS
            </Typography>
            <ToggleRow label="Website" checked={form.simulcast_website} onChange={v => set('simulcast_website', v)} color={AP.live} />
            <ToggleRow
              label="YouTube"
              hint={youtubeConnected ? undefined : 'Connect your YouTube account in Settings to enable'}
              checked={form.simulcast_youtube && youtubeConnected}
              onChange={v => set('simulcast_youtube', v)}
              color="#ff0000"
              disabled={!youtubeConnected}
            />
            {form.simulcast_youtube && youtubeConnected && !channelYoutubeBroadcastId && !form.youtube_broadcast_id && (
              <ToggleRow
                label="Auto-create YouTube Broadcast"
                hint="Creates a persistent, always-on YouTube Live broadcast (starts private) and binds an ingest stream to it"
                checked={autoCreateYoutube}
                onChange={setAutoCreateYoutube}
                color="#ff0000"
              />
            )}
            {form.simulcast_youtube && youtubeConnected && !channelYoutubeBroadcastId && !form.youtube_broadcast_id && autoCreateYoutube && (
              <TextField
                size="small" label="YouTube Broadcast Title" fullWidth
                value={youtubeBroadcastTitle} onChange={e => setYoutubeBroadcastTitle(e.target.value)}
                placeholder={form.name.trim() || 'Defaults to encoder name'}
                helperText="The broadcast is created and bound when you save."
              />
            )}
            {form.simulcast_youtube && youtubeConnected && !channelYoutubeBroadcastId && !form.youtube_broadcast_id && !autoCreateYoutube && (
              <TextField
                size="small" label="YouTube Broadcast ID" fullWidth
                value={form.youtube_broadcast_id || ''} onChange={e => set('youtube_broadcast_id', e.target.value)}
                placeholder="Persistent liveBroadcast ID bound to this encoder's channel"
                helperText="Or auto-create above, or paste an existing persistent broadcast ID from YouTube Studio."
              />
            )}
            {(channelYoutubeBroadcastId || form.youtube_broadcast_id) && (
              <Box sx={{
                display: 'flex', flexDirection: 'column', gap: 0.5,
                border: '1px solid rgba(255,0,0,0.3)', borderRadius: 1.5, bgcolor: 'rgba(255,0,0,0.08)', p: 1.5,
              }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff' }}>YouTube Broadcast</Typography>
                <Typography
                  component="a" href={`https://www.youtube.com/watch?v=${channelYoutubeBroadcastId || form.youtube_broadcast_id}`}
                  target="_blank" rel="noreferrer"
                  sx={{ fontSize: '0.78rem', color: '#ff6b6b', wordBreak: 'break-all' }}
                >
                  https://www.youtube.com/watch?v={channelYoutubeBroadcastId || form.youtube_broadcast_id}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: AP.muted, lineHeight: 1.4 }}>
                  Starts Private. Automatically switches to Public while this encoder is broadcasting on YouTube, and back to Private when stopped.
                </Typography>
                {channelYoutubeBroadcastId ? (
                  <Typography sx={{ fontSize: '0.7rem', color: AP.muted, fontStyle: 'italic' }}>
                    Inherited from the assigned channel's YouTube simulcast — no separate setup needed.
                  </Typography>
                ) : (
                  <TextField
                    size="small" label="YouTube Broadcast ID" fullWidth
                    value={form.youtube_broadcast_id || ''} onChange={e => set('youtube_broadcast_id', e.target.value)}
                    helperText="Manually override to link a different existing broadcast."
                    sx={{ mt: 0.5 }}
                  />
                )}
              </Box>
            )}
            <ToggleRow
              label="Facebook"
              hint={facebookConnected ? undefined : 'Connect your Facebook Page in Settings to enable'}
              checked={form.simulcast_facebook && facebookConnected}
              onChange={v => set('simulcast_facebook', v)}
              color="#1877F2"
              disabled={!facebookConnected}
            />
            <ToggleRow label="App" checked={form.simulcast_app} onChange={v => set('simulcast_app', v)} />

            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: '#cbd5e1', mt: 0.5 }}>
              RECORDING
            </Typography>
            <ToggleRow label="VOD Recording" hint="Save a downloadable recording after each broadcast" checked={form.vod_recording} onChange={v => set('vod_recording', v)} color={AP.live} />
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={handleClose} sx={{ color: AP.muted, minHeight: { xs: 44, sm: 'auto' } }}>Cancel</Button>
        <Button
          variant="contained" onClick={handleSave} disabled={!isValid || saving || loading}
          sx={{ bgcolor: AP.accent, minHeight: { xs: 44, sm: 'auto' }, '&:hover': { bgcolor: AP.accentHov } }}
        >
          {saving
            ? <><CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} />{creatingBroadcast ? 'Creating YouTube broadcast…' : 'Saving…'}</>
            : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
