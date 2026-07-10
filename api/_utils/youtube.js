/**
 * YouTube Data API v3 helpers
 * - refreshAccessToken()  — exchanges a refresh token for a fresh access token
 * - youtubeRequest()      — authenticated fetch wrapper
 */

/**
 * Exchange a stored refresh token for a fresh access token.
 * Returns { access_token, expires_in } or throws on failure.
 */
export async function refreshAccessToken(refreshToken) {
  const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID
  const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const data = await r.json()
  if (!r.ok || !data.access_token) {
    throw new Error(`YouTube token refresh failed: ${data.error_description || data.error || r.status}`)
  }
  return data
}

/**
 * Make an authenticated request to the YouTube Data API v3.
 * Automatically refreshes the access token from the stored refresh token.
 */
export async function youtubeRequest(refreshToken, path, { method = 'GET', body } = {}) {
  const { access_token } = await refreshAccessToken(refreshToken)
  const url = `https://www.googleapis.com/youtube/v3${path}`
  const r = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`YouTube API ${r.status}: ${text}`)
  return text ? JSON.parse(text) : null
}
