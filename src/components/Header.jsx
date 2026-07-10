import React from 'react'
import { AppBar, Toolbar, Box, Typography, Chip } from '@mui/material'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import { useTenant } from '../contexts/TenantContext'

export default function Header({ live = false }) {
  const { tenant } = useTenant()
  const primary    = tenant.colors?.primary || '#e65d2c'
  const secondary  = tenant.colors?.secondary || '#0a205a'

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        background: `linear-gradient(90deg, ${tenant.colors?.background || '#060e24'} 0%, ${secondary} 60%, ${tenant.colors?.background || '#060e24'} 100%)`,
        borderBottom: `2px solid ${primary}`,
      }}
    >
      <Toolbar sx={{ gap: 1.5, minHeight: { xs: 56, sm: 64 } }}>
        {/* Logo / Team Name */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
          {tenant.logo_url && (
            <Box
              component="img"
              src={tenant.logo_url}
              alt={tenant.title}
              sx={{
                width: { xs: 44, sm: 54 },
                height: { xs: 44, sm: 54 },
                objectFit: 'contain',
                flexShrink: 0,
                filter: `drop-shadow(0 0 6px ${primary}59)`,
              }}
            />
          )}
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontFamily: "'Bayon', sans-serif",
                letterSpacing: '0.06em',
                fontSize: { xs: '1rem', sm: '1.25rem' },
                lineHeight: 1.1,
                color: '#fff',
                textTransform: 'uppercase',
              }}
            >
              {tenant.title}
            </Typography>
            {tenant.subtitle && (
              <Typography
                variant="caption"
                sx={{ color: '#a8bcd4', fontSize: { xs: '0.6rem', sm: '0.7rem' }, letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                {tenant.subtitle}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Live Badge */}
        <Chip
          icon={
            <FiberManualRecordIcon
              sx={{
                fontSize: '10px !important',
                color: '#fff !important',
                ...(live && {
                  animation: 'pulse 1.5s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%':      { opacity: 0.3 },
                  },
                }),
              }}
            />
          }
          label={live ? 'LIVE' : 'OFFLINE'}
          size="small"
          sx={{
            background:  live ? primary : 'rgba(168,188,212,0.2)',
            color:       '#fff',
            fontWeight:  700,
            fontSize:    '0.7rem',
            letterSpacing: '0.1em',
            height:      26,
            fontFamily:  "'Poppins', sans-serif",
            border:      live ? 'none' : '1px solid rgba(168,188,212,0.3)',
          }}
        />
      </Toolbar>
    </AppBar>
  )
}
