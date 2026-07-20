# HLS Parser Event Logging Schema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `hlsparser` Postgres schema (`hls_streams` + `hls_parser_events`) so the trigger.dev-based HLS parser has somewhere to write segment/SCTE-35 events, reachable from `supabase-js` the same way the rest of this app talks to Postgres.

**Architecture:** A new, dedicated `hlsparser` Postgres schema (not `public`) holds a stream registry (`hls_streams`) and a generic append-only event log (`hls_parser_events`) with an open-ended `type` column and a `payload` jsonb catch-all. Applied as a plain SQL migration file (this repo has no migration runner — SQL files in `supabase/migrations/` are applied by hand via the Supabase SQL editor or CLI), then exposed to PostgREST and wired into a dedicated `supabase-js` client.

**Tech Stack:** Supabase (Postgres + PostgREST), `@supabase/supabase-js` v2, plain Node.js `.mjs` scripts (no test framework in this repo — verification scripts double as the test cycle, following `scripts/bootstrap-super-admin.mjs`'s pattern).

## Global Constraints

- New tables live in a dedicated `hlsparser` Postgres schema, not `public` (explicit user decision).
- Every table scoped by `tenant_id text references public.tenants(id)`, matching every existing table in this repo (`encoders`, `streams`, etc.).
- No RLS — tenant isolation is enforced in application code, matching every other table in this codebase.
- `type` on `hls_parser_events` stays open-ended text, no `check` constraint — new event shapes must not require a migration.
- No dedup/unique constraint on events, no derived `ad_breaks` table, no retention policy — all three are explicit, documented deferrals in the spec, not oversights. Don't add them in this plan.
- Migrations are applied manually via the Supabase SQL editor or CLI — this repo has no `db:push`/`db:migrate` script (see `README.md`).
- Follow the existing `api/_utils/supabase.js` client pattern (service-role key, `auth: { persistSession: false }`) for any new Supabase client.

Spec: `docs/superpowers/specs/2026-07-19-hls-parser-events-design.md`

---

### Task 1: `hlsparser` schema migration + verification script

**Files:**
- Create: `supabase/migrations/20260719_hlsparser_schema.sql`
- Create: `scripts/verify-hlsparser-schema.mjs`
- Test: `scripts/verify-hlsparser-schema.mjs` (run manually — this repo has no automated test runner; this script *is* the test cycle)

**Interfaces:**
- Produces: `hlsparser.hls_streams` table (columns: `id`, `tenant_id`, `name`, `manifest_url`, `active`, `current_task_id`, `session_status`, `session_started_at`, `last_polled_at`, `last_sequence`, `created_at`) and `hlsparser.hls_parser_events` table (columns: `id`, `tenant_id`, `stream_id`, `task_id`, `type`, `occurred_at`, `payload`, `created_at`) — later tasks (the trigger.dev parser itself) write to these two tables via those exact column names.

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-hlsparser-schema.mjs`:

```js
/**
 * Verifies the hlsparser schema exists and is reachable via supabase-js.
 *
 * Inserts a throwaway hls_streams + hls_parser_events row, checks the
 * payload shape round-trips correctly, then deletes them.
 *
 * Usage:
 *   node scripts/verify-hlsparser-schema.mjs
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

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const publicDb = createClient(url, key, { auth: { persistSession: false } })
const hlsParserDb = createClient(url, key, {
  db: { schema: 'hlsparser' },
  auth: { persistSession: false },
})

async function main() {
  // hls_streams.tenant_id references public.tenants(id) — make sure the
  // 'default' tenant exists regardless of which environment this runs against.
  const { error: tenantErr } = await publicDb.from('tenants').upsert({ id: 'default' }, { onConflict: 'id' })
  if (tenantErr) throw tenantErr

  const { data: stream, error: streamErr } = await hlsParserDb
    .from('hls_streams')
    .insert({
      tenant_id: 'default',
      name: 'verify-hlsparser-schema test stream',
      manifest_url: 'https://example.com/test.m3u8',
    })
    .select()
    .single()
  if (streamErr) throw streamErr
  console.log(`✔ inserted hls_streams row (${stream.id})`)

  const { data: event, error: eventErr } = await hlsParserDb
    .from('hls_parser_events')
    .insert({
      tenant_id: 'default',
      stream_id: stream.id,
      task_id: 'verify-task',
      type: 'tag',
      occurred_at: new Date().toISOString(),
      payload: { tag: '#EXTM3U', scte35: [] },
    })
    .select()
    .single()
  if (eventErr) throw eventErr
  console.log(`✔ inserted hls_parser_events row (${event.id})`)

  if (event.payload.tag !== '#EXTM3U' || !Array.isArray(event.payload.scte35)) {
    throw new Error(`unexpected payload shape: ${JSON.stringify(event.payload)}`)
  }
  console.log('✔ payload shape matches expected {tag, scte35}')

  await hlsParserDb.from('hls_parser_events').delete().eq('id', event.id)
  await hlsParserDb.from('hls_streams').delete().eq('id', stream.id)
  console.log('✔ cleaned up test rows')

  console.log('\nhlsparser schema verified successfully.')
}

main().catch(err => {
  console.error('Failed:', err.message)
  process.exit(1)
})
```

- [ ] **Step 2: Run it to confirm it fails (schema doesn't exist yet)**

Run: `node scripts/verify-hlsparser-schema.mjs`
Expected: `Failed:` followed by a PostgREST error mentioning the `hlsparser` schema or the `hls_streams` relation not being found (exact wording varies, e.g. "The schema must be one of the following: public" or "relation ... does not exist").

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260719_hlsparser_schema.sql`:

```sql
-- HLS parser event logging — dedicated schema.
-- See docs/superpowers/specs/2026-07-19-hls-parser-events-design.md

create schema if not exists hlsparser;

grant usage on schema hlsparser to service_role;
alter default privileges in schema hlsparser grant all on tables to service_role;

-- ── Stream registry + trigger.dev session tracking ──────────────────────────
create table if not exists hlsparser.hls_streams (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null references public.tenants(id) on delete cascade,
  name                text not null,
  manifest_url        text not null,
  active              boolean not null default true,
  current_task_id     text,
  session_status      text,
  session_started_at  timestamptz,
  last_polled_at      timestamptz,
  last_sequence       bigint,
  created_at          timestamptz not null default now()
);
create index if not exists hls_streams_tenant_idx on hlsparser.hls_streams (tenant_id);
create index if not exists hls_streams_task_idx   on hlsparser.hls_streams (current_task_id);

-- ── Generic append-only parser event log ────────────────────────────────────
-- `type` is intentionally open-ended (no check constraint) — new event
-- shapes go straight into `payload` without a schema change.
create table if not exists hlsparser.hls_parser_events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null references public.tenants(id) on delete cascade,
  stream_id    uuid not null references hlsparser.hls_streams(id) on delete cascade,
  task_id      text not null,
  type         text not null,
  occurred_at  timestamptz not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists hls_parser_events_stream_idx on hlsparser.hls_parser_events (stream_id, occurred_at);
create index if not exists hls_parser_events_task_idx   on hlsparser.hls_parser_events (task_id, occurred_at);
create index if not exists hls_parser_events_type_idx    on hlsparser.hls_parser_events (stream_id, type, occurred_at);

-- Catch-all for tables that existed under a partially-applied prior run of
-- this migration (idempotent — safe to rerun).
grant all on all tables in schema hlsparser to service_role;
```

- [ ] **Step 4: Apply the migration against your Supabase project**

Open the Supabase SQL editor for your project (or use the CLI) and run the
full contents of `supabase/migrations/20260719_hlsparser_schema.sql`, exactly
as the README describes for every other file in `supabase/migrations/`
("Apply these against your Supabase project via the Supabase SQL editor or
CLI").

- [ ] **Step 5: Expose the `hlsparser` schema to PostgREST**

In the Supabase Dashboard: **Settings → API → Data API → Exposed schemas**,
add `hlsparser` to the list (alongside `public`), then save. This is a
one-time, per-project manual step — it cannot be done from SQL. If the next
step still fails with a schema-not-found error after ~30 seconds, click
"Reload schema cache" on that same settings page.

- [ ] **Step 6: Run the verification script again to confirm it passes**

Run: `node scripts/verify-hlsparser-schema.mjs`
Expected:
```
✔ inserted hls_streams row (...)
✔ inserted hls_parser_events row (...)
✔ payload shape matches expected {tag, scte35}
✔ cleaned up test rows

hlsparser schema verified successfully.
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260719_hlsparser_schema.sql scripts/verify-hlsparser-schema.mjs
git commit -m "Add hlsparser schema (hls_streams, hls_parser_events) with verification script"
```

---

### Task 2: Dedicated `hlsParserDb` client in `api/_utils/supabase.js`

**Files:**
- Modify: `api/_utils/supabase.js`
- Modify: `scripts/verify-hlsparser-schema.mjs`

**Interfaces:**
- Consumes: `hlsparser.hls_streams` / `hlsparser.hls_parser_events` tables from Task 1.
- Produces: `hlsParserDb` — a named export from `api/_utils/supabase.js`, a `supabase-js` client pre-scoped to the `hlsparser` schema. Any future API route or script that needs to read/write these tables imports `hlsParserDb` from this file rather than constructing its own client.

- [ ] **Step 1: Add the `hlsParserDb` export**

Modify `api/_utils/supabase.js` (currently ends at line 13 with the `supabase` export) to add:

```js
// Client scoped to the hlsparser schema (HLS segment/SCTE-35 parser events).
// Requires 'hlsparser' to be added under Supabase Dashboard → Settings → API
// → Data API → Exposed schemas — see supabase/migrations/20260719_hlsparser_schema.sql.
export const hlsParserDb = createClient(url, key, {
  db: { schema: 'hlsparser' },
  auth: { persistSession: false },
})
```

The full file should now read:

```js
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
}

// Service-role client — full access, used only in server-side API handlers
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
})

// Client scoped to the hlsparser schema (HLS segment/SCTE-35 parser events).
// Requires 'hlsparser' to be added under Supabase Dashboard → Settings → API
// → Data API → Exposed schemas — see supabase/migrations/20260719_hlsparser_schema.sql.
export const hlsParserDb = createClient(url, key, {
  db: { schema: 'hlsparser' },
  auth: { persistSession: false },
})
```

- [ ] **Step 2: Point the verification script at the shared client**

Modify `scripts/verify-hlsparser-schema.mjs`: replace the two ad hoc
`createClient(...)` calls with a dynamic import of the shared clients. The
import must happen *after* `loadEnvLocal()` runs — `api/_utils/supabase.js`
throws immediately if `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` aren't set
yet, and a static `import` at the top of the file would be hoisted and
evaluated before `loadEnvLocal()` has a chance to populate `process.env`.

Replace:
```js
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const publicDb = createClient(url, key, { auth: { persistSession: false } })
const hlsParserDb = createClient(url, key, {
  db: { schema: 'hlsparser' },
  auth: { persistSession: false },
})
```
with:
```js
const { supabase: publicDb, hlsParserDb } = await import('../api/_utils/supabase.js')
```

Also remove the now-unused `import { createClient } from '@supabase/supabase-js'` line at the top of the file, since the script no longer constructs clients directly.

- [ ] **Step 3: Run the verification script to confirm it still passes**

Run: `node scripts/verify-hlsparser-schema.mjs`
Expected: same output as Task 1 Step 6 —
```
✔ inserted hls_streams row (...)
✔ inserted hls_parser_events row (...)
✔ payload shape matches expected {tag, scte35}
✔ cleaned up test rows

hlsparser schema verified successfully.
```

- [ ] **Step 4: Commit**

```bash
git add api/_utils/supabase.js scripts/verify-hlsparser-schema.mjs
git commit -m "Add hlsParserDb shared client scoped to the hlsparser schema"
```
