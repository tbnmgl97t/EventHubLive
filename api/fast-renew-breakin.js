/**
 * GET/POST /api/fast-renew-breakin
 *
 * Every FAST Channel Break-in schedule item is created with a short (10 min)
 * end_time ceiling (see BREAKIN_CEILING_MS in encoder-go-live.js) rather than
 * running indefinitely. This cron keeps that ceiling pushed forward for as
 * long as the break-in is actually still active, by finding every encoder
 * with a live fast_schedule_item_id and re-issuing the schedule item with a
 * fresh end_time.
 *
 * Running every few minutes (see vercel.json) gives multiple renewal
 * attempts inside each 10-minute window, so a single missed/slow tick isn't
 * fatal. If renewal stops entirely (crashed deploy, tenant removed, etc.)
 * the break-in self-heals away on its own within ~10 minutes instead of
 * airing forever unattended.
 *
 * Triggered by Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`
 * — reject anything else so this can't be hit by the public internet.
 */

import { supabase }                    from './_utils/supabase.js'
import { getSchedule, patchSchedule }  from './_utils/fast-channels.js'

const CEILING_MS = 10 * 60 * 1000 // must match BREAKIN_CEILING_MS in encoder-go-live.js

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: encoders, error: encErr } = await supabase
    .from('encoders')
    .select('id, tenant_id, fast_channel_id, fast_schedule_item_id')
    .not('fast_schedule_item_id', 'is', null)
  if (encErr) return res.status(500).json({ error: encErr.message })
  if (!encoders?.length) return res.status(200).json({ ok: true, renewed: 0, results: [] })

  const tenantIds = [...new Set(encoders.map(e => e.tenant_id))]
  const { data: tenants, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, fast_api_key')
    .in('id', tenantIds)
  if (tenantErr) return res.status(500).json({ error: tenantErr.message })
  const tenantById = Object.fromEntries((tenants || []).map(t => [t.id, t]))

  const results = []
  for (const encoder of encoders) {
    const tenant = tenantById[encoder.tenant_id]
    if (!tenant?.fast_api_key || !encoder.fast_channel_id) {
      results.push({ encoder_id: encoder.id, renewed: false, reason: 'missing FAST credentials or channel id' })
      continue
    }

    const creds = { apiKey: tenant.fast_api_key }
    try {
      const schedule = await getSchedule(creds, encoder.fast_channel_id)
      const item = (schedule || []).find(i => i.id === encoder.fast_schedule_item_id)
      if (!item) {
        // Already gone on the FAST side (expired past its ceiling, or removed
        // out-of-band) — nothing to renew. endFASTBreakIn on stop no-ops
        // safely against a missing item, so this needs no further cleanup.
        results.push({ encoder_id: encoder.id, renewed: false, reason: 'schedule item not found (expired?)' })
        continue
      }

      const end_time = new Date(Date.now() + CEILING_MS).toISOString()
      await patchSchedule(creds, encoder.fast_channel_id, { update: [{ ...item, end_time }] })
      results.push({ encoder_id: encoder.id, renewed: true, end_time })
    } catch (e) {
      results.push({ encoder_id: encoder.id, renewed: false, error: e.message })
    }
  }

  const renewed = results.filter(r => r.renewed).length
  return res.status(200).json({ ok: true, renewed, results })
}
