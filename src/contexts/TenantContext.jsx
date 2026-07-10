import React, { createContext, useContext, useState, useEffect } from 'react'

export const DEFAULT_TENANT = {
  id:       'eventhub-live',
  title:    'EventHub Live',
  subtitle: 'Live Event Streaming Platform',
  logo_url: '',
  timezone: 'America/New_York',
  colors: {
    primary:    '#e65d2c',
    secondary:  '#0a205a',
    background: '#060e24',
    paper:      '#0d1e42',
  },
  components: {
    video_player:    true,
    camera_selector: true,
    event_schedule:  true,
    command_center:  true,
    pre_show_screen: true,
  },
}

const TenantContext = createContext({ tenant: DEFAULT_TENANT, loading: true })

export function TenantProvider({ children }) {
  const [tenant, setTenant]   = useState(DEFAULT_TENANT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tenant')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setTenant({
            ...DEFAULT_TENANT,
            ...data,
            colors:     { ...DEFAULT_TENANT.colors,     ...(data.colors     || {}) },
            components: { ...DEFAULT_TENANT.components, ...(data.components || {}) },
          })
        }
      })
      .catch(() => {}) // silently fall back to defaults
      .finally(() => setLoading(false))
  }, [])

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  )
}

/** Hook for consuming tenant config anywhere in the tree */
export function useTenant() {
  return useContext(TenantContext)
}

/**
 * Conditionally renders children based on a component feature flag.
 * Usage: <FeatureFlag name="command_center"> ... </FeatureFlag>
 * Returns null if the flag is explicitly set to false in tenant config.
 */
export function FeatureFlag({ name, children }) {
  const { tenant } = useTenant()
  if (tenant.components?.[name] === false) return null
  return <>{children}</>
}
