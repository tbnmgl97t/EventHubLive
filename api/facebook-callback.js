/**
 * GET /api/facebook-callback?code=...&state=...
 * Handles the OAuth redirect from Facebook:
 *   1. Verifies the signed `state` param and recovers the tenant id
 *   2. Exchange code for short-lived user token
 *   3. Extend to long-lived user token (60 days)
 *   4. Fetch the user's Pages and pick the first one
 *   5. Store long-lived page access token + page metadata in Supabase tenants row
 *   6. Redirect to /admin/settings?fb=connected
 *
 * Page access tokens derived from a long-lived user token do not expire,
 * so we store the page token directly (no refresh token needed).
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { supabase } from './_utils/supabase.js'
import { extendUserToken, fbRequest } from './_utils/facebook.js'

// Verifies the `state` param produced by facebook-auth.js's signState() and
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
  if (req.method !== 'GET') return res.status(405).end()

  const APP_ID       = process.env.FACEBOOK_APP_ID
  const APP_SECRET   = process.env.FACEBOOK_APP_SECRET
  const REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI

  const { code, error, state } = req.query

  if (error || !code) {
    console.error('[facebook-callback] OAuth error:', error)
    return res.redirect('/admin/settings?fb=error')
  }

  const tenantId = verifyState(state)
  if (!tenantId) {
    console.error('[facebook-callback] Invalid or missing state param')
    return res.status(400).json({ error: 'Invalid or missing state parameter' })
  }

  try {
    // ── 1. Exchange code for short-lived user token ───────────────────────────
    const tokenRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?` +
      new URLSearchParams({ client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: REDIRECT_URI, code })
    )
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(`Token exchange failed: ${tokenData.error?.message || tokenRes.status}`)
    }

    // ── 2. Extend to long-lived user token ────────────────────────────────────
    const longLivedUserToken = await extendUserToken(tokenData.access_token)

    // ── 3. Get the user's Pages ───────────────────────────────────────────────
    const pagesData = await fbRequest(longLivedUserToken, '/me/accounts?fields=id,name,access_token,picture')
    const pages = pagesData?.data || []

    if (!pages.length) {
      // No pages — store user token and surface a warning in the UI
      await supabase.from('tenants').update({
        facebook_page_access_token: longLivedUserToken,
        facebook_page_id:           null,
        facebook_page_name:         null,
        facebook_page_picture:      null,
      }).eq('id', tenantId)
      return res.redirect('/admin/settings?fb=no_pages')
    }

    // Use the first page (user can reconnect to switch pages in future)
    const page = pages[0]
    // Page tokens from a long-lived user token do not expire
    const pageToken = page.access_token

    // ── 4. Persist to Supabase ────────────────────────────────────────────────
    const { error: dbErr } = await supabase.from('tenants').update({
      facebook_page_access_token: pageToken,
      facebook_page_id:           page.id,
      facebook_page_name:         page.name,
      facebook_page_picture:      page.picture?.data?.url || null,
    }).eq('id', tenantId)

    if (dbErr) throw dbErr

    return res.redirect('/admin/settings?fb=connected')
  } catch (err) {
    console.error('[facebook-callback]', err)
    return res.redirect(`/admin/settings?fb=error&msg=${encodeURIComponent(err.message)}`)
  }
}
