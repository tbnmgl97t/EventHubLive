import React, { useEffect, useRef, useCallback } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import { useTenant } from '../contexts/TenantContext'

const JW_PLAYER_LIB = 'https://cdn.jwplayer.com/libraries/xJKVL03e.js'

const CAMERAS = [
  'https://cdn.jwplayer.com/live/broadcast/die1qpMr.m3u8',
  'https://cdn.jwplayer.com/live/broadcast/CpOw7syq.m3u8',
]

// Trilogy Digital brand colors — used in admin/plain mode
const TDP = {
  primary:   '#57BB95',
  secondary: '#17263A',
}

function loadJWPlayerScript() {
  return new Promise((resolve, reject) => {
    if (window.jwplayer) {
      resolve(window.jwplayer)
      return
    }
    const existing = document.querySelector(`script[src="${JW_PLAYER_LIB}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.jwplayer))
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.src = JW_PLAYER_LIB
    script.async = true
    script.onload = () => resolve(window.jwplayer)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export default function VideoPlayer({ cameraIndex = 0, cameraUrl, plain = false }) {
  const containerRef = useRef(null)
  const playerRef    = useRef(null)
  const muteStateRef = useRef(null)
  const playerDivId  = 'jw-player-main'

  const { tenant } = useTenant()
  // Public view uses the active tenant's primary color; admin uses Trilogy
  const accent = plain
    ? TDP.primary
    : (tenant?.colors?.primary || '#e65d2c')

  const resolvedUrl = cameraUrl || CAMERAS[cameraIndex] || CAMERAS[0]

  const initPlayer = useCallback(async () => {
    try {
      await loadJWPlayerScript()
      if (!containerRef.current || !window.jwplayer) return

      if (playerRef.current) {
        try { muteStateRef.current = playerRef.current.getMute() } catch (_) {}
        try { playerRef.current.remove() } catch (_) {}
      }

      playerRef.current = window.jwplayer(playerDivId).setup({
        file: resolvedUrl,
        width: '100%',
        aspectratio: '16:9',
        ...(muteStateRef.current !== null && { mute: muteStateRef.current }),
      })

      playerRef.current.on('mute', ({ mute }) => {
        muteStateRef.current = mute
      })
    } catch (err) {
      console.error('JW Player failed to load:', err)
    }
  }, [resolvedUrl])

  useEffect(() => {
    initPlayer()
    return () => {
      if (playerRef.current) {
        try { playerRef.current.remove() } catch (_) {}
        playerRef.current = null
      }
    }
  }, [initPlayer, resolvedUrl])

  // ── Admin / plain mode — Trilogy Digital styling, no CAM label ──────────────
  if (plain) {
    return (
      <Box sx={{
        width: '100%', height: '100%', bgcolor: '#000',
        border: `1px solid ${TDP.primary}4D`,
        boxShadow: `0 0 24px ${TDP.primary}14`,
      }}>
        <div id={playerDivId} ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </Box>
    )
  }

  // ── Public / tenant-themed mode ─────────────────────────────────────────────
  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        bgcolor: '#000',
        borderRadius: 2,
        overflow: 'hidden',
        border: `1px solid ${accent}4D`,
        boxShadow: `0 0 30px ${accent}1A`,
        position: 'relative',
      }}
    >
      {/* Camera label overlay */}
      <Box sx={{
        position: 'absolute', top: 10, left: 10, zIndex: 10,
        bgcolor: 'rgba(6,14,36,0.8)',
        border: `1px solid ${accent}80`,
        borderRadius: 1, px: 1, py: 0.25, pointerEvents: 'none',
      }}>
        <Typography variant="caption" sx={{
          color: accent, fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.65rem',
        }}>
          CAM {cameraIndex + 1}
        </Typography>
      </Box>

      <div id={playerDivId} ref={containerRef} style={{ width: '100%' }} />
    </Paper>
  )
}
