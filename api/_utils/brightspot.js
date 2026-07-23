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
// get-all-video-pages, get-video-page-by-id, update-videopage-headline,
// update-video) back the Encoder Page / Video Page pickers and the go-live/
// stop orchestration in EncoderForm. These live on the tenant's CMS host and
// require X-Site/X-API-Key headers on every call — global for now, not yet
// confirmed tenant-specific.
export async function brightspotEventHubFetch(creds, path, { method = 'GET' } = {}) {
  const base = creds.cmsUrl || creds.siteUrl
  const url = new URL(path, base)
  // TODO: hardcoded as a temporary workaround while the .env.local loading
  // issue in `vercel dev` is unresolved — move back to process.env once fixed.
  const headers = {
    Accept:      'application/json',
    'X-Site':    '00000197-f4ab-d96b-a597-fdff581e0000',
    'X-API-Key': 'VeG8t7RMgIpp0LRDR7s81ZrnSuG0MAFCtNwcNQg',
  }
  const res = await fetch(url.toString(), { method, headers })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { ok: res.ok, status: res.status, body }
}

// Pulls every { State } entry out of the EventHubLive response envelope —
// { data: { Get: { <key>: { State: {...} } } } }, where <key> is a
// throwaway identifier (a list endpoint returns one per item; a
// get-by-id endpoint returns a single "Record" key).
function extractEventHubStates(body) {
  return Object.values(body?.data?.Get || {}).map(entry => entry?.State).filter(Boolean)
}

// Flattens a list-endpoint response into the { id, name } list the frontend
// picker expects.
export function mapEventHubItems(body) {
  return extractEventHubStates(body)
    .map(state => ({ id: state._id || null, name: state._label || null }))
    .filter(item => item.id && item.name)
}

// BrightSpot's VideoPage title is exposed under the `headline` query param
const EVENTHUB_PAGE_TITLE_PARAM = 'headline'

const EVENTHUB_ENDPOINTS = {
  getVideoPage:         '/api/eventhublive/get-video-page-by-id',
  updateVideoPageTitle: '/api/eventhublive/update-videopage-headline',
  updateVideo:          '/api/eventhublive/update-video',
}

// BrightSpot requires the id filter as a literal `with/_id` query key.
// Percent-encoding it (as encodeURIComponent naturally does) is confirmed to
// work fine — BrightSpot decodes it back to `with/_id` server-side.
function toEventHubQuery(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

async function getEventHubRecord(creds, endpoint, id) {
  const query = toEventHubQuery({ 'with/_id': id })
  const { ok, status, body } = await brightspotEventHubFetch(creds, `${endpoint}?${query}`)
  return { ok, status, state: extractEventHubStates(body)[0] || null }
}

// Reads a VideoPage's current title. get-video-page-by-id doesn't return the
// mapped write field (EVENTHUB_PAGE_TITLE_PARAM) yet — only
// { __typename, _id, _label } — so this falls back to `_label` (the page's
// admin-facing name) as a stand-in original value for now. If BrightSpot
// starts returning the real field, it's preferred automatically with no
// further code change needed here.
export async function getEventHubVideoPageTitle(creds, id) {
  const { ok, status, state } = await getEventHubRecord(creds, EVENTHUB_ENDPOINTS.getVideoPage, id)
  return { ok, status, title: state?.[EVENTHUB_PAGE_TITLE_PARAM] ?? state?._label ?? null }
}

export async function updateVideoPage(creds, id, title) {
  const query = toEventHubQuery({ 'with/_id': id, [EVENTHUB_PAGE_TITLE_PARAM]: title })
  return brightspotEventHubFetch(creds, `${EVENTHUB_ENDPOINTS.updateVideoPageTitle}?${query}`, { method: 'POST' })
}

// ViewNexaVideo (ViewNexa/encoder page) title is intentionally not touched by
// this integration — only standaloneWeather and isLiveNowOverride are ever
// written to it.
export async function updateViewNexaVideo(creds, id, { standaloneWeather, isLiveNowOverride } = {}) {
  const query = toEventHubQuery({ 'with/_id': id, standaloneWeather, isLiveNowOverride })
  return brightspotEventHubFetch(creds, `${EVENTHUB_ENDPOINTS.updateVideo}?${query}`, { method: 'POST' })
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
