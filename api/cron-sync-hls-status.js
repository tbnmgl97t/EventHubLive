/**
 * GET/POST /api/cron-sync-hls-status
 *
 * The hls-watcher trigger.dev task never writes back to hls_streams once
 * it's running (see that task's own module doc comment) -- session_status
 * gets set once at trigger time and then sits stale even after the run
 * actually completes, fails, or expires on trigger.dev. This cron finds
 * every stream still marked 'running' and asks trigger.dev for that run's
 * real status, updating session_status to match.
 *
 * Triggered by Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`
 * — reject anything else so this can't be hit by the public internet.
 */

import { hlsParserDb } from './_utils/supabase.js'

/** null means "still in flight, no change" -- only terminal trigger.dev states map to a new status. */
function mapRunStatus(run) {
  if (run.isSuccess) return 'completed'
  if (run.isCancelled) return 'stopped'
  if (run.isFailed) return 'failed'
  if (run.status === 'EXPIRED') return 'failed' // queued the whole time, never got a worker
  return null
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: streams, error: fetchError } = await hlsParserDb
    .from('hls_streams')
    .select('id, current_task_id')
    .eq('session_status', 'running')
    .not('current_task_id', 'is', null)
  if (fetchError) return res.status(500).json({ error: fetchError.message })

  const results = await Promise.all((streams || []).map(async (stream) => {
    try {
      const runRes = await fetch(`https://api.trigger.dev/api/v3/runs/${stream.current_task_id}`, {
        headers: { Authorization: `Bearer ${process.env.TRIGGER_SECRET_KEY}` },
      })
      if (!runRes.ok) return { id: stream.id, updated: false, error: `trigger.dev returned ${runRes.status}` }

      const run = await runRes.json()
      const newStatus = mapRunStatus(run)
      if (!newStatus) return { id: stream.id, updated: false, status: run.status }

      const { error: updateError } = await hlsParserDb
        .from('hls_streams')
        .update({ session_status: newStatus })
        .eq('id', stream.id)
      if (updateError) return { id: stream.id, updated: false, error: updateError.message }

      return { id: stream.id, updated: true, status: newStatus }
    } catch (err) {
      return { id: stream.id, updated: false, error: err.message }
    }
  }))

  const updated = results.filter((r) => r.updated)
  console.log(`[cron-sync-hls-status] checked ${results.length}, updated ${updated.length}`)

  return res.status(200).json({ checked: results.length, updated: updated.length, results })
}
