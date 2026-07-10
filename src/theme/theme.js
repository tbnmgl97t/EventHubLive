import { createTheme } from '@mui/material/styles'

const DEFAULTS = {
  primary:    '#e65d2c',
  secondary:  '#0a205a',
  background: '#060e24',
  paper:      '#0d1e42',
}

/**
 * Builds a MUI theme from tenant color config.
 * Falls back to EventHub Live defaults for any missing values.
 */
export function createTenantTheme(colors = {}) {
  const c = { ...DEFAULTS, ...colors }

  return createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main:         c.primary,
        contrastText: '#ffffff',
      },
      secondary: {
        main: c.secondary,
      },
      background: {
        default: c.background,
        paper:   c.paper,
      },
      text: {
        primary:   '#ffffff',
        secondary: '#a8bcd4',
      },
      divider: 'rgba(255,255,255,0.1)',
    },
    typography: {
      fontFamily: "'Poppins', sans-serif",
      h1: { fontFamily: "'Bayon', sans-serif", letterSpacing: '0.04em' },
      h2: { fontFamily: "'Bayon', sans-serif", letterSpacing: '0.04em' },
      h3: { fontFamily: "'Bayon', sans-serif", letterSpacing: '0.04em' },
      h4: { fontFamily: "'Bayon', sans-serif", letterSpacing: '0.04em' },
      h5: { fontFamily: "'Bayon', sans-serif", letterSpacing: '0.04em' },
      h6: { fontFamily: "'Bayon', sans-serif", letterSpacing: '0.03em' },
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none', border: '1px solid rgba(255,255,255,0.07)' },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, fontSize: '0.875rem' },
        },
      },
    },
  })
}

/** Static default theme — used as a fallback before tenant config loads */
export default createTenantTheme()
