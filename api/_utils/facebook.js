/**
 * Facebook Graph API helpers
 *
 * Facebook page access tokens obtained from a long-lived user token do not
 * expire, so unlike YouTube there is no "refresh token" dance — we store the
 * page access token directly and use it on every request.
 */

const FB_GRAPH = 'https://graph.facebook.com/v18.0'

/**
 * Make an authenticated request to the Facebook Graph API.
 * @param {string} pageAccessToken  — stored page access token
 * @param {string} path             — e.g. '/me/live_videos'
 * @param {{ method?, body? }} opts
 */
export async function fbRequest(pageAccessToken, path, { method = 'GET', body } = {}) {
  const url = `${FB_GRAPH}${path}`
  const r = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await r.text()
  const data = text ? JSON.parse(text) : null
  if (data?.error) {
    throw new Error(`Facebook API error ${data.error.code}: ${data.error.message}`)
  }
  if (!r.ok) throw new Error(`Facebook API ${r.status}: ${text}`)
  return data
}

/**
 * Exchange a short-lived user token for a long-lived one (60 days).
 */
export async function extendUserToken(shortToken) {
  const APP_ID     = process.env.FACEBOOK_APP_ID
  const APP_SECRET = process.env.FACEBOOK_APP_SECRET
  const r = await fetch(
    `${FB_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortToken)}`
  )
  const data = await r.json()
  if (!r.ok || !data.access_token) {
    throw new Error(`Token exchange failed: ${data.error?.message || r.status}`)
  }
  return data.access_token // long-lived user token
}

/**
 * Parse a Facebook RTMP(S) stream URL into { base, key }.
 * Facebook returns the full URL with the key appended after the last '/'.
 *
 * Example:
 *   secure_stream_url = "rtmps://live-api-s.facebook.com:443/rtmp/FB-123-key..."
 *   → { base: "rtmps://live-api-s.facebook.com:443/rtmp/", key: "FB-123-key..." }
 */
export function parseFbRtmp(streamUrl) {
  if (!streamUrl) return { base: null, key: null }
  const idx = streamUrl.lastIndexOf('/')
  return {
    base: streamUrl.substring(0, idx + 1),
    key:  streamUrl.substring(idx + 1),
  }
}
