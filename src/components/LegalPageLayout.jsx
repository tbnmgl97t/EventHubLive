import { Box, Paper, Typography, Link as MuiLink, ThemeProvider, CssBaseline, createTheme } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import EHLLogo from './EHLLogo'
import { AP } from './Admin'

const legalTheme = createTheme({
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
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', border: '1px solid rgba(255,255,255,0.09)' } } },
  },
})

/** Shared chrome for standalone legal pages (Privacy Policy, Terms of Service). */
export default function LegalPageLayout({ title, updatedDate, children }) {
  return (
    <ThemeProvider theme={legalTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 4, sm: 6 }, px: 2 }}>
        <Box sx={{ maxWidth: 760, mx: 'auto' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4, gap: 1 }}>
            <EHLLogo size={32} dark animate={false} />
            <Typography sx={{ fontFamily: "'Bayon', sans-serif", letterSpacing: '0.08em', fontSize: '0.85rem', color: 'rgba(255,255,255,0.35)' }}>
              {title.toUpperCase()}
            </Typography>
          </Box>

          <Paper elevation={0} sx={{ p: { xs: 3, sm: 5 } }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>{title}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>Last updated: {updatedDate}</Typography>

            <Box sx={{
              '& h2': { fontSize: '1.05rem', fontWeight: 700, mt: 4, mb: 1.5, '&:first-of-type': { mt: 0 } },
              '& p': { fontSize: '0.92rem', lineHeight: 1.7, color: AP.text, mb: 1.75 },
              '& ul': { pl: 3, mb: 1.75 },
              '& li': { fontSize: '0.92rem', lineHeight: 1.7, color: AP.text, mb: 0.75 },
              '& a': { color: AP.accent },
            }}>
              {children}
            </Box>
          </Paper>

          <Box sx={{ textAlign: 'center', mt: 3 }}>
            <MuiLink component={RouterLink} to="/admin" sx={{ fontSize: '0.85rem', color: AP.muted, textDecoration: 'none', '&:hover': { color: AP.text } }}>
              ← Back to Login
            </MuiLink>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}
