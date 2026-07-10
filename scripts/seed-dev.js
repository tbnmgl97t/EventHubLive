#!/usr/bin/env node
/**
 * Seed the DEV Edge Config with sample data for preview testing.
 *
 * Usage:
 *   EDGE_CONFIG_ID=ecfg_xxx VERCEL_API_TOKEN=xxx node scripts/seed-dev.js
 *
 * Or with a .env.dev file:
 *   node --env-file=.env.dev scripts/seed-dev.js
 *
 * Flags:
 *   --with-tenant   Also write the tenant config key (defaults to RI Breakers)
 *   --dry-run       Print what would be written without actually writing
 *   --force-prod    Override the prod Edge Config guard (DO NOT USE)
 *
 * Writes the following keys to Edge Config:
 *   - tournaments   (5 tournaments; today's Day 3 is currently live)
 *   - cost_records  (2 years of sample history across multiple tournaments)
 *   - tenant        (tenant config — only if --with-tenant flag)
 *
 * Safe to re-run — overwrites the keys with a clean seed state.
 */

const EC_ID        = process.env.EDGE_CONFIG_ID
const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN
const WITH_TENANT  = process.argv.includes('--with-tenant')
const DRY_RUN      = process.argv.includes('--dry-run')

if (!EC_ID || !VERCEL_TOKEN) {
  console.error('[seed] Missing EDGE_CONFIG_ID or VERCEL_API_TOKEN')
  console.error('       Set them in the env, or use `node --env-file=.env.dev scripts/seed-dev.js`')
  process.exit(1)
}

// Guard: refuse to seed the production store by ID (belt + suspenders)
const PROD_EC_ID = 'ecfg_klyq8hjj2xsoc0aze4ov44kjiecm'
if (EC_ID === PROD_EC_ID && !process.argv.includes('--force-prod')) {
  console.error('[seed] Refusing to seed production Edge Config.')
  console.error('       Pass --force-prod if you REALLY mean it (you probably do not).')
  process.exit(1)
}

// ── Sample data ─────────────────────────────────────────────────────────────

// Convenience shorthand
const cam = (u1, n1, u2, n2) => ({
  camera1_url: u1, camera1_name: n1,
  camera2_url: u2, camera2_name: n2,
})
const CAM_A = 'https://cdn.jwplayer.com/live/broadcast/die1qpMr.m3u8'
const CAM_B = 'https://cdn.jwplayer.com/live/broadcast/CpOw7syq.m3u8'
const NO_CAMS = cam(null, null, null, null)

const SAMPLE_TOURNAMENTS = [
  // ── Tournament 1: Key West Classic 2026 ─────────────────────────────────
  // Today (2026-04-19) is Day 3 — CURRENTLY LIVE (8 AM–5 PM EDT)
  {
    id: 1,
    name: 'Key West Classic 2026',
    location: 'Key West, FL',
    days: [
      { id: 1, label: 'Pro/Am', date: '2026-04-16', start_time: '8:00 AM', end_time: '3:00 PM', tz: 'EDT', ...cam(CAM_A, 'Main Deck', CAM_B, 'Bridge') },
      { id: 2, label: 'Day 1',  date: '2026-04-17', start_time: '8:00 AM', end_time: '5:00 PM', tz: 'EDT', ...cam(CAM_A, 'Main Deck', CAM_B, 'Bridge') },
      { id: 3, label: 'Day 2',  date: '2026-04-18', start_time: '8:00 AM', end_time: '5:00 PM', tz: 'EDT', ...cam(CAM_A, 'Main Deck', CAM_B, 'Bridge') },
      // ← LIVE RIGHT NOW (2026-04-19) — video player + LIVE badge will activate
      { id: 4, label: 'Day 3 (Finals)', date: '2026-04-19', start_time: '8:00 AM', end_time: '5:00 PM', tz: 'EDT', ...cam(CAM_A, 'Main Deck', CAM_B, 'Bridge') },
    ],
  },

  // ── Tournament 2: Block Island Shootout 2026 ─────────────────────────────
  // Future — exercises "upcoming" / pre-show state
  {
    id: 2,
    name: 'Block Island Shootout',
    location: 'Block Island, RI',
    days: [
      { id: 1, label: 'Day 1',  date: '2026-06-12', start_time: '7:00 AM', end_time: '4:00 PM', tz: 'EDT', ...NO_CAMS },
      { id: 2, label: 'Day 2',  date: '2026-06-13', start_time: '7:00 AM', end_time: '4:00 PM', tz: 'EDT', ...NO_CAMS },
      { id: 3, label: 'Finals', date: '2026-06-14', start_time: '7:00 AM', end_time: '3:00 PM', tz: 'EDT', ...NO_CAMS },
    ],
  },

  // ── Tournament 3: Montauk Masters 2026 ──────────────────────────────────
  // Future — different location, 3-day structure
  {
    id: 3,
    name: 'Montauk Masters',
    location: 'Montauk, NY',
    days: [
      { id: 1, label: 'Pro/Am', date: '2026-07-09', start_time: '8:00 AM', end_time: '3:00 PM', tz: 'EDT', ...NO_CAMS },
      { id: 2, label: 'Day 1',  date: '2026-07-10', start_time: '7:30 AM', end_time: '5:00 PM', tz: 'EDT', ...NO_CAMS },
      { id: 3, label: 'Day 2',  date: '2026-07-11', start_time: '7:30 AM', end_time: '5:00 PM', tz: 'EDT', ...NO_CAMS },
    ],
  },

  // ── Tournament 4: Cape Cod Invitational 2026 ─────────────────────────────
  // Further future — exercises multi-tournament list rendering in admin
  {
    id: 4,
    name: 'Cape Cod Invitational',
    location: 'Hyannis, MA',
    days: [
      { id: 1, label: 'Day 1', date: '2026-08-07', start_time: '8:00 AM', end_time: '5:00 PM', tz: 'EDT', ...NO_CAMS },
      { id: 2, label: 'Day 2', date: '2026-08-08', start_time: '8:00 AM', end_time: '5:00 PM', tz: 'EDT', ...NO_CAMS },
    ],
  },

  // ── Tournament 5: Key West Classic 2025 ─────────────────────────────────
  // Historical — exercises cost-record linking and past-event rendering
  {
    id: 5,
    name: 'Key West Classic 2025',
    location: 'Key West, FL',
    days: [
      { id: 1, label: 'Pro/Am', date: '2025-04-10', start_time: '8:00 AM', end_time: '3:00 PM', tz: 'EDT', ...NO_CAMS },
      { id: 2, label: 'Day 1',  date: '2025-04-11', start_time: '8:00 AM', end_time: '5:00 PM', tz: 'EDT', ...NO_CAMS },
      { id: 3, label: 'Day 2',  date: '2025-04-12', start_time: '8:00 AM', end_time: '5:00 PM', tz: 'EDT', ...NO_CAMS },
      { id: 4, label: 'Day 3',  date: '2025-04-13', start_time: '8:00 AM', end_time: '4:00 PM', tz: 'EDT', ...NO_CAMS },
    ],
  },
]

// 2 years of cost history across tournaments — good for billing rollup testing
const SAMPLE_COST_RECORDS = [
  // ── Key West 2025 ────────────────────────────────────────────────────────
  { id:  1, date: '2025-04-10', label: 'KWC 2025 Pro/Am', channel_count: 2, start_time: '8:00 AM', end_time: '3:00 PM' },
  { id:  2, date: '2025-04-11', label: 'KWC 2025 Day 1',  channel_count: 2, start_time: '8:00 AM', end_time: '5:00 PM' },
  { id:  3, date: '2025-04-12', label: 'KWC 2025 Day 2',  channel_count: 2, start_time: '8:00 AM', end_time: '5:00 PM' },
  { id:  4, date: '2025-04-13', label: 'KWC 2025 Day 3',  channel_count: 2, start_time: '8:00 AM', end_time: '4:00 PM' },
  // ── Block Island 2025 (1-camera event) ──────────────────────────────────
  { id:  5, date: '2025-06-06', label: 'BIS 2025 Day 1',  channel_count: 1, start_time: '7:00 AM', end_time: '4:00 PM' },
  { id:  6, date: '2025-06-07', label: 'BIS 2025 Day 2',  channel_count: 1, start_time: '7:00 AM', end_time: '4:00 PM' },
  { id:  7, date: '2025-06-08', label: 'BIS 2025 Finals', channel_count: 1, start_time: '7:00 AM', end_time: '3:00 PM' },
  // ── Montauk Masters 2025 ────────────────────────────────────────────────
  { id:  8, date: '2025-07-11', label: 'MTK 2025 Pro/Am', channel_count: 2, start_time: '8:00 AM', end_time: '2:30 PM' },
  { id:  9, date: '2025-07-12', label: 'MTK 2025 Day 1',  channel_count: 2, start_time: '7:30 AM', end_time: '5:00 PM' },
  { id: 10, date: '2025-07-13', label: 'MTK 2025 Day 2',  channel_count: 2, start_time: '7:30 AM', end_time: '5:00 PM' },
  // ── Key West 2026 (current tournament — 3 days logged so far) ────────────
  { id: 11, date: '2026-04-16', label: 'KWC 2026 Pro/Am', channel_count: 2, start_time: '8:00 AM', end_time: '3:00 PM' },
  { id: 12, date: '2026-04-17', label: 'KWC 2026 Day 1',  channel_count: 2, start_time: '8:00 AM', end_time: '5:00 PM' },
  { id: 13, date: '2026-04-18', label: 'KWC 2026 Day 2',  channel_count: 2, start_time: '8:00 AM', end_time: '5:00 PM' },
  // Day 3 (today/live) intentionally absent — shows an in-progress day with no cost record yet
]

const SAMPLE_TENANT = {
  id:        'ri-breakers',
  title:     'RI BREAKERS',
  subtitle:  'Live Tournament Feed',
  logo_url:  '/logo.png',
  colors: {
    primary:    '#e65d2c',
    secondary:  '#0a205a',
    background: '#060e24',
    paper:      '#0d1e42',
  },
  features: {
    video_player:     true,
    camera_selector:  true,
    pre_show_screen:  true,
    event_schedule:   true,
    command_center:   true,
  },
}

// ── Writer ──────────────────────────────────────────────────────────────────

async function upsert(items) {
  const res = await fetch(
    `https://api.vercel.com/v1/edge-config/${EC_ID}/items`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items }),
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Write failed: ${res.status} — ${text}`)
  }
  return res.json()
}

async function main() {
  const items = [
    { operation: 'upsert', key: 'tournaments',  value: SAMPLE_TOURNAMENTS },
    { operation: 'upsert', key: 'cost_records', value: SAMPLE_COST_RECORDS },
  ]
  if (WITH_TENANT) {
    items.push({ operation: 'upsert', key: 'tenant', value: SAMPLE_TENANT })
  }

  console.log(`[seed] Target Edge Config: ${EC_ID}`)
  console.log(`[seed] Writing keys: ${items.map(i => i.key).join(', ')}`)
  const totalDays = SAMPLE_TOURNAMENTS.reduce((n, t) => n + t.days.length, 0)
  console.log(`[seed] tournaments:  ${SAMPLE_TOURNAMENTS.length} (${totalDays} days total)`)
  console.log(`[seed] cost_records: ${SAMPLE_COST_RECORDS.length} entries across 2025–2026`)
  console.log(`[seed] ⚡ TODAY (2026-04-19) is live — KWC 2026 Day 3 Finals will show LIVE badge + player`)

  if (DRY_RUN) {
    console.log('[seed] DRY RUN — no changes written')
    return
  }

  await upsert(items)
  console.log('[seed] ✓ done')
}

main().catch(err => {
  console.error('[seed] FAILED:', err.message)
  process.exit(1)
})
