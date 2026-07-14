import { Box, Typography } from '@mui/material'

// Shared per-status animated placeholders for a 24/7 channel that isn't
// actually outputting video yet — used on both the Stream Details page and
// the Encoder Control page so the two stay visually consistent.
// `hint` overrides the subtitle line under the state label; each state falls
// back to its own default when omitted.
export default function ChannelStateAnimation({ status, hint }) {
  const s = status?.toLowerCase()

  // Starting — rings begin large and collapse inward toward center
  if (s === 'starting') {
    return (
      <Box sx={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 50%, rgba(56,189,248,0.1) 0%, transparent 68%)',
      }}>
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
        <Box sx={{ position: 'absolute', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{
            fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.22em',
            color: '#38bdf8', textTransform: 'uppercase',
            animation: 'fadeLblBlue 2.2s ease-in-out infinite',
            '@keyframes fadeLblBlue': { '0%,100%': { opacity: 0.4 }, '50%': { opacity: 1 } },
          }}>
            Starting Preview
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'rgba(56,189,248,0.45)', letterSpacing: '0.08em' }}>
            {hint ?? 'CDN warming up…'}
          </Typography>
        </Box>
      </Box>
    )
  }

  // Preview — no stream_url yet, waiting for the CDN to propagate
  if (s === 'preview') {
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
            {hint ?? 'CDN propagating…'}
          </Typography>
        </Box>
      </Box>
    )
  }

  // Ready — large green sonar rings expanding to fill the frame
  if (s === 'ready') {
    return (
      <Box sx={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 50%, rgba(87,187,149,0.12) 0%, transparent 68%)',
      }}>
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
        <Box sx={{ position: 'absolute', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{
            fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.22em',
            color: '#57BB95', textTransform: 'uppercase',
            animation: 'fadeLblGreen 2.2s ease-in-out infinite',
            '@keyframes fadeLblGreen': { '0%,100%': { opacity: 0.4 }, '50%': { opacity: 1 } },
          }}>
            Ready
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'rgba(87,187,149,0.55)', letterSpacing: '0.08em' }}>
            {hint ?? 'Start preview when ready'}
          </Typography>
        </Box>
      </Box>
    )
  }

  // Creating — large amber sonar rings expanding to fill the frame
  if (s === 'creating') {
    return (
      <Box sx={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.12) 0%, transparent 68%)',
      }}>
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
        <Box sx={{ position: 'absolute', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{
            fontSize: '1rem', fontWeight: 700, letterSpacing: '0.22em',
            color: '#f59e0b', textTransform: 'uppercase',
            animation: 'fadeLblAmber 2.2s ease-in-out infinite',
            '@keyframes fadeLblAmber': { '0%,100%': { opacity: 0.4 }, '50%': { opacity: 1 } },
          }}>
            Initializing Stream
          </Typography>
          {hint ? (
            <Typography sx={{ fontSize: '0.8rem', color: 'rgba(245,158,11,0.55)', letterSpacing: '0.08em' }}>
              {hint}
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', gap: '5px' }}>
              {[0, 1, 2].map(i => (
                <Box key={i} sx={{
                  width: 4, height: 4, borderRadius: '50%', bgcolor: '#f59e0b',
                  animation: `dotA 1.3s ease-in-out ${i * 0.22}s infinite`,
                  '@keyframes dotA': { '0%,80%,100%': { transform: 'scale(0.5)', opacity: 0.25 }, '40%': { transform: 'scale(1)', opacity: 1 } },
                }} />
              ))}
            </Box>
          )}
        </Box>
      </Box>
    )
  }

  // Fallback — idle / no active stream
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1.5, opacity: 0.25 }}>
      <Box component="svg" viewBox="0 0 64 64" sx={{ width: 44, height: 44, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, color: '#94a3b8' }}>
        <circle cx="32" cy="32" r="26" /><path d="M26 20l16 12-16 12V20z" />
      </Box>
      <Typography sx={{ fontSize: '0.75rem', color: '#94a3b8' }}>{hint ?? 'No active stream'}</Typography>
    </Box>
  )
}
