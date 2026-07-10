/**
 * /api/cost-records
 * Super-Admin only, global (not tenant-scoped) — Costs/Pricing is agency-wide financials.
 * GET    — super-admin;  returns all records with computed hours
 * POST   — super-admin;  create  body: { date, label, channel_count, start_time, end_time }
 * PUT    — super-admin;  update  body: { id, ...fields }
 * DELETE — super-admin;  delete  body: { id }
 */

import { verifyToken } from './_utils/auth.js'
import { supabase }    from './_utils/supabase.js'

function parseHours(start_time, end_time) {
  function toH(t) {
    const m = (t || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
    if (!m) return 0
    let h = parseInt(m[1])
    const ap = m[3]?.toUpperCase()
    if (ap === 'PM' && h !== 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    return h + parseInt(m[2]) / 60
  }
  return Math.max(0, toH(end_time) - toH(start_time))
}

function enrich(r) {
  const hpc = parseHours(r.start_time, r.end_time)
  return { ...r, hours_per_channel: hpc, total_hours: hpc * r.channel_count }
}

export default async function handler(req, res) {
  try {
    const session = await verifyToken(req.headers.authorization)
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    if (!session.isSuperAdmin) return res.status(403).json({ error: 'Forbidden' })

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('cost_records')
        .select('*')
        .order('date')
      if (error) throw error
      return res.status(200).json((data || []).map(enrich))
    }

    if (req.method === 'POST') {
      const { date, label, channel_count, start_time, end_time } = req.body || {}
      if (!date || !label || !channel_count || !start_time || !end_time)
        return res.status(400).json({ error: 'date, label, channel_count, start_time, end_time are required' })
      const { data, error } = await supabase
        .from('cost_records')
        .insert({ date, label, channel_count: Number(channel_count), start_time, end_time })
        .select()
        .single()
      if (error) throw error
      return res.status(201).json(enrich(data))
    }

    if (req.method === 'PUT') {
      const { id, date, label, channel_count, start_time, end_time } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })
      const patch = {}
      if (date          !== undefined) patch.date          = date
      if (label         !== undefined) patch.label         = label
      if (channel_count !== undefined) patch.channel_count = Number(channel_count)
      if (start_time    !== undefined) patch.start_time    = start_time
      if (end_time      !== undefined) patch.end_time      = end_time
      const { data, error } = await supabase
        .from('cost_records')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(enrich(data))
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })
      const { error } = await supabase.from('cost_records').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[cost-records]', err)
    return res.status(500).json({ error: err.message })
  }
}
