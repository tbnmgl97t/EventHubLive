/**
 * GET  /api/hls-watcher-streams          -> list this tenant's hls_streams
 * POST /api/hls-watcher-streams { name, url, duration } -> create a stream row
 *   and trigger the trigger.dev 'hls-watcher' task with
 *   { streamId, url, duration, tenantId, name } (tenantId always comes from
 *   the resolved session, never the request body, to prevent a caller from
 *   triggering a task under a tenant they don't belong to).
 *   The run id from trigger.dev's response is saved onto current_task_id, and
 *   session_status is set to 'running' (or 'failed' if triggering itself fails).
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }              from './_utils/auth.js'
import { hlsParserDb }            from './_utils/supabase.js'

const TRIGGER_TASK_ID = 'hls-watcher'

export default async function handler(req, res) {
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }

  if (req.method === 'GET') {
    const { data, error } = await hlsParserDb
      .from('hls_streams')
      .select('*')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ streams: data || [] })
  }

  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'POST') {
    const { name, url, duration } = req.body || {}
    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' })
    }
    if (duration !== undefined && (typeof duration !== 'number' || duration <= 0)) {
      return res.status(400).json({ error: 'duration must be a positive number of seconds' })
    }

    const { data: stream, error: insertError } = await hlsParserDb
      .from('hls_streams')
      .insert({ tenant_id: session.tenantId, name, manifest_url: url, duration_seconds: duration ?? null })
      .select()
      .single()
    if (insertError) return res.status(500).json({ error: insertError.message })

    let triggerOk = true
    let triggerError = null
    let runId = null
    try {
      const triggerRes = await fetch(`https://api.trigger.dev/api/v1/tasks/${TRIGGER_TASK_ID}/trigger`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.TRIGGER_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: { streamId: stream.id, url, duration, tenantId: session.tenantId, name },
        }),
      })
      const triggerData = await triggerRes.json().catch(() => null)
      if (!triggerRes.ok) {
        throw new Error(`trigger.dev returned ${triggerRes.status}: ${JSON.stringify(triggerData)}`)
      }
      runId = triggerData?.id || null
    } catch (err) {
      triggerOk = false
      triggerError = err.message
      console.error('[hls-watcher-streams] failed to trigger task:', err.message)
    }

    const { data: updatedStream, error: updateError } = await hlsParserDb
      .from('hls_streams')
      .update({
        current_task_id: triggerOk ? runId : null,
        session_status: triggerOk ? 'running' : 'failed',
        session_started_at: triggerOk ? new Date().toISOString() : null,
      })
      .eq('id', stream.id)
      .select()
      .single()
    if (updateError) console.error('[hls-watcher-streams] failed to record task id:', updateError.message)

    return res.status(200).json({ ...(updatedStream || stream), trigger_ok: triggerOk, trigger_error: triggerError })
  }

  return res.status(405).end()
}
