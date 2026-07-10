/**
 * /api/tournament-days
 * All operations require auth.
 * POST   — add a session    body: { tournament_id, label, date, start_time, end_time, tz?, streams? }
 * PUT    — update a session body: { tournament_id, id, label?, date?, ... }
 * DELETE — remove a session body: { tournament_id, id }
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'

/** Normalise legacy camera1/camera2 fields into a streams array */
function normaliseStreams(body, existing = []) {
  if (Array.isArray(body.streams)) {
    return body.streams
      .filter(s => s && s.url)
      .slice(0, 10)
      .map((s, i) => ({ id: s.id ?? i + 1, url: s.url, name: s.name || `Stream ${i + 1}` }))
  }
  const base  = Array.isArray(existing) ? [...existing] : []
  const patch = []
  if (body.camera1_url !== undefined)
    patch.push({ id: 1, url: body.camera1_url, name: body.camera1_name || 'Stream 1' })
  if (body.camera2_url !== undefined)
    patch.push({ id: 2, url: body.camera2_url, name: body.camera2_name || 'Stream 2' })
  if (!patch.length) return base
  const map = {}
  base.forEach(s => { map[s.id] = s })
  patch.forEach(s => { if (s.url) map[s.id] = s; else delete map[s.id] })
  return Object.values(map).filter(s => s.url).slice(0, 10)
}

export default async function handler(req, res) {
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  try {
    const { tournament_id, id } = req.body || {}
    if (!tournament_id) return res.status(400).json({ error: 'tournament_id is required' })

    // tournament_days has no direct tenant_id column — verify the parent
    // tournament belongs to this tenant before allowing any write.
    const { data: parent, error: parentErr } = await supabase
      .from('tournaments')
      .select('tenant_id')
      .eq('id', Number(tournament_id))
      .single()
    if (parentErr || !parent) return res.status(404).json({ error: 'Tournament not found' })
    if (parent.tenant_id !== session.tenantId) return res.status(403).json({ error: 'Forbidden' })

    if (req.method === 'POST') {
      const { label, date, start_time, end_time, tz = 'America/New_York' } = req.body
      if (!label || !date || !start_time || !end_time)
        return res.status(400).json({ error: 'label, date, start_time, end_time are required' })
      const streams = normaliseStreams(req.body, [])
      const { data, error } = await supabase
        .from('tournament_days')
        .insert({ tournament_id: Number(tournament_id), label, date, start_time, end_time, tz, streams })
        .select()
        .single()
      if (error) throw error
      return res.status(201).json(data)
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id is required' })
      // Fetch existing to merge streams
      const { data: existing, error: fetchErr } = await supabase
        .from('tournament_days')
        .select('*')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      const { label, date, start_time, end_time, tz } = req.body
      const hasStreamUpdate = Array.isArray(req.body.streams)
        || req.body.camera1_url !== undefined
        || req.body.camera2_url !== undefined
      const streams = hasStreamUpdate
        ? normaliseStreams(req.body, existing.streams || [])
        : existing.streams

      const patch = { streams }
      if (label      !== undefined) patch.label      = label
      if (date       !== undefined) patch.date        = date
      if (start_time !== undefined) patch.start_time  = start_time
      if (end_time   !== undefined) patch.end_time    = end_time
      if (tz         !== undefined) patch.tz          = tz

      const { data, error } = await supabase
        .from('tournament_days')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id is required' })
      const { error } = await supabase.from('tournament_days').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[tournament-days]', err)
    return res.status(500).json({ error: err.message })
  }
}
