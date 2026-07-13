import { randomInt } from 'crypto'
import { verifyToken, isSuperAdmin } from './_utils/auth.js'
import { supabase } from './_utils/supabase.js'

// Random 8-char mixed-case alphanumeric ID, matching the style of JW Player's
// own Property IDs (e.g. "Yal8cmyO") — opaque, not derived from user input.
const ID_CHARS  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const ID_LENGTH = 8

function generateTenantId() {
  let id = ''
  for (let i = 0; i < ID_LENGTH; i++) id += ID_CHARS[randomInt(ID_CHARS.length)]
  return id
}

// Super Admin only — create/list/update client organizations.
export default async function handler(req, res) {
  const session = await verifyToken(req.headers.authorization)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, slug, title, timezone, jw_site_id, jw_api_secret')
      .order('title')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({
      tenants: data.map(t => ({
        id: t.id,
        slug: t.slug,
        name: t.title,
        timezone: t.timezone,
        jwSiteId: t.jw_site_id || null,
        jwConfigured: !!(t.jw_site_id && t.jw_api_secret),
      })),
    })
  }

  if (req.method === 'POST') {
    const { name, slug, timezone, jwSiteId, jwApiSecret } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })

    let data, error
    for (let attempt = 0; attempt < 5; attempt++) {
      ;({ data, error } = await supabase
        .from('tenants')
        .insert({
          id: generateTenantId(),
          slug: slug?.trim() || null,
          title: name.trim(),
          timezone: timezone || 'America/New_York',
          jw_site_id: jwSiteId?.trim() || null,
          jw_api_secret: jwApiSecret?.trim() || null,
        })
        .select()
        .single())
      // Retry only on an id collision (astronomically rare); any other
      // error (e.g. a duplicate slug) is a real validation failure.
      if (!error || error.code !== '23505' || error.message.includes('slug')) break
    }
    if (error) return res.status(400).json({ error: error.message })
    return res.status(201).json({ tenant: { id: data.id, slug: data.slug, name: data.title } })
  }

  if (req.method === 'PATCH') {
    const { id, name, timezone, jwSiteId, jwApiSecret } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id is required' })

    const updates = {}
    if (name !== undefined) updates.title = name
    if (timezone !== undefined) updates.timezone = timezone
    if (jwSiteId !== undefined) updates.jw_site_id = jwSiteId
    if (jwApiSecret !== undefined) updates.jw_api_secret = jwApiSecret

    const { error } = await supabase.from('tenants').update(updates).eq('id', id)
    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
