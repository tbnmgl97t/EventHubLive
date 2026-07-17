/**
 * POST /api/fast-test-connection
 * Body: { apiKey }
 *
 * Verifies a Pop-up Channels (FAST) API key works, without needing a
 * specific channel id — just lists channels. Used by the Settings UI's
 * "Test Connection" button before saving the key.
 */

import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { getChannels }          from './_utils/fast-channels.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) return res.status(403).json({ error: 'Not a member of this tenant' })
  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  const { apiKey } = req.body || {}
  if (!apiKey) return res.status(400).json({ error: 'apiKey is required' })

  try {
    const channels = await getChannels({ apiKey })
    return res.status(200).json({ ok: true, channel_count: channels.length })
  } catch (err) {
    return res.status(err.status || 502).json({ ok: false, error: err.message })
  }
}
