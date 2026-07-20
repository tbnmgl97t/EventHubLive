# EventHubLive — Security Review

**Date:** 2026-07-16
**Scope:** React frontend (`src/`), 44 Vercel serverless handlers (`api/`), Supabase data layer, config & dependencies
**Branch:** `feature/rememeberlogin`

## Architectural context

The Supabase client in `api/_utils/supabase.js` uses the **service-role key**, which bypasses
Postgres row-level security (RLS). Tenant isolation is therefore enforced in two places:

1. Hand-written `.eq('tenant_id', …)` filters in each API handler — a handler that omits one is an IDOR.
2. RLS on the database itself — which gates the **public anon key** that ships in the browser bundle.

Both layers have gaps (see CRITICAL-1 and the IDOR findings).

All High/Critical findings below were verified directly against the source and/or the live database.

---

## CRITICAL

### CRITICAL-1 — Production tables publicly readable via the anon key (live, exploitable now)

The public `VITE_SUPABASE_ANON_KEY` is compiled into the client bundle (by design). Its safety
depends entirely on RLS. A live read-only probe found RLS **enabled on most tables** (they return
`[]` to anon) but **missing on two**, which return real rows to anyone holding the public key:

| Table | Rows exposed | Sensitive content |
|-------|-------------|-------------------|
| `encoders` | 3 | **`stream_key`, `ingest_url`** — live RTMP/SRT push credentials |
| `broadcast_history` | 24 | cross-tenant broadcast metadata (titles, timestamps, destinations, `started_by`/`ended_by`) |

**Impact:** Anyone on the internet can read the encoders' `stream_key`/`ingest_url` with the
bundled anon key and push their own video into the 24/7 channels (broadcast hijack). RLS is toggled
out-of-band (none of it is in `schema.sql`/migrations), so any new raw-SQL table defaults to exposed.

**Fix:**
- `alter table encoders enable row level security;` and same for `broadcast_history`, with **no anon
  policy** (service-role API handlers keep working — they bypass RLS).
- Rotate the 3 exposed encoder stream keys.
- Codify `enable row level security` into migrations for **every** table; add a CI/probe check that
  fails if any table is anon-readable.

Verified: probe requested only row counts / non-secret columns; secret values were not exfiltrated.

---

## HIGH

### HIGH-1 — Secrets committed and shipped in the client bundle
- `src/components/Admin.jsx:4108` — hardcoded live BrightSpot API key (`BIPiEDEezXTX…`, Griffin UAT),
  in git and in the public JS bundle.
- `src/components/CommandCenter.jsx:7` — `VITE_SEAWARD_API_KEY`; every `VITE_*` var is inlined into
  the bundle. It's POSTed to `api.seawardautomation.com/auth`, so any visitor can extract and reuse it.
- **Fix:** rotate both; remove the hardcoded key; proxy Seaward auth through a server endpoint
  (as BrightSpot/JW already are).

### HIGH-2 — `api/tenant.js` PUT: cross-tenant write (IDOR), unconditional
`tenant.js:79-87` does `upsert({ id: session.tenantId, ...updated })` where `updated` spreads
`...body` last, so `body.id` overrides the session-scoped key. A tenant-A admin can send
`{"id":"<tenantB>", …}` and overwrite **any** tenant's row. No writable-field allowlist means the
whole body is written, including `jw_api_secret`, `youtube_refresh_token`, etc.
**Fix:** never take `id` from the body; add a `WRITABLE_FIELDS` allowlist (as `encoders.js` has).

### HIGH-3 — `api/tournament-days.js` PUT/DELETE: cross-tenant IDOR
The parent-tournament ownership check (`:51`) validates `tournament_id` from the body, but the
mutation targets the day by `id` alone (`.eq('id', id)` at `:95` and `:104`) with no join back to
`tournament_id`. A tenant-A admin passes their own `tournament_id` (passes the check) plus a victim's
day `id`, then edits/deletes it; PUT returns the row, so it's also a cross-tenant read.
**Fix:** scope the update/delete by verifying the day belongs to the checked tournament.

### HIGH-4 — `api/tournaments.js` GET: unauthenticated cross-tenant data exposure
The GET branch (`:39-49`) has no auth. Omit the `X-Tenant-Id` header and it returns **every tenant's**
tournaments with nested days, including stream/camera URLs (`shapeTournament`, `:27-32`).
**Fix:** require auth and scope to `session.tenantId`.

### HIGH-5 — `ADMIN_SECRET || 'fallback'` HMAC fallback (latent / config-conditional)
Trust root for OAuth tickets and OAuth `state`: `_utils/tenant.js:57,72`, `youtube-auth.js:24`,
`youtube-callback.js:24`, `facebook-auth.js:30`, `facebook-callback.js:29`. If `ADMIN_SECRET` is ever
empty/unset, the signing key becomes the source-visible string `'fallback'`, letting an attacker forge
a super-admin ticket (`{isSuperAdmin:true,…}`) or forge `state` to write their own Google/Facebook
token into a victim tenant's row. Set in prod today (len 24), so latent.
**Fix:** fail closed (throw if `ADMIN_SECRET` is unset), like `supabase.js` does for its keys.

### HIGH-6 — Vulnerable dependencies (`npm audit`: 4 high, 1 moderate, 1 low)
- `react-router-dom` / `react-router` 7.14.1 (**HIGH, direct dep**) — turbo-stream deserialization →
  potential unauth RCE (GHSA-49rj-9fvp-4h2h) + DoS + CSRF advisories. Bump to ≥ 7.15.0.
- `vite` ≤6.4.2 (HIGH) — `server.fs.deny` bypass / NTLM disclosure (dev-server, Windows).
- `ws` 8.0.0–8.20.1 (HIGH) — uninitialized-memory disclosure + DoS.
- `postcss` <8.5.10 (MODERATE), `@babel/core` (LOW) — build-time.
- **Fix:** `npm audit fix`; prioritize react-router-dom (runtime, internet-facing).

---

## MEDIUM

- **`api/brightspot-proxy.js:24-36` — authenticated SSRF.** Tenant admin fully controls `url`+`endpoint`;
  server fetches it and returns the body, no host allowlist. Restrict to the tenant's stored
  BrightSpot hosts via `getTenantBrightspotCreds()`.
- **`api/stream-ingest.js` — missing ownership check, returns a stream credential.** Trusts the
  caller-supplied stream `id` with no `tenant_id` check and returns `ingest_url`+`ingest_key`. Only
  membership required, so a `read_only` member can pull push credentials.
- **OAuth `state` has no expiry / single-use** (`youtube-auth.js`, `facebook-auth.js`). Signed
  `{tenantId, nonce}` with no `iat`/`exp`; nonce never stored → indefinitely replayable.
- **`api/youtube-set-thumbnail.js:67-71` — unscoped update (IDOR).**
  `.update({thumbnail_set}).eq('jw_stream_id', …)` with no tenant filter (cross-tenant boolean flip).
- **`api/channels.js:28-29` — cross-tenant read** of `youtube_streams`/`facebook_streams` (incl.
  `stream_key`), unfiltered by `tenant_id`; latent leak on `jw_stream_id` collision.
- **Latent SSRF/secret-exfil in `_utils/brightspot.js` and `_utils/jw.js`** — `new URL(path, base)` /
  fetch with no host check, attaching `X-Client-Secret` / JW `apiSecret`. Safe at current call sites.

---

## LOW / INFO

- **Stored CSS injection via tenant `colors`** (`Header.jsx`, `VideoPlayer.jsx`, `theme.js`) — raw
  interpolation into style strings served to public viewers. No JS execution (no
  `dangerouslySetInnerHTML`/`eval` anywhere in `src/`). Compounds HIGH-2's missing allowlist.
- **OAuth ticket rides in the URL** — replayable within its 2-min TTL via history / logs / `Referer`.
- **`api/auth.js` is dead and broken** — imports `generateToken` (not exported → 500s) and does a
  timing-unsafe `password !== ADMIN_PASSWORD` compare. Leftover from pre-Supabase auth; delete it and
  drop the stale `ADMIN_PASSWORD` env.
- **Error-message leakage** — many handlers return `err.message` / raw upstream text to the client.
- **`read_only` members can fetch ingest URLs/keys** (`stream-ingest`, `ingest-points`) — those are
  write-capable streaming credentials; gate behind `canWrite` if read-only should be view-only.
- **`api/encoder-stop.js` — `started_by` taken from the request body** → spoofable broadcast-history
  start-attribution (audit integrity only; `ended_by` is correctly session-derived).
- **Availability:** `CRON_SECRET` is empty in prod; `cron-cleanup-247-streams.js:109` fails **closed**
  (good), but the hourly cleanup job is effectively disabled until the secret is set.

---

## Verified safe (do not spend effort here)

- No SQL injection (all DB access via the Supabase query builder), no shell exec, no
  `dangerouslySetInnerHTML`/`eval`, no open redirects (OAuth callbacks use `timingSafeEqual` + fixed
  redirect targets).
- Service-role key never leaked to clients.
- Client-side role gating is cosmetic but correctly re-enforced server-side on every mutating endpoint.
- `tenants.js`, `super-admins.js`, `tenant-members.js`, `encoders.js` — authorization is correct
  (super-admin gating, role allowlists blocking `super_admin` escalation, consistent `tenant_id` scoping).
- Git history is clean — only `.env.example` (placeholders) was ever tracked; no secret purge needed.

---

## Recommended fix order

1. **Enable RLS default-deny on `encoders` + `broadcast_history`; rotate the 3 stream keys** (CRITICAL-1).
2. **Audit RLS on all tables and codify it in migrations** (prevents CRITICAL-1 recurring).
3. **Rotate + remove the two bundled secrets** (HIGH-1).
4. **Fix the write-side IDORs** — `tenant.js` PUT and `tournament-days.js` PUT/DELETE (HIGH-2, HIGH-3).
5. **Auth the `tournaments.js` GET; make the `ADMIN_SECRET` fallback fail closed** (HIGH-4, HIGH-5).
6. **`npm audit fix` + bump react-router-dom ≥ 7.15.0** (HIGH-6).
7. Mediums/lows above.
