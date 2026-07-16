import { Box, Typography } from '@mui/material'

// A 16:9 feed card with source label, status badge, and inner content —
// shared by the Stream Details page and the Encoder Control page so every
// feed player looks the same regardless of which screen it's viewed from.
// Pass `statusBadge` to replace the default "Live" pill with something else
// (e.g. the YouTube Private/Public indicator) — `isLive` still drives the
// card's glow/border even when statusBadge is used instead of the pill.
export default function FeedCard({ label, logo, accentColor = '#6366f1', isLive, statusBadge, children }) {
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
        {statusBadge ?? (isLive && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.9, py: 0.25, borderRadius: '20px', bgcolor: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)' }}>
            <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#10b981', boxShadow: '0 0 5px #10b981',
              animation: 'liveDot 1.8s ease-in-out infinite',
              '@keyframes liveDot': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
            <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: '#10b981', textTransform: 'uppercase' }}>Live</Typography>
          </Box>
        ))}
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

// Small pill matching FeedCard's header badge sizing — shows "Live" or a
// muted "Preview" label, for cards where "not live yet" is still worth
// calling out explicitly rather than showing no badge at all.
export function LiveStateBadge({ isLive, idleLabel = 'Preview' }) {
  if (isLive) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.9, py: 0.25, borderRadius: '20px', bgcolor: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)' }}>
        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#10b981', boxShadow: '0 0 5px #10b981',
          animation: 'liveDot 1.8s ease-in-out infinite',
          '@keyframes liveDot': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
        <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: '#10b981', textTransform: 'uppercase' }}>Live</Typography>
      </Box>
    )
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.9, py: 0.25, borderRadius: '20px', bgcolor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
      <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>{idleLabel}</Typography>
    </Box>
  )
}

// Small pill matching FeedCard's header badge sizing — shows a YouTube
// broadcast's current privacy state where the "Live" pill would normally go.
export function YoutubePrivacyBadge({ status }) {
  const isPublic = status === 'public'
  const label = isPublic ? 'Public' : status === 'private' ? 'Private' : status === 'unlisted' ? 'Unlisted' : '—'
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.5, px: 0.9, py: 0.25, borderRadius: '20px',
      bgcolor: isPublic ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)',
      border: `1px solid ${isPublic ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.15)'}`,
    }}>
      {isPublic && (
        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#ef4444', boxShadow: '0 0 5px #ef4444',
          animation: 'ytPrivDot 1.8s ease-in-out infinite',
          '@keyframes ytPrivDot': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
      )}
      <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: isPublic ? '#ef4444' : 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>
        {label}
      </Typography>
    </Box>
  )
}
