import { Box } from '@mui/material'

/**
 * EventHubLive wordmark — Treatment B
 *
 * Design spec (from EventHubLive Logo.html):
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
