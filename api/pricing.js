/**
 * /api/pricing
 * GET — Super Admin only; returns current pricing config
 * PUT — Super Admin only; update pricing config
 *
 * Global data — not scoped to any tenant.
 */

import { verifyToken, isSuperAdmin } from './_utils/auth.js'
import { supabase }      from './_utils/supabase.js'

export const DEFAULT_PRICING = {
  feed_rate_per_hr:  15.00,
  cdn_rate_per_gb:    0.05,
  gb_per_50_min:      4,
  channel_overrides: {},
}

export async function readPricing() {
  try {
    const { data, error } = await supabase
      .from('pricing')
      .select('*')
      .eq('id', 'default')
      .single()
    if (error || !data) return { ...DEFAULT_PRICING }
    return {
      feed_rate_per_hr:  Number(data.feed_rate_per_hr),
      cdn_rate_per_gb:   Number(data.cdn_rate_per_gb),
      gb_per_50_min:     Number(data.gb_per_50_min),
      channel_overrides: data.channel_overrides || {},
    }
  } catch {
    return { ...DEFAULT_PRICING }
  }
}

export default async function handler(req, res) {
  try {
    const session = await verifyToken(req.headers.authorization)
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Forbidden' })

    if (req.method === 'GET') {
      return res.status(200).json(await readPricing())
    }

    if (req.method === 'PUT') {
      const current = await readPricing()
      const { feed_rate_per_hr, cdn_rate_per_gb, gb_per_50_min, channel_overrides } = req.body || {}
      const updated = {
        ...current,
        ...(feed_rate_per_hr  !== undefined && { feed_rate_per_hr:  Number(feed_rate_per_hr) }),
        ...(cdn_rate_per_gb   !== undefined && { cdn_rate_per_gb:   Number(cdn_rate_per_gb) }),
        ...(gb_per_50_min     !== undefined && { gb_per_50_min:     Number(gb_per_50_min) }),
        ...(channel_overrides !== undefined && { channel_overrides }),
      }
      const { error } = await supabase
        .from('pricing')
        .upsert({ id: 'default', ...updated })
      if (error) throw error
      return res.status(200).json(updated)
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[pricing]', err)
    return res.status(500).json({ error: err.message })
  }
}
