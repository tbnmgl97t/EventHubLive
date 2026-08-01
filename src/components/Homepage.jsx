import { Box, Paper, Typography, Link as MuiLink, Button, ThemeProvider, CssBaseline, createTheme } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import EHLLogo from './EHLLogo'
import { AP } from './Admin'

const homeTheme = createTheme({
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
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiPaper:  { styleOverrides: { root: { backgroundImage: 'none', border: '1px solid rgba(255,255,255,0.09)' } } },
  },
})

const FEATURES = [
  {
    title: 'Live stream & 24/7 channel management',
    body: 'Schedule live events or run always-on channels, with configurable encoders, ingest points, and routers behind the scenes.',
  },
  {
    title: 'YouTube simulcasting',
    body: "Automatically create and manage a live broadcast on a connected YouTube channel alongside your primary stream, using the channel owner's own YouTube account.",
  },
  {
    title: 'JW Player delivery',
    body: 'Deliver and archive video through JW Player, including downloadable VOD recordings with configurable retention.',
  },
  {
    title: 'BrightSpot CMS publishing',
    body: 'Publish clips and alerts directly to a connected BrightSpot CMS instance as streams go live.',
  },
]

/** Public, no-login-required homepage describing EventHubLive for prospective users and OAuth reviewers. */
export default function Homepage() {
  return (
    <ThemeProvider theme={homeTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Box sx={{ maxWidth: 860, mx: 'auto', px: 2, py: { xs: 5, sm: 8 } }}>

          {/* Hero */}
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <EHLLogo size={44} dark animate />
            </Box>
            <Typography sx={{ fontSize: { xs: '1rem', sm: '1.15rem' }, color: AP.muted, maxWidth: 560, mx: 'auto', lineHeight: 1.6 }}>
              EventHubLive is a broadcast management platform that lets news and media
              organizations configure encoders, launch live streams and 24/7 channels, and route
              them to destinations like YouTube, JW Player, and a CMS — all from one dashboard.
            </Typography>
            <Button
              component={RouterLink}
              to="/admin"
              variant="contained"
              sx={{ mt: 3, px: 4, py: 1, bgcolor: AP.accent, '&:hover': { bgcolor: AP.accentHov }, fontWeight: 700 }}
            >
              Sign In
            </Button>
          </Box>

          {/* What it does */}
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>What EventHubLive Does</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 6 }}>
            {FEATURES.map(f => (
              <Paper key={f.title} elevation={0} sx={{ p: 2.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', mb: 0.75 }}>{f.title}</Typography>
                <Typography sx={{ fontSize: '0.87rem', color: AP.muted, lineHeight: 1.6 }}>{f.body}</Typography>
              </Paper>
            ))}
          </Box>

          {/* Data use / transparency */}
          <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 6 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>How EventHubLive Uses Your Data</Typography>
            <Typography sx={{ fontSize: '0.9rem', color: AP.text, lineHeight: 1.7, mb: 1.5 }}>
              EventHubLive is an invitation-only platform used by authorized staff of Trilogy
              Digital and its client organizations to manage broadcast operations. When an
              organization connects its YouTube channel, EventHubLive requests access to the
              YouTube Data API solely to create, configure, and manage live broadcasts on that
              channel on the organization's behalf — for example, simulcasting a stream that is
              already airing. We do not access, use, or share YouTube data for advertising, and we
              do not sell user data.
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', color: AP.text, lineHeight: 1.7 }}>
              Full details are available in our{' '}
              <MuiLink component={RouterLink} to="/privacy" sx={{ color: AP.accent }}>Privacy Policy</MuiLink>
              {' '}and{' '}
              <MuiLink component={RouterLink} to="/terms" sx={{ color: AP.accent }}>Terms of Service</MuiLink>.
            </Typography>
          </Paper>

          {/* Footer */}
          <Box sx={{ textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <MuiLink component={RouterLink} to="/privacy" sx={{ fontSize: '0.8rem', color: AP.muted, textDecoration: 'none', '&:hover': { color: AP.text } }}>
              Privacy Policy
            </MuiLink>
            <Typography sx={{ fontSize: '0.8rem', color: AP.muted }}>·</Typography>
            <MuiLink component={RouterLink} to="/terms" sx={{ fontSize: '0.8rem', color: AP.muted, textDecoration: 'none', '&:hover': { color: AP.text } }}>
              Terms of Service
            </MuiLink>
            <Typography sx={{ fontSize: '0.8rem', color: AP.muted }}>·</Typography>
            <Typography sx={{ fontSize: '0.8rem', color: AP.muted }}>
              A product of Trilogy Digital Platforms, Inc.
            </Typography>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}
