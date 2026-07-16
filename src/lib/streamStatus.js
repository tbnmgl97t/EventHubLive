// ─── Single source of truth for how a JW live-stream status displays ──────────
// The status *value* itself already comes from one place (api/channels.js's
// derivedStatus). This module is the one place that turns that value — plus
// stream_type, since 24/7 channels and scheduled Events read the same raw JW
// statuses differently — into a label/color for the UI. Every view (Live
// Streams list, stream detail drawer/page, encoder list, channel picker,
// create-stream result panel) should import from here rather than keeping its
// own copy, so a status never reads differently depending on which screen
// you're looking at it from.

const SPINUP_MINS = 30

// JW uses 'idle' for both pre-start and post-end on scheduled Events — use
// the stream's own start/end window to tell "hasn't started yet" apart from
// "already happened".
export function resolveIdleStatus(channel) {
  if (!channel?.stream_start) return 'past'
  const now   = Date.now()
  const start = new Date(channel.stream_start).getTime()
  const end   = channel.stream_end ? new Date(channel.stream_end).getTime() : null
  if (start > now) return 'upcoming'          // hasn't started yet
  if (end && now < end) return 'upcoming'     // currently within window
  return 'past'
}

export function getSpinupStatus(channel) {
  if (!channel?.stream_start) return null
  const s = channel.status?.toLowerCase()
  // Terminal / in-progress states never get a spinup overlay
  if (['active', 'streaming', 'stopping', 'destroying', 'deleting', 'idle'].includes(s)) return null
  // For unknown statuses only show spinup badge if the stream is upcoming
  if (!['requested', 'scheduled', 'creating'].includes(s)) {
    if (resolveIdleStatus(channel) !== 'upcoming') return null
  }
  const now   = Date.now()
  const start = new Date(channel.stream_start).getTime()
  const end   = channel.stream_end ? new Date(channel.stream_end).getTime() : null
  const minsToStart  = (start - now) / 60_000
  const minsAfterEnd = end ? (now - end) / 60_000 : null
  if (minsToStart > 0 && minsToStart <= SPINUP_MINS)                            return 'starting_soon'
  if (minsAfterEnd !== null && minsAfterEnd >= 0 && minsAfterEnd <= SPINUP_MINS) return 'winding_down'
  return null
}

// Canonical label/color per resolved status key. `idle` = a scheduled Event
// that already ended ("Past Event"); `idle_247` = a 24/7 channel with nothing
// running ("Idle") — these read the same raw JW status ('idle'/'stopped') but
// mean different things depending on stream_type, hence the split key.
const STATUS_DISPLAY = {
  active:     { label: 'Live',       color: '#10b981', bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.4)',  pulse: true  },
  streaming:  { label: 'Live',       color: '#10b981', bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.4)',  pulse: true  },
  scheduled:  { label: 'Scheduled',  color: '#818cf8', bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.4)',  pulse: false },
  creating:   { label: 'Creating',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.4)',  pulse: true  },
  starting:   { label: 'Starting',   color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.35)', pulse: true  },
  ready:      { label: 'Ready',      color: '#57BB95', bg: 'rgba(87,187,149,0.15)',  border: 'rgba(87,187,149,0.4)',  pulse: false },
  preview:    { label: 'Preview',    color: '#38bdf8', bg: 'rgba(56,189,248,0.15)',  border: 'rgba(56,189,248,0.35)', pulse: false },
  idle:       { label: 'Past Event', color: '#94a3b8', bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.4)', pulse: false },
  idle_247:   { label: 'Idle',       color: '#94a3b8', bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.4)', pulse: false },
  stopping:   { label: 'Stopping',   color: '#f87171', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',  pulse: true  },
  destroying: { label: 'Destroying', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.35)', pulse: true  },
  deleting:   { label: 'Deleting',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.35)', pulse: true  },
}

/**
 * Resolves a channel's raw `status` (+ `stream_type`) into the display key
 * used to look up STATUS_DISPLAY. Centralizes the two places this used to
 * silently diverge per-screen:
 *  - 24/7 channels have no "scheduled start", so requested/scheduled just
 *    means it's still spinning up ("Creating"), not "Scheduled".
 *  - "idle" means different things for a 24/7 channel (Idle) vs a scheduled
 *    Event (Past Event, or "Scheduled" again if its window hasn't started).
 */
export function getStreamStatusKey(channel) {
  const s     = channel?.status?.toLowerCase()
  const is247 = channel?.stream_type === '24/7'

  if ((s === 'requested' || s === 'scheduled') && is247) return 'creating'
  if (s === 'requested') return 'scheduled'

  if (s === 'idle' || s === 'stopped' || !s || !STATUS_DISPLAY[s]) {
    if (is247) return 'idle_247'
    return resolveIdleStatus(channel) === 'upcoming' ? 'scheduled' : 'idle'
  }
  return s
}

/**
 * Returns the {label, color, bg, border, pulse} to render for a channel.
 * Pass `idleLabel` to override the label only for the idle/idle_247 case
 * (e.g. the Encoders list prefers "Offline" over "Idle").
 */
export function getStatusDisplay(channel, { idleLabel } = {}) {
  const key = getStreamStatusKey(channel)
  const cfg = STATUS_DISPLAY[key] || STATUS_DISPLAY.idle
  if (idleLabel && (key === 'idle' || key === 'idle_247')) {
    return { ...cfg, key, label: idleLabel }
  }
  return { ...cfg, key }
}
