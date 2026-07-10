/**
 * GET /api/youtube-callback?code=...&state=...
 * Handles the OAuth redirect from Google:
 *   1. Verifies the signed `state` param and recovers the tenant id
 *   2. Exchanges the code for access + refresh tokens
 *   3. Fetches the connected YouTube channel info
 *   4. Stores refresh token + channel metadata in Supabase tenants row
 *   5. Redirects back to /admin/settings?yt=connected
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { supabase } from './_utils/supabase.js'

// Verifies the `state` param produced by youtube-auth.js's signState() and
// recovers the tenantId it was signed for. Returns null if missing/invalid.
function verifyState(state) {
  if (!state || typeof state !== 'string') return null
  const dotIndex = state.lastIndexOf('.')
  if (dotIndex === -1) return null

  const payload   = state.slice(0, dotIndex)
  const signature = state.slice(dotIndex + 1)

  const expected = createHmac('sha256', process.env.ADMIN_SECRET || 'fallback')
    .update(payload)
    .digest('hex')

  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  const valid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)
  if (!valid) return null

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!decoded?.tenantId) return null
    return decoded.tenantId
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID
  const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET
  const REDIRECT_URI  = process.env.YOUTUBE_REDIRECT_URI
  if (req.method !== 'GET') return res.status(405).end()

  const { code, error, state } = req.query

  if (error || !code) {
    console.error('[youtube-callback] OAuth error:', error)
    return res.redirect('/admin/settings?yt=error')
  }

  const tenantId = verifyState(state)
  if (!tenantId) {
    console.error('[youtube-callback] Invalid or missing state param')
    return res.status(400).json({ error: 'Invalid or missing state parameter' })
  }

  try {
    // ── 1. Exchange code for tokens ───────────────────────────────────────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok || !tokens.refresh_token) {
      throw new Error(`Token exchange failed: ${tokens.error_description || tokens.error}`)
    }

    // ── 2. Fetch connected channel info ───────────────────────────────────────
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    )
    const channelData = await channelRes.json()
    const channel = channelData.items?.[0]

    // ── 3. Persist to Supabase ────────────────────────────────────────────────
    const { error: dbErr } = await supabase
      .from('tenants')
      .update({
        youtube_refresh_token:    tokens.refresh_token,
        youtube_channel_id:       channel?.id || null,
        youtube_channel_name:     channel?.snippet?.title || null,
        youtube_channel_thumbnail: channel?.snippet?.thumbnails?.default?.url || null,
      })
      .eq('id', tenantId)

    if (dbErr) throw dbErr

    return res.redirect('/admin/settings?yt=connected')
  } catch (err) {
    console.error('[youtube-callback]', err)
    return res.redirect(`/admin/settings?yt=error&msg=${encodeURIComponent(err.message)}`)
  }
}
