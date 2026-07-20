# HLS Watcher Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "HLS Watcher" management feature: a user registers a stream (name + manifest URL), which triggers a trigger.dev task (`hls-watcher`) that writes segment/SCTE-35 events into the `hlsparser` schema; the user then watches those events live via Supabase Realtime.

**Architecture:** New nav item under the existing `MANAGEMENT` section in `Admin.jsx`, following the exact `encoders` tab pattern (index list route + detail route). A new API file (`api/hls-watcher-streams.js`) creates the `hls_streams` row and triggers the trigger.dev task server-side (keeping `TRIGGER_SECRET_KEY` off the client). The detail screen subscribes directly to Postgres changes via the browser's existing anon-key Supabase client, which requires a follow-up migration granting `anon`/`authenticated` read access and enabling Realtime on the two `hlsparser` tables (currently `service_role`-only).

**Tech Stack:** Same as the rest of this app — React + MUI, `react-router-dom`, Vercel serverless functions, Supabase (Postgres + PostgREST + Realtime).

## Global Constraints

- Follow `api/encoders.js`'s exact auth pattern: `resolveTenantSession(req)` → 401 if null, 403 if no `tenantId`/`tenantRole`, `canWrite(session)` gate before any write.
- Follow `Admin.jsx`'s exact nav/routing pattern (`PATH_MAP`, `tabToPath`, `NAV_ITEMS`, `<Routes>` block) — this file is large; only touch the specific lines needed, don't restructure it.
- No RLS on the new tables — matches every other table in this app. Tenant isolation for Realtime is enforced by what the client subscribes to (`stream_id=eq.<id>`), not the database. This is a known, accepted gap consistent with the rest of the app.
- `TRIGGER_SECRET_KEY` is a server-only secret — never send it to the browser. It must be added to Vercel env vars manually (cannot be scripted from here).
- The "track details" link shown after creating a stream points at our own `/admin/hlswatcher/<id>` route — never a trigger.dev dashboard URL.
- trigger.dev task id is the literal string `hls-watcher`.

Design discussed and approved in-conversation (2026-07-19) — no separate spec doc for this increment, building directly on `docs/superpowers/specs/2026-07-19-hls-parser-events-design.md`.

---

### Task 1: Grant Realtime access on `hlsparser` tables

**Files:**
- Create: `supabase/migrations/20260719_hlsparser_realtime_access.sql`

**Interfaces:**
- Produces: `anon`/`authenticated` roles can `select` from `hlsparser.hls_streams` and `hlsparser.hls_parser_events`, and both tables are added to the `supabase_realtime` publication — required by Task 4's browser-side subscription.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260719_hlsparser_realtime_access.sql`:

```sql
-- Grants the browser (anon/authenticated, via supabase-js) read access to the
-- hlsparser tables and enables Postgres Realtime so the HLS Watcher tracker
-- screen can subscribe to live inserts. See docs/superpowers/specs/2026-07-19-hls-parser-events-design.md.

grant usage on schema hlsparser to anon, authenticated;
grant select on all tables in schema hlsparser to anon, authenticated;
alter default privileges in schema hlsparser grant select on tables to anon, authenticated;

alter publication supabase_realtime add table hlsparser.hls_streams;
alter publication supabase_realtime add table hlsparser.hls_parser_events;
```

- [ ] **Step 2: Apply it against the live database**

Split into individual statements and run each via `supabase db query --file <stmt> --db-url "$POSTGRES_URL_NON_POOLING"`, the same way `20260719_hlsparser_schema.sql` was applied (the CLI's `db query` can't run multi-statement files in one call). Confirm each returns `GRANT` / `ALTER DEFAULT PRIVILEGES` / `ALTER PUBLICATION` with no errors.

- [ ] **Step 3: Verify**

Run:
```bash
set -a && source .env.local && set +a
npx supabase db query "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'hlsparser';" --db-url "$POSTGRES_URL_NON_POOLING"
```
Expected: both `hls_streams` and `hls_parser_events` listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260719_hlsparser_realtime_access.sql
git commit -m "Grant anon/authenticated read + enable Realtime on hlsparser tables"
```

---

### Task 2: `api/hls-watcher-streams.js` — create stream + trigger the task

**Files:**
- Create: `api/hls-watcher-streams.js`

**Interfaces:**
- Consumes: `resolveTenantSession` / `canWrite` from `api/_utils/tenant.js` / `api/_utils/auth.js`; `hlsParserDb` from `api/_utils/supabase.js` (added in this task, since it wasn't added earlier — see Step 1).
- Produces: `GET /api/hls-watcher-streams` → `{ streams: [...] }` (tenant-scoped). `POST /api/hls-watcher-streams { name, manifest_url }` → `{ id, name, manifest_url, trigger_ok, trigger_error }`. Task 3's frontend calls exactly these.

- [ ] **Step 1: Add the `hlsParserDb` client export (deferred from the schema plan)**

Modify `api/_utils/supabase.js` — append after the existing `supabase` export:

```js
// Client scoped to the hlsparser schema (HLS segment/SCTE-35 parser events).
export const hlsParserDb = createClient(url, key, {
  db: { schema: 'hlsparser' },
  auth: { persistSession: false },
})
```

- [ ] **Step 2: Write the API handler**

Create `api/hls-watcher-streams.js`:

```js
/**
 * GET  /api/hls-watcher-streams          -> list this tenant's hls_streams
 * POST /api/hls-watcher-streams { name, manifest_url } -> create a stream row
 *   and trigger the trigger.dev 'hls-watcher' task with { streamId, manifestUrl }.
 *   The task itself writes current_task_id/session_status back onto the row
 *   once it starts running — this endpoint never writes a task id.
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
    const { name, manifest_url } = req.body || {}
    if (!name || !manifest_url) {
      return res.status(400).json({ error: 'name and manifest_url are required' })
    }

    const { data: stream, error: insertError } = await hlsParserDb
      .from('hls_streams')
      .insert({ tenant_id: session.tenantId, name, manifest_url })
      .select()
      .single()
    if (insertError) return res.status(500).json({ error: insertError.message })

    let triggerOk = true
    let triggerError = null
    try {
      const triggerRes = await fetch(`https://api.trigger.dev/api/v1/tasks/${TRIGGER_TASK_ID}/trigger`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.TRIGGER_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: { streamId: stream.id, manifestUrl: manifest_url } }),
      })
      if (!triggerRes.ok) {
        const text = await triggerRes.text()
        throw new Error(`trigger.dev returned ${triggerRes.status}: ${text}`)
      }
    } catch (err) {
      triggerOk = false
      triggerError = err.message
      console.error('[hls-watcher-streams] failed to trigger task:', err.message)
    }

    return res.status(200).json({ ...stream, trigger_ok: triggerOk, trigger_error: triggerError })
  }

  return res.status(405).end()
}
```

- [ ] **Step 3: Verify the file has no syntax errors**

Run: `node --check api/hls-watcher-streams.js && node --check api/_utils/supabase.js`
Expected: no output (exit code 0) from both.

- [ ] **Step 4: Commit**

```bash
git add api/_utils/supabase.js api/hls-watcher-streams.js
git commit -m "Add hls-watcher-streams API: create hls_streams row + trigger trigger.dev task"
```

---

### Task 3: Frontend — Add Stream screen (`HlsWatcher.jsx`)

**Files:**
- Create: `src/components/HlsWatcher.jsx`

**Interfaces:**
- Consumes: `GET`/`POST /api/hls-watcher-streams` (Task 2); `authHeader(token, tenantId)` — duplicated locally the same way other standalone components under `src/components/` build their own headers (see `EncoderList.jsx` pattern) since `authHeader` is a private helper inside `Admin.jsx`, not exported.
- Produces: renders at the `hlswatcher` tab's index route (wired in Task 5). Links to `/admin/hlswatcher/:id` for Task 4's tracker.

- [ ] **Step 1: Write the component**

Create `src/components/HlsWatcher.jsx`:

```jsx
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Box, Typography, Button, TextField, CircularProgress, Alert,
  Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material'

function authHeader(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

export default function HlsWatcher({ token, tenantId, readOnly }) {
  const [streams, setStreams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [manifestUrl, setManifestUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [lastCreatedId, setLastCreatedId] = useState(null)

  async function fetchStreams() {
    setLoading(true)
    try {
      const res = await fetch('/api/hls-watcher-streams', { headers: authHeader(token, tenantId) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load streams')
      setStreams(data.streams || [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStreams() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    setLastCreatedId(null)
    try {
      const res = await fetch('/api/hls-watcher-streams', {
        method: 'POST',
        headers: authHeader(token, tenantId),
        body: JSON.stringify({ name, manifest_url: manifestUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create stream')
      if (!data.trigger_ok) {
        setSubmitError(`Stream created, but the parser task failed to start: ${data.trigger_error}`)
      }
      setLastCreatedId(data.id)
      setName('')
      setManifestUrl('')
      fetchStreams()
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {!readOnly && (
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
          <Typography sx={{ fontWeight: 700, color: '#fff' }}>Add Stream</Typography>
          <TextField label="Name" value={name} onChange={e => setName(e.target.value)} required size="small" />
          <TextField label="Manifest URL" value={manifestUrl} onChange={e => setManifestUrl(e.target.value)} required size="small" />
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={20} /> : 'Add Stream'}
          </Button>
          {submitError && <Alert severity="warning">{submitError}</Alert>}
          {lastCreatedId && !submitError && (
            <Alert severity="success">
              Stream created — <Link to={`/admin/hlswatcher/${lastCreatedId}`}>track it here</Link>
            </Alert>
          )}
        </Box>
      )}

      <Box>
        <Typography sx={{ fontWeight: 700, color: '#fff', mb: 1 }}>Streams</Typography>
        {loading && <CircularProgress size={20} />}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !error && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Manifest URL</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {streams.map(s => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.manifest_url}</TableCell>
                  <TableCell>{s.session_status || 'not started'}</TableCell>
                  <TableCell><Link to={`/admin/hlswatcher/${s.id}`}>Track</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `npx --yes @babel/cli --version >/dev/null 2>&1; node --input-type=module -e "import('./src/components/HlsWatcher.jsx').catch(e=>{console.error(e.message);process.exit(1)})"`
This will fail to resolve JSX in plain Node — instead verify by running the Vite dev server build check in Task 6, which compiles the whole app. Skip a standalone check here.

- [ ] **Step 3: Commit**

```bash
git add src/components/HlsWatcher.jsx
git commit -m "Add HlsWatcher component: stream list + add-stream form"
```

---

### Task 4: Frontend — Track Stream screen (`HlsStreamTracker.jsx`)

**Files:**
- Create: `src/components/HlsStreamTracker.jsx`

**Interfaces:**
- Consumes: `supabase` client from `src/lib/supabaseClient.js` (anon key) — reads `hlsparser.hls_streams`/`hlsparser.hls_parser_events` directly via `.schema('hlsparser')`, relying on Task 1's grants. `useParams()` for the `:id` route param (wired in Task 5).

- [ ] **Step 1: Write the component**

Create `src/components/HlsStreamTracker.jsx`:

```jsx
import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, Typography, Chip, Alert, CircularProgress, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { supabase } from '../lib/supabaseClient'

export default function HlsStreamTracker() {
  const { id } = useParams()
  const [stream, setStream] = useState(null)
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const hlsDb = supabase.schema('hlsparser')

    async function loadInitial() {
      const { data: streamData, error: streamErr } = await hlsDb
        .from('hls_streams').select('*').eq('id', id).single()
      if (cancelled) return
      if (streamErr) { setError(streamErr.message); return }
      setStream(streamData)

      const { data: eventData, error: eventErr } = await hlsDb
        .from('hls_parser_events').select('*').eq('stream_id', id)
        .order('occurred_at', { ascending: false }).limit(200)
      if (cancelled) return
      if (eventErr) { setError(eventErr.message); return }
      setEvents(eventData || [])
    }
    loadInitial()

    const channel = supabase
      .channel(`hls-stream-${id}`)
      .on('postgres_changes', { event: '*', schema: 'hlsparser', table: 'hls_streams', filter: `id=eq.${id}` },
        payload => setStream(payload.new))
      .on('postgres_changes', { event: 'INSERT', schema: 'hlsparser', table: 'hls_parser_events', filter: `stream_id=eq.${id}` },
        payload => setEvents(prev => [payload.new, ...prev].slice(0, 200)))
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [id])

  if (error) return <Alert severity="error">{error}</Alert>
  if (!stream) return <CircularProgress size={20} />

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Link to="/admin/hlswatcher" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8' }}>
        <ArrowBackIcon fontSize="small" /> Back to streams
      </Link>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ fontWeight: 700, color: '#fff', fontSize: '1.1rem' }}>{stream.name}</Typography>
        <Chip size="small" label={stream.session_status || 'not started'} />
        {stream.current_task_id && <Chip size="small" variant="outlined" label={`task: ${stream.current_task_id}`} />}
      </Box>
      <Typography sx={{ color: '#94a3b8', fontSize: '0.8rem' }}>{stream.manifest_url}</Typography>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Occurred</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Payload</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {events.map(ev => (
            <TableRow key={ev.id}>
              <TableCell>{new Date(ev.occurred_at).toLocaleTimeString()}</TableCell>
              <TableCell>{ev.type}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{JSON.stringify(ev.payload)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/HlsStreamTracker.jsx
git commit -m "Add HlsStreamTracker component: realtime event feed for one stream"
```

---

### Task 5: Wire into `Admin.jsx`

**Files:**
- Modify: `src/components/Admin.jsx`

- [ ] **Step 1: Import the new components**

Near the top, alongside `import EncoderControl from './EncoderControl'`, add:
```js
import HlsWatcher from './HlsWatcher'
import HlsStreamTracker from './HlsStreamTracker'
```

- [ ] **Step 2: Add to `PATH_MAP` and `tabToPath`**

In `PATH_MAP` (around line 4898), add:
```js
  '/admin/hlswatcher':  { activeTab: 'hlswatcher',  dashboardView: 'streams' },
```
In `tabToPath` (around line 4909), add:
```js
  if (tab === 'hlswatcher') return '/admin/hlswatcher'
```

- [ ] **Step 3: Extend the `startsWith` fallback for nested routes**

Around line 4948-4949, change:
```js
  const { activeTab, dashboardView } = PATH_MAP[location.pathname]
    || (location.pathname.startsWith('/admin/encoders') ? { activeTab: 'encoders', dashboardView: 'streams' } : { activeTab: 'dashboard', dashboardView: 'streams' })
```
to:
```js
  const { activeTab, dashboardView } = PATH_MAP[location.pathname]
    || (location.pathname.startsWith('/admin/encoders') ? { activeTab: 'encoders', dashboardView: 'streams' }
    : location.pathname.startsWith('/admin/hlswatcher') ? { activeTab: 'hlswatcher', dashboardView: 'streams' }
    : { activeTab: 'dashboard', dashboardView: 'streams' })
```

- [ ] **Step 4: Add the nav item**

In `NAV_ITEMS` (around line 5290-5295), add `HLS Watcher` after `Routers`:
```js
  const NAV_ITEMS = [
    { section: 'MANAGEMENT', items: [
      { label: 'Live Streams',    tab: 'dashboard', view: 'streams', count: channels.length },
      { label: 'Encoders',        tab: 'encoders',  view: null },
      { label: 'Routers',         tab: 'routers',   view: null },
      { label: 'HLS Watcher',     tab: 'hlswatcher', view: null },
    ]},
```

- [ ] **Step 5: Add the tab's `<Routes>` block**

After the `routers` block (around line 6060), add:
```jsx
          {activeTab === 'hlswatcher' && (
            <Box sx={{ p: { xs: 1, sm: 2 } }}>
              <Routes>
                <Route index element={<HlsWatcher token={token} tenantId={tenantId} readOnly={isReadOnly} />} />
                <Route path=":id" element={<HlsStreamTracker />} />
              </Routes>
            </Box>
          )}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Admin.jsx
git commit -m "Wire HLS Watcher into the Management nav"
```

---

### Task 6: Build check + manual env var setup

**Files:** none (verification + manual infra step)

- [ ] **Step 1: Run the production build to catch syntax/import errors across all new files**

Run: `npm run build`
Expected: build succeeds (exit code 0). If it fails, the error output names the file/line to fix — fix and rerun before proceeding.

- [ ] **Step 2: Add `TRIGGER_SECRET_KEY` to Vercel (manual, cannot be scripted)**

```bash
vercel env add TRIGGER_SECRET_KEY development
vercel env add TRIGGER_SECRET_KEY production
```
Then pull it locally:
```bash
vercel env pull .env.local
```

- [ ] **Step 3: Manual smoke test**

Run `npm run dev:api`, log into `/admin`, open **HLS Watcher** in the nav, add a stream, confirm the "track it here" link appears and navigates to `/admin/hlswatcher/<id>` showing the stream's name/URL (events will only appear once the `hls-watcher` trigger.dev task is actually deployed and running in `sctemarker-parser` — that's tracked separately, not part of this plan).
