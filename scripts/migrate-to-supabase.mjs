/**
 * One-time migration: Edge Config → Supabase
 *
 * Run from project root:
 *   node scripts/migrate-to-supabase.mjs
 *
 * Requires .env.local to have both Edge Config and Supabase vars.
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load .env.local manually
const env = {}
try {
  readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '')
  })
} catch { /* ignore */ }

const EC_ID        = env.EDGE_CONFIG_ID
const VERCEL_TOKEN = env.VERCEL_API_TOKEN
const SUPA_URL     = env.SUPABASE_URL
const SUPA_KEY     = env.SUPABASE_SERVICE_ROLE_KEY

if (!EC_ID || !VERCEL_TOKEN) { console.error('Missing EDGE_CONFIG_ID or VERCEL_API_TOKEN'); process.exit(1) }
if (!SUPA_URL || !SUPA_KEY)  { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })

async function ecGet(key) {
  try {
    const r = await fetch(
      `https://api.vercel.com/v1/edge-config/${EC_ID}/item/${key}`,
      { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
    )
    if (!r.ok) return null
    const text = await r.text()
    if (!text || !text.trim()) return null
    const j = JSON.parse(text)
    return j?.value ?? null
  } catch {
    return null
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
function log(msg) { console.log(`  ${msg}`) }
function ok(msg)  { console.log(`  ✓ ${msg}`) }
function skip(msg){ console.log(`  – ${msg}`) }

async function migratePricing() {
  console.log('\n[pricing]')
  const data = await ecGet('pricing')
  if (!data) { skip('no pricing in Edge Config — defaults will be used'); return }
  const { error } = await supabase.from('pricing').upsert({ id: 'default', ...data })
  if (error) throw error
  ok('pricing migrated')
}

async function migrateTenant() {
  console.log('\n[tenant]')
  const data = await ecGet('tenant')
  if (!data) { skip('no tenant in Edge Config — defaults will be used'); return }
  const { error } = await supabase.from('tenant').upsert({ id: 'default', ...data })
  if (error) throw error
  ok('tenant migrated')
}

async function migrateTournaments() {
  console.log('\n[tournaments + tournament_days]')
  const data = await ecGet('tournaments')
  if (!data || !data.length) { skip('no tournaments in Edge Config'); return }

  for (const t of data) {
    log(`Tournament: ${t.name}`)
    const { data: inserted, error: tErr } = await supabase
      .from('tournaments')
      .upsert({ id: t.id, name: t.name, location: t.location || '' }, { onConflict: 'id' })
      .select()
      .single()
    if (tErr) throw tErr

    const tId = inserted?.id ?? t.id
    for (const d of (t.days || [])) {
      // Normalise legacy camera fields → streams array
      let streams = d.streams || []
      if (!streams.length) {
        if (d.camera1_url) streams.push({ id: 1, url: d.camera1_url, name: d.camera1_name || 'Stream 1' })
        if (d.camera2_url) streams.push({ id: 2, url: d.camera2_url, name: d.camera2_name || 'Stream 2' })
      }
      const { error: dErr } = await supabase
        .from('tournament_days')
        .upsert({
          id: d.id, tournament_id: tId,
          label: d.label, date: d.date,
          start_time: d.start_time, end_time: d.end_time,
          tz: d.tz || 'America/New_York',
          streams,
        }, { onConflict: 'id' })
      if (dErr) throw dErr
      log(`  Day: ${d.label} (${d.date})`)
    }
    ok(`${t.name} → ${(t.days || []).length} days`)
  }
}

async function migrateCdnRecords() {
  console.log('\n[cdn_records]')
  const data = await ecGet('cdn_records')
  if (!data || !data.length) { skip('no cdn_records in Edge Config'); return }
  const { error } = await supabase
    .from('cdn_records')
    .upsert(data.map(r => ({
      id:                r.id,
      date:              r.date,
      label:             r.label,
      tournament_id:     r.tournament_id ?? null,
      channel_id:        r.channel_id,
      channel_name:      r.channel_name,
      stream_hours:      Number(r.stream_hours),
      minutes_delivered: Number(r.minutes_delivered),
    })), { onConflict: 'id' })
  if (error) throw error
  ok(`${data.length} cdn_records migrated`)
}

async function migrateCostRecords() {
  console.log('\n[cost_records]')
  const data = await ecGet('cost_records')
  if (!data || !data.length) { skip('no cost_records in Edge Config'); return }
  const { error } = await supabase
    .from('cost_records')
    .upsert(data.map(r => ({
      id:            r.id,
      date:          r.date,
      label:         r.label,
      channel_count: Number(r.channel_count),
      start_time:    r.start_time,
      end_time:      r.end_time,
    })), { onConflict: 'id' })
  if (error) throw error
  ok(`${data.length} cost_records migrated`)
}

// ── run ───────────────────────────────────────────────────────────────────────
console.log('Edge Config → Supabase migration')
console.log('=================================')
try {
  await migratePricing()
  await migrateTenant()
  await migrateTournaments()
  await migrateCdnRecords()
  await migrateCostRecords()
  console.log('\n✅ Migration complete')
} catch (err) {
  console.error('\n❌ Migration failed:', err.message)
  process.exit(1)
}
