import { Box } from '@mui/material'

/**
 * EventHubLive lockup — Live Frame mark + wordmark
 *
 * Design spec (from the EventHubLive brand media kit v1.4):
 *   - Mark:   "Live Frame" — a rounded-square viewport with a record dot at
 *             its centre. Non-letterform, distinct app icon/logo mark used
 *             for the favicon and Google OAuth consent screen.
 *   - Font:   Inter Tight, weight 700, tracking -0.04em
 *   - "EventHub" in base color (ink on light, bone on dark)
 *   - "Live"  in red accent (#ff3b30 light / #ff5247 dark)
 *   - Pulse dot (~22% of font-size) in same red, slightly raised
 *   - Animated expanding ring on dot (1.6 s, ease-out, infinite)
 *
 * Props:
 *   size    — font size in px (default 28)
 *   dark    — true = bone text + dark-tuned red (default true)
 *   animate — show the pulse ring animation (default true)
 */
export default function EHLLogo({ size = 28, dark = true, animate = true }) {
  const color  = dark ? '#f4f3ef' : '#15171c'
  const accent = dark ? '#ff5247' : '#ff3b30'
  const dot    = Math.round(size * 0.22)
  const gap    = Math.round(size * 0.07)
  const rise   = Math.round(size * 0.06)
  const halo   = Math.round(dot * 0.45)
  const mark   = Math.round(size * 1.3)

  return (
    <Box sx={{
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: "'Inter Tight', sans-serif",
      fontWeight: 700,
      letterSpacing: '-0.04em',
      fontSize: size,
      lineHeight: 1,
      color,
      userSelect: 'none',
    }}>
      {/* Live Frame mark */}
      <Box
        component="svg"
        viewBox="0 0 512 512"
        aria-hidden="true"
        sx={{ width: mark, height: mark, mr: `${Math.round(size * 0.25)}px`, flexShrink: 0 }}
      >
        <rect x="126" y="126" width="260" height="260" rx="64" fill="none" stroke={color} strokeWidth="28" />
        <circle cx="256" cy="256" r="52" fill={accent} />
      </Box>

      <Box component="span">EventHub</Box>
      <Box component="span" sx={{ color: accent }}>Live</Box>

      {/* Pulse dot */}
      <Box component="span" sx={{
        display: 'inline-block',
        flexShrink: 0,
        width: dot,
        height: dot,
        borderRadius: '50%',
        bgcolor: accent,
        ml: `${gap}px`,
        transform: `translateY(-${rise}px)`,
        position: 'relative',
        ...(animate && {
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: -halo,
            borderRadius: '50%',
            border: `2px solid ${accent}`,
            opacity: 0.35,
            animation: 'ehlPulse 1.6s ease-out infinite',
          },
          '@keyframes ehlPulse': {
            '0%':   { transform: 'scale(0.55)', opacity: 0.5 },
            '100%': { transform: 'scale(1.65)', opacity: 0   },
          },
        }),
      }} />
    </Box>
  )
}
