/**
 * /api/schedule  — backward-compat read-only endpoint.
 *
 * GET returns a flat array of all days across all tournaments,
 * matching the shape the frontend previously expected.
 *
 * Mutations (POST/PUT/DELETE) are still supported but route through
 * tournament-days internally so that all data stays in the `tournaments`
 * Edge Config key.
 */

import { resolveTenantSession }              from './_utils/tenant.js'
import { canWrite }                          from './_utils/auth.js'
import { readTournaments, writeTournaments } from './_utils/tournaments.js'

/** Flatten all tournament days into a single sorted array. */
function flattenDays(tournaments) {
  return tournaments
    .flatMap(t => (t.days || []).map(d => ({ ...d, tournament_id: t.id })))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export default async function handler(req, res) {
  // GET is public — the main app reads without auth
  if (req.method !== 'GET') {
    const session = await resolveTenantSession(req)
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    if (!session.tenantId || !canWrite(session)) return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    if (req.method === 'GET') {
      const tournaments = await readTournaments()
      return res.status(200).json(flattenDays(tournaments))
    }

    const tournaments = await readTournaments()

    // ── Camera assignment (PUT) — find the day and update it ──────────────────
    if (req.method === 'PUT') {
      const { id, camera1_url, camera1_name, camera2_url, camera2_name,
              label, date, start_time, end_time, tz } = req.body
      if (!id) return res.status(400).json({ error: 'id is required' })

      let found = false
      const updated = tournaments.map(t => {
        const dIdx = t.days.findIndex(d => d.id === Number(id))
        if (dIdx === -1) return t
        found = true
        const days = [...t.days]
        days[dIdx] = {
          ...days[dIdx],
          ...(label      !== undefined && { label }),
          ...(date       !== undefined && { date }),
          ...(start_time !== undefined && { start_time }),
          ...(end_time   !== undefined && { end_time }),
          ...(tz         !== undefined && { tz }),
          camera1_url:  camera1_url  !== undefined ? (camera1_url  ?? null) : days[dIdx].camera1_url,
          camera1_name: camera1_name !== undefined ? (camera1_name ?? null) : days[dIdx].camera1_name,
          camera2_url:  camera2_url  !== undefined ? (camera2_url  ?? null) : days[dIdx].camera2_url,
          camera2_name: camera2_name !== undefined ? (camera2_name ?? null) : days[dIdx].camera2_name,
        }
        return { ...t, days }
      })
      if (!found) return res.status(404).json({ error: 'Day not found' })
      await writeTournaments(updated)
      const flat = flattenDays(updated)
      return res.status(200).json(flat.find(d => d.id === Number(id)))
    }

    // ── Add day (POST) — requires tournament_id ───────────────────────────────
    if (req.method === 'POST') {
      const { tournament_id = 1, label, date, start_time, end_time,
              tz = 'EDT', camera1_url = null, camera1_name = null,
              camera2_url = null, camera2_name = null } = req.body
      if (!label || !date || !start_time || !end_time) {
        return res.status(400).json({ error: 'label, date, start_time, end_time are required' })
      }
      const tIdx = tournaments.findIndex(t => t.id === Number(tournament_id))
      if (tIdx === -1) return res.status(404).json({ error: 'Tournament not found' })

      const days = tournaments[tIdx].days || []
      const newId = Math.max(0, ...days.map(d => d.id)) + 1
      const created = { id: newId, label, date, start_time, end_time, tz,
                        camera1_url, camera1_name, camera2_url, camera2_name }
      const updatedT = { ...tournaments[tIdx], days: [...days, created].sort((a, b) => a.date.localeCompare(b.date)) }
      const updated = [...tournaments]
      updated[tIdx] = updatedT
      await writeTournaments(updated)
      return res.status(201).json(created)
    }

    // ── Delete day ────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id is required' })
      const updated = tournaments.map(t => ({
        ...t,
        days: t.days.filter(d => d.id !== Number(id)),
      }))
      await writeTournaments(updated)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[schedule]', err)
    return res.status(500).json({ error: err.message })
  }
}
