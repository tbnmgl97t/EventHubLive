# HLS Parser Event Logging — Design

## Purpose

Build a data model to capture events emitted while parsing HLS manifests for
segments and SCTE-35 markers, primarily to support an ad-break monitoring/audit
trail (verifying SCTE-35 CUE-OUT/CUE-IN timing and ad insertion behavior), and
secondarily for general parser observability/debugging.

This is a new, standalone feature — independent of the existing `encoders` /
`broadcast_history` tables. It follows this repo's existing multi-tenant
conventions (`tenant_id text references tenants(id)`, isolation enforced in
application code, no RLS — same pattern as `encoders`, `streams`).

## Architecture

A parser runs as a **trigger.dev task**, one long-lived/looping task per
watched stream. The task's run id (`taskId`) is the identifier for that
stream's whole parsing session — it stays constant across many manifest polls
for that stream, but changes if the task restarts (crash, redeploy, manual
restart).

While parsing, the task emits a stream of generic events, e.g.:

```json
{
  "timestamp": "2026-07-20T00:25:33.766Z",
  "type": "tag",
  "tag": "#EXTM3U",
  "scte35": []
}
```

`type` is intentionally left open-ended (not a fixed enum) — today it's just
`"tag"` for every parsed manifest line, with `scte35` populated only when that
line is/contains a SCTE-35 cue. Future event shapes are expected to be added
without a schema migration.

Writes go through `supabase-js` (PostgREST), the same access pattern the rest
of this app uses (`api/_utils/supabase.js`, service-role key). Per user
decision, these tables live in a **new `hlsparser` Postgres schema**, not
`public`.

## Data model

### Schema

A dedicated `hlsparser` schema, isolated from the app's existing `public`
schema tables. Cross-schema foreign keys to `public.tenants(id)` are used
directly — Postgres does not require same-schema references.

### `hlsparser.hls_streams` — registry + session tracking

One row per manifest being watched.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | text, fk → `public.tenants(id)` | tenant scoping, matches repo convention |
| `name` | text | human label |
| `manifest_url` | text | the HLS manifest URL being parsed |
| `active` | boolean, default true | whether this stream should currently be watched |
| `current_task_id` | text, nullable | trigger.dev run id of the most recent/active parsing session |
| `session_status` | text, nullable | `'running'` \| `'completed'` \| `'failed'` \| null (never started) |
| `session_started_at` | timestamptz, nullable | when the current/last session began |
| `last_polled_at` | timestamptz, nullable | last manifest fetch time |
| `last_sequence` | bigint, nullable | last HLS media sequence seen, to support incremental parsing |
| `created_at` | timestamptz, default now() | |

Because a stream's task can crash and restart over its lifetime,
`current_task_id` only tracks the latest session — full history of every
task run for a stream is recoverable from the distinct `task_id` values in
`hls_parser_events` for that `stream_id`, so nothing is lost.

### `hlsparser.hls_parser_events` — generic append-only event log

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | text, fk → `public.tenants(id)` | |
| `stream_id` | uuid, fk → `hlsparser.hls_streams(id)` | |
| `task_id` | text, not null | trigger.dev run id (the parsing session that produced this event) |
| `type` | text, not null | open-ended; `'tag'` today, anything later — no check constraint |
| `occurred_at` | timestamptz, not null | the event's own `timestamp` field |
| `payload` | jsonb, not null | everything else exactly as emitted (e.g. `{tag, scte35}`); absorbs future event shapes without a migration |
| `created_at` | timestamptz, default now() | row insert time (distinct from `occurred_at`, useful for detecting write lag) |

Only fields that are actually filtered/sorted on (`stream_id`, `task_id`,
`type`, `occurred_at`) are promoted to real columns; everything else stays in
`payload` so the schema doesn't need to change as new event shapes are added.

### Indexes

```sql
create index on hlsparser.hls_streams (tenant_id);
create index on hlsparser.hls_streams (current_task_id);

create index on hlsparser.hls_parser_events (stream_id, occurred_at);
create index on hlsparser.hls_parser_events (task_id, occurred_at);
create index on hlsparser.hls_parser_events (stream_id, type, occurred_at);
```

### Full DDL

```sql
create schema if not exists hlsparser;

grant usage on schema hlsparser to service_role;
grant all on all tables in schema hlsparser to service_role;
alter default privileges in schema hlsparser grant all on tables to service_role;

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
```

## Access pattern

Writes/reads go through `supabase-js` with the service-role key, same as the
rest of this app. Because `hlsparser` is a non-default schema, this requires:

1. **Supabase Dashboard → Settings → API → Data API → Exposed schemas**: add
   `hlsparser`. PostgREST will 404 on the schema until this is set, even with
   the service-role key.
2. **Client code**: either call `.schema('hlsparser')` per query, or add a
   dedicated client in `api/_utils/supabase.js`:
   ```js
   export const hlsParserDb = createClient(url, key, {
     db: { schema: 'hlsparser' },
     auth: { persistSession: false },
   })
   ```

These are manual one-time setup steps — not achievable from a SQL migration
alone — and must be called out in the implementation plan.

## Query patterns

**Ad-break pairing** (no derived `ad_breaks` table for now — pairing is a
query-time self-join on the SCTE `splice_event_id` inside `payload`):

```sql
select stream_id, task_id, occurred_at, payload->'scte35' as cues
from hlsparser.hls_parser_events
where type = 'tag' and jsonb_array_length(payload->'scte35') > 0
order by occurred_at;
```

If dangling (unmatched CUE-OUT/CUE-IN) breaks become a frequent need, a
derived `ad_breaks` summary table is the natural follow-up — deferred for
now per user decision.

## Explicitly deferred / out of scope

- **No derived `ad_breaks` table.** Pairing CUE-OUT/CUE-IN is done at query
  time for now. Revisit if audit dashboards need it to be pre-computed.
- **No dedup / unique constraint on events.** Assumption: since each
  trigger.dev session is stateful (not a blind re-poll of overlapping
  manifest windows), the task only emits each tag once. If this assumption
  turns out to be wrong (e.g. task restarts re-emit already-seen tags),
  revisit with a `dedup_key` + unique constraint.
- **No retention/cleanup policy.** Volume is moderate (dozens of streams,
  10-30s polling); index shape supports easy time-range deletes later if a
  cleanup cron becomes necessary.
- **No RLS.** Matches every other table in this codebase — tenant isolation
  is enforced in application code, not Postgres policies.

## Open risk to flag in the implementation plan

The "no dedup" and "no ad_breaks table" decisions are both explicit,
revisit-later trade-offs, not settled facts — the implementation plan should
call these out so they're not forgotten.
