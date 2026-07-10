/**
 * One-off bootstrap: create the first Super Admin account.
 *
 * Run this AFTER the multi-tenant migration block in supabase/schema.sql has
 * been applied (needs the `profiles` table to exist).
 *
 * Usage:
 *   node scripts/bootstrap-super-admin.mjs you@example.com "some-strong-password"
 *
 * Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

function loadEnvLocal() {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnvLocal()

const [, , email, password] = process.argv
if (!email || !password) {
  console.error('Usage: node scripts/bootstrap-super-admin.mjs <email> <password>')
  process.exit(1)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function main() {
  const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const found = existing?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

  let userId
  if (found) {
    userId = found.id
    console.log(`User ${email} already exists (${userId}) — promoting to Super Admin.`)
  } else {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    userId = created.user.id
    console.log(`Created user ${email} (${userId}).`)
  }

  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, is_super_admin: true }, { onConflict: 'id' })
  if (upsertErr) throw upsertErr

  console.log(`✔ ${email} is now a Super Admin.`)
}

main().catch(err => {
  console.error('Failed:', err.message)
  process.exit(1)
})
