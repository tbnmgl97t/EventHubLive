/**
 * GET  /api/hls-watcher-streams          -> list this tenant's hls_streams
 * POST /api/hls-watcher-streams { name, url, duration, ad_config_id } -> create
 *   a stream row and trigger the trigger.dev 'hls-watcher' task with
 *   { streamId, url, duration, tenantId, name } (tenantId always comes from
 *   the resolved session, never the request body, to prevent a caller from
 *   triggering a task under a tenant they don't belong to). ad_config_id is
 *   stored on the row only — the task doesn't need it, it's read later by
 *   api/hls-watcher-ssai-url.js to build a preview URL on the monitoring screen.
 *   The run id from trigger.dev's response is saved onto current_task_id, and
 *   session_status is set to 'running' (or 'failed' if triggering itself fails).
 *
 * Triggered via @trigger.dev/sdk (not the raw REST endpoint) specifically to
 * pass a per-run maxDuration override — the REST /trigger endpoint's options
 * object doesn't support maxDuration, only the SDK's tasks.trigger() does.
 * The task itself already exits gracefully once `duration` seconds elapse
 * (closing its own loop cleanly and returning a summary); maxDuration here is
 * a platform-enforced safety net set slightly above that, in case the
 * graceful loop never returns (e.g. a hung fetch) — trigger.dev will hard-kill
 * the run at that point, but note it then skips the task's own cleanup and
 * return value entirely. See https://trigger.dev/docs/runs/max-duration
 *
 * clientConfig.previewBranch is forced to '' on every call below because the
 * SDK auto-detects a git branch from VERCEL_GIT_COMMIT_REF (set on every
 * Vercel deployment, preview or production) and otherwise tries to scope the
 * trigger to a trigger.dev "preview branch" environment matching that branch
 * name — which we don't use, and which 404s with "No matching branch env"
 * since no such branch environment exists in this trigger.dev project. An
 * empty string short-circuits that lookup so the call targets whichever
 * environment TRIGGER_SECRET_KEY itself belongs to (dev/prod), same as the
 * plain REST endpoint did before this switched to the SDK.
 *
 * session_status is kept in sync with trigger.dev's real run status by
 * api/cron-sync-hls-status.js, not by anything in this file after the
 * initial trigger-time write above.
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }              from './_utils/auth.js'
import { hlsParserDb }            from './_utils/supabase.js'
import { tasks }                 from '@trigger.dev/sdk/v3'

const TRIGGER_TASK_ID = 'hls-watcher'
// Grace period added on top of the requested duration before trigger.dev's
// own maxDuration kill-switch fires, so the task's graceful exit gets to run
// first under normal conditions.
const MAX_DURATION_BUFFER_SECONDS = 30

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
    const { name, url, duration, ad_config_id: adConfigId } = req.body || {}
    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' })
    }
    if (duration !== undefined && (typeof duration !== 'number' || duration <= 0)) {
      return res.status(400).json({ error: 'duration must be a positive number of seconds' })
    }

    const { data: stream, error: insertError } = await hlsParserDb
      .from('hls_streams')
      .insert({
        tenant_id: session.tenantId, name, manifest_url: url,
        duration_seconds: duration ?? null, ad_config_id: adConfigId || null,
      })
      .select()
      .single()
    if (insertError) return res.status(500).json({ error: insertError.message })

    let triggerOk = true
    let triggerError = null
    let runId = null
    try {
      const handle = await tasks.trigger(
        TRIGGER_TASK_ID,
        { streamId: stream.id, url, duration, tenantId: session.tenantId, name },
        duration ? { maxDuration: duration + MAX_DURATION_BUFFER_SECONDS } : {},
        { clientConfig: { previewBranch: '' } },
      )
      runId = handle.id
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
