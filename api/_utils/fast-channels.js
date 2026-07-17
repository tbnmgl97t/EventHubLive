// Shared wrapper for calls to JW's Pop-up Channels (FAST) API
// (api.fast.jwp.services). Bearer-token auth, one key per tenant.

const BASE_URL = 'https://api.fast.jwp.services'

async function fastRequest(creds, path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || `Pop-up Channels API error ${res.status}`), { status: res.status })
  }
  return data
}

export function getChannel(creds, channelId) {
  return fastRequest(creds, `/channels/${encodeURIComponent(channelId)}`)
}

export function getChannels(creds) {
  return fastRequest(creds, '/channels')
}

export function getSchedule(creds, channelId) {
  return fastRequest(creds, `/channels/${encodeURIComponent(channelId)}/schedule`)
}

// Applies an add/update/delete diff to a linear channel's schedule (does not
// replace the full schedule — see PATCH /channels/{id}/schedule in the API
// reference). Returns the merged list of added/updated items.
export function patchSchedule(creds, channelId, { add, update, delete: del } = {}) {
  return fastRequest(creds, `/channels/${encodeURIComponent(channelId)}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(add ? { add } : {}),
      ...(update ? { update } : {}),
      ...(del ? { delete: del } : {}),
    }),
  })
}
