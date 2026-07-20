// Shared wrapper for BrightSpot's REST Management API (CMA) — write/query
// access, distinct from the read-only Content Delivery API already used by
// brightspot-proxy.js. Auth is X-Client-Id / X-Client-Secret headers rather
// than the ?api-key= param the Delivery API uses.
//
// As of 2026-07-14 this API consistently returns "Insufficient client
// permissions" for this tenant's client regardless of site/type/path —
// confirmed not an IP, hostname, or client-ID-format issue. Every call
// through this helper should treat that as "not available yet" rather than
// a hard failure, until that's resolved on BrightSpot's side.

import { getTenantBrightspotCreds } from './tenant.js'

export async function brightspotCmaFetch(creds, path, opts = {}) {
  // The CMA must be called on the site's own hostname, not the shared CMS
  // admin host — calling on the admin host fails site resolution entirely.
  const base = creds.siteUrl || creds.cmsUrl
  const url = new URL(path, base)
  const headers = {
    'X-Client-Id':     creds.clientId,
    'X-Client-Secret': creds.apiKey,
    Accept:            'application/json',
    ...(opts.headers || {}),
  }
  const res = await fetch(url.toString(), { ...opts, headers })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { ok: res.ok && body?.status !== 'error', status: res.status, body }
}

// BrightSpot's custom EventHubLive endpoints (get-all-live-videos,
// get-all-video-pages) back the Encoder Page / Video Page pickers in
// EncoderForm. These live on the tenant's CMS host and require X-Site/
// X-API-Key headers on every call — global for now, not yet confirmed
// tenant-specific.
export async function brightspotEventHubFetch(creds, path) {
  const base = creds.cmsUrl || creds.siteUrl
  const url = new URL(path, base)
  // TODO: hardcoded as a temporary workaround while the .env.local loading
  // issue in `vercel dev` is unresolved — move back to process.env once fixed.
  const headers = {
    Accept:      'application/json',
    'X-Site':    '00000197-f4ab-d96b-a597-fdff581e0000',
    'X-API-Key': 'VeG8t7RMgIpp0LRDR7s81ZrnSuG0MAFCtNwcNQg',
  }
  const res = await fetch(url.toString(), { headers })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { ok: res.ok, status: res.status, body }
}

// Flattens the EventHubLive response shape — { data: { Get: { <key>: { State:
// { _id, _label } } } } }, where <key> is a throwaway identifier — into the
// { id, name } list the frontend picker expects.
export function mapEventHubItems(body) {
  return Object.values(body?.data?.Get || {})
    .map(entry => entry?.State)
    .filter(Boolean)
    .map(state => ({ id: state._id || null, name: state._label || null }))
    .filter(item => item.id && item.name)
}

/**
 * Resolves an encoder's assigned BrightSpot pages, but only if BrightSpot is
 * actually configured for the tenant *right now* — an encoder can carry
 * brightspot_page_id/brightspot_video_page_id from before the integration
 * was disconnected (credentials cleared, client removed, etc.), and go-live/
 * stop orchestration must never try to publish/unpublish against a
 * disconnected integration just because stale ids are sitting on the row.
 *
 * Call this (not encoder.brightspot_page_id directly) from anywhere that
 * publishes/unpublishes a page as part of the broadcast orchestration.
 */
export async function getEncoderBrightspotPages(tenantId, encoder) {
  const creds = await getTenantBrightspotCreds(tenantId)
  if (!creds) return { pageId: null, videoPageId: null }
  return {
    pageId:      encoder.brightspot_page_id       || null,
    videoPageId: encoder.brightspot_video_page_id || null,
  }
}
