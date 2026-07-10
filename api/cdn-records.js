/**
 * /api/cdn-records
 * GET    — Super Admin only; returns all records with computed costs
 * POST   — Super Admin only; create  body: { date, label, tournament_id?, channel_id, channel_name, stream_hours, minutes_delivered }
 * PUT    — Super Admin only; update  body: { id, ...fields }
 * DELETE — Super Admin only; delete  body: { id }
 *
 * Global data — not scoped to any tenant.
 */

import { verifyToken, isSuperAdmin } from './_utils/auth.js'
import { readPricing }   from './pricing.js'
import { supabase }      from './_utils/supabase.js'

const REQUIRED_FIELDS = ['date', 'label', 'channel_id', 'channel_name', 'stream_hours', 'minutes_delivered']

export function calcCost(record, pricing) {
  const overrides    = pricing.channel_overrides?.[record.channel_id] || {}
  const feed_rate    = overrides.feed_rate_per_hr ?? pricing.feed_rate_per_hr
  const cdn_rate     = overrides.cdn_rate_per_gb  ?? pricing.cdn_rate_per_gb
  const gb_per_50    = pricing.gb_per_50_min
  const gb_delivered = (record.minutes_delivered / 50) * gb_per_50
  const cost_feed    = record.stream_hours * feed_rate
  const cost_cdn     = gb_delivered * cdn_rate
  return {
    gb_delivered,
    cost_feed,
    cost_cdn,
    cost_total: cost_feed + cost_cdn,
    rates_used: { feed_rate, cdn_rate, gb_per_50_min: gb_per_50 },
  }
}

export default async function handler(req, res) {
  try {
    const session = await verifyToken(req.headers.authorization)
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Forbidden' })

    if (req.method === 'GET') {
      const [{ data: records, error }, pricing] = await Promise.all([
        supabase.from('cdn_records').select('*').order('date'),
        readPricing(),
      ])
      if (error) throw error
      return res.status(200).json(
        (records || []).map(r => ({
          ...r,
          stream_hours:      Number(r.stream_hours),
          minutes_delivered: Number(r.minutes_delivered),
          ...calcCost({ ...r, stream_hours: Number(r.stream_hours), minutes_delivered: Number(r.minutes_delivered) }, pricing),
        }))
      )
    }

    if (req.method === 'POST') {
      const missing = REQUIRED_FIELDS.filter(f => req.body[f] === undefined || req.body[f] === '')
      if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` })
      const { data, error } = await supabase
        .from('cdn_records')
        .insert({
          date:              req.body.date,
          label:             req.body.label,
          tournament_id:     req.body.tournament_id ?? null,
          channel_id:        req.body.channel_id,
          channel_name:      req.body.channel_name,
          stream_hours:      Number(req.body.stream_hours),
          minutes_delivered: Number(req.body.minutes_delivered),
        })
        .select()
        .single()
      if (error) throw error
      return res.status(201).json(data)
    }

    if (req.method === 'PUT') {
      const { id, ...fields } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })
      const numFields = ['stream_hours', 'minutes_delivered']
      const patch = Object.fromEntries(
        Object.entries(fields)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, numFields.includes(k) ? Number(v) : v])
      )
      const { data, error } = await supabase
        .from('cdn_records')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })
      const { error } = await supabase.from('cdn_records').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[cdn-records]', err)
    return res.status(500).json({ error: err.message })
  }
}
