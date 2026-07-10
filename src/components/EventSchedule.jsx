import React, { useState, useEffect } from 'react'
import { Box, Paper, Typography, Chip, Stack, Divider } from '@mui/material'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import { EVENTS, parseEventWindow } from './PreShowScreen'

function formatCountdown(ms) {
  if (ms <= 0) return null
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function EventSchedule({ flat = false, events: eventsProp }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const displayEvents = (eventsProp || EVENTS).map(ev => ({
    ...ev,
    start: ev.start || ev.start_time,
    end:   ev.end   || ev.end_time,
  }))

  // Find the next or current event
  const nextEvent = displayEvents.find(ev => {
    const { end } = parseEventWindow(ev.date, ev.start, ev.end)
    return end > now
  })

  const getStatus = (ev) => {
    const s = ev.start || ev.start_time
    const e = ev.end   || ev.end_time
    const { start, end } = parseEventWindow(ev.date, s, e)
    if (now >= start && now <= end) return 'live'
    if (now < start) return 'upcoming'
    return 'completed'
  }

  const statusColors = {
    live: '#e65d2c',
    upcoming: '#a8bcd4',
    completed: 'rgba(168,188,212,0.35)',
  }

  const statusLabels = {
    live: 'LIVE NOW',
    upcoming: 'UPCOMING',
    completed: 'COMPLETED',
  }

  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        bgcolor: flat ? 'transparent' : 'background.paper',
        borderRadius: flat ? 0 : 2,
        overflow: 'hidden',
        border: flat ? 'none' : '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          background: 'linear-gradient(90deg, rgba(10,32,90,0.5) 0%, transparent 60%)',
        }}
      >
        <CalendarTodayIcon sx={{ color: '#e65d2c', fontSize: 18 }} />
        <Typography
          variant="h6"
          sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.06em', fontSize: '1rem' }}
        >
          EVENT SCHEDULE
        </Typography>
      </Box>

      {/* Countdown to next event */}
      {nextEvent && (() => {
        const status = getStatus(nextEvent)
        const { start } = parseEventWindow(nextEvent.date, nextEvent.start || nextEvent.start_time, nextEvent.end || nextEvent.end_time)
        const countdown = status === 'upcoming' ? formatCountdown(start - now) : null
        const endLabel = nextEvent.end || nextEvent.end_time

        return status === 'live' || countdown ? (
          <Box
            sx={{
              px: 2,
              py: 1.25,
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              bgcolor: status === 'live' ? 'rgba(230,93,44,0.08)' : 'rgba(10,32,90,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <AccessTimeIcon sx={{ color: '#e65d2c', fontSize: 16 }} />
            {status === 'live' ? (
              <Typography variant="body2" sx={{ color: '#e65d2c', fontWeight: 700 }}>
                {nextEvent.label} is live now &mdash; ends {endLabel} ET
              </Typography>
            ) : (
              <Typography variant="body2" sx={{ color: '#a8bcd4' }}>
                Next event in{' '}
                <Box component="span" sx={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                  {countdown}
                </Box>
              </Typography>
            )}
          </Box>
        ) : null
      })()}

      {/* Days list */}
      <Stack divider={<Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}>
        {displayEvents.map((ev, i) => {
          const status = getStatus(ev)
          const isLive = status === 'live'
          return (
            <Box
              key={i}
              sx={{
                px: 2,
                py: 1.25,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                bgcolor: isLive ? 'rgba(230,93,44,0.05)' : 'transparent',
                opacity: status === 'completed' ? 0.55 : 1,
                transition: 'background 0.2s',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <Box
                  sx={{
                    width: 3,
                    height: 36,
                    borderRadius: 4,
                    bgcolor: statusColors[status],
                    flexShrink: 0,
                  }}
                />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem' }}>
                    {ev.label} &nbsp;
                    <Box component="span" sx={{ color: '#a8bcd4', fontWeight: 400 }}>
                      {formatDate(ev.date)}
                    </Box>
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                    <AccessTimeIcon sx={{ fontSize: 12, color: '#a8bcd4' }} />
                    <Typography variant="caption" sx={{ color: '#a8bcd4', fontSize: '0.72rem' }}>
                      {ev.start} – {ev.end} ET
                    </Typography>
                  </Box>
                </Box>
              </Box>

              <Chip
                label={statusLabels[status]}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  bgcolor: isLive ? 'rgba(230,93,44,0.2)' : 'rgba(255,255,255,0.06)',
                  color: statusColors[status],
                  border: `1px solid ${statusColors[status]}`,
                  borderColor: isLive ? '#e65d2c' : 'transparent',
                  flexShrink: 0,
                }}
              />
            </Box>
          )
        })}
      </Stack>
    </Paper>
  )
}
