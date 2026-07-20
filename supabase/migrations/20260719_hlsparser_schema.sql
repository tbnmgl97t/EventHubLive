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
