// Shared wrapper for calls to JW Player's Management API (api.jwplayer.com).
// JW caps requests at 60/min per account and returns a plain 429 with no
// Retry-After header (see docs.jwplayer.com/platform/reference/authentication),
// so on a 429 we back off a flat delay and retry once before giving up.
const RETRY_DELAY_MS = 1500

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function jwFetch(jw, url, opts = {}) {
  const headers = { Authorization: jw.apiSecret, Accept: 'application/json', ...(opts.headers || {}) }
  let res = await fetch(url, { ...opts, headers })
  if (res.status === 429) {
    await sleep(RETRY_DELAY_MS)
    res = await fetch(url, { ...opts, headers })
  }
  return res
}

export { sleep }
