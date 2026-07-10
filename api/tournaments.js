/**
 * /api/tournaments
 * GET    — public; returns all tournaments with nested days
 * POST   — auth; create   body: { name, location }
 * PUT    — auth; update   body: { id, name?, location? }
 * DELETE — auth; delete   body: { id }
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'

function shapeTournament(t) {
  return {
    id:       t.id,
    name:     t.name,
    location: t.location,
    days: (t.days || [])
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        id:         d.id,
        label:      d.label,
        date:       d.date,
        start_time: d.start_time,
        end_time:   d.end_time,
        tz:         d.tz,
        streams:    d.streams || [],
        // Legacy camera fields for backward compat with the frontend
        camera1_url:  d.streams?.[0]?.url  || null,
        camera1_name: d.streams?.[0]?.name || null,
        camera2_url:  d.streams?.[1]?.url  || null,
        camera2_name: d.streams?.[1]?.name || null,
      })),
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const tenantId = req.headers['x-tenant-id']
      let query = supabase
        .from('tournaments')
        .select('*, days:tournament_days(*)')
        .order('id')
      if (tenantId) query = query.eq('tenant_id', tenantId)
      const { data, error } = await query
      if (error) throw error
      return res.status(200).json(data.map(shapeTournament))
    }

    const session = await resolveTenantSession(req)
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    if (!session.tenantId || !canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

    if (req.method === 'POST') {
      const { name, location = '' } = req.body || {}
      if (!name) return res.status(400).json({ error: 'name is required' })
      const { data, error } = await supabase
        .from('tournaments')
        .insert({ name, location, tenant_id: session.tenantId })
        .select()
        .single()
      if (error) throw error
      return res.status(201).json(shapeTournament({ ...data, days: [] }))
    }

    if (req.method === 'PUT') {
      const { id, name, location } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })
      const patch = {}
      if (name     !== undefined) patch.name     = name
      if (location !== undefined) patch.location = location
      const { data, error } = await supabase
        .from('tournaments')
        .update(patch)
        .eq('id', id)
        .eq('tenant_id', session.tenantId)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id is required' })
      const { error } = await supabase.from('tournaments').delete().eq('id', id).eq('tenant_id', session.tenantId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[tournaments]', err)
    return res.status(500).json({ error: err.message })
  }
}
