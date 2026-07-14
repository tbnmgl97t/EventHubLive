import React, { useMemo } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { createTenantTheme } from './theme/theme'
import { TenantProvider, useTenant } from './contexts/TenantContext'
import Admin from './components/Admin'
import StreamPage from './components/StreamPage'

/** Inner app — builds theme from live tenant config */
function AppContent() {
  const { tenant } = useTenant()
  const muiTheme   = useMemo(() => createTenantTheme(tenant.colors), [tenant.colors])

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Routes>
        <Route path="/"                 element={<Admin />} />
        <Route path="/admin"            element={<Admin />} />
        <Route path="/admin/streams"   element={<Admin />} />
        <Route path="/admin/events"    element={<Admin />} />
        <Route path="/admin/encoders/*" element={<Admin />} />
        <Route path="/admin/routers"    element={<Admin />} />
        <Route path="/admin/costs"     element={<Admin />} />
        <Route path="/admin/settings"  element={<Admin />} />
        <Route path="/admin/tenants"     element={<Admin />} />
        <Route path="/admin/superadmins" element={<Admin />} />
        <Route path="/admin/stream/:id" element={<StreamPage />} />
        <Route path="*"                element={<Admin />} />
      </Routes>
    </ThemeProvider>
  )
}

export default function App() {
  return (
    <TenantProvider>
      <AppContent />
    </TenantProvider>
  )
}
