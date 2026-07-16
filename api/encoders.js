import { resolveTenantSession } from './_utils/tenant.js'
import { canWrite }             from './_utils/auth.js'
import { supabase }             from './_utils/supabase.js'

const WRITABLE_FIELDS = [
  'name', 'description', 'channel_id', 'channel_name', 'ingest_format', 'region',
  'ingest_point_id', 'ingest_url', 'stream_key',
  'simulcast_youtube', 'simulcast_facebook', 'simulcast_website', 'simulcast_app',
  'vod_recording', 'youtube_broadcast_id', 'youtube_ingest_url', 'youtube_stream_key',
  // BrightSpot publish/unpublish orchestration — stubbed manual id/name pairs
  // until the REST Management API access issue is resolved (see EncoderForm).
  'brightspot_page_id', 'brightspot_page_name',
  'brightspot_video_page_id', 'brightspot_video_page_name',
]

function pickWritable(body) {
  const out = {}
  for (const key of WRITABLE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key]
  }
  return out
}

export default async function handler(req, res) {
  const session = await resolveTenantSession(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if (!session.tenantId || !session.tenantRole) {
    return res.status(403).json({ error: 'Not a member of this tenant' })
  }

  if (req.method === 'GET') {
    const id = req.query?.id
    if (id) {
      const { data, error } = await supabase
        .from('encoders')
        .select('*')
        .eq('tenant_id', session.tenantId)
        .eq('id', id)
        .single()
      if (error || !data) return res.status(404).json({ error: 'Encoder not found' })
      return res.status(200).json(data)
    }
    const { data, error } = await supabase
      .from('encoders')
      .select('*')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ encoders: data || [] })
  }

  if (!canWrite(session)) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'POST') {
    const fields = pickWritable(req.body || {})
    if (!fields.name?.trim())       return res.status(400).json({ error: 'name is required' })
    if (!fields.channel_id?.trim()) return res.status(400).json({ error: 'channel_id is required' })

    const { data, error } = await supabase
      .from('encoders')
      .insert({ ...fields, tenant_id: session.tenantId })
      .select()
      .single()
    if (error) return res.status(400).json({ error: error.message })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    const { id, ...body } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id is required' })
    const fields = pickWritable(body)

    const { data, error } = await supabase
      .from('encoders')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', session.tenantId)
      .select()
      .single()
    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Encoder not found' })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id is required' })

    const { error } = await supabase
      .from('encoders')
      .delete()
      .eq('id', id)
      .eq('tenant_id', session.tenantId)
    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
