-- EventHub Live — Supabase schema
-- Run this in the Supabase SQL editor to create all tables

-- ── Tenant config (single row) ───────────────────────────────────────────────
create table if not exists tenant (
  id            text primary key default 'default',
  title         text not null default 'EventHub Live',
  subtitle      text,
  logo_url      text,
  timezone      text not null default 'America/New_York',
  colors        jsonb not null default '{"primary":"#e65d2c","secondary":"#0a205a","background":"#0a0f1e","paper":"#111827"}',
  components    jsonb not null default '{}'
);

-- ── Pricing config (single row) ──────────────────────────────────────────────
create table if not exists pricing (
  id                 text primary key default 'default',
  feed_rate_per_hr   numeric not null default 15,
  cdn_rate_per_gb    numeric not null default 0.05,
  gb_per_50_min      numeric not null default 4,
  channel_overrides  jsonb not null default '{}'
);

-- ── Tournaments ───────────────────────────────────────────────────────────────
create table if not exists tournaments (
  id          serial primary key,
  name        text not null,
  location    text,
  created_at  timestamptz not null default now()
);

-- ── Tournament days ───────────────────────────────────────────────────────────
create table if not exists tournament_days (
  id             serial primary key,
  tournament_id  integer not null references tournaments(id) on delete cascade,
  label          text not null,
  date           date not null,
  start_time     text,   -- "8:00 AM"
  end_time       text,   -- "5:00 PM"
  tz             text not null default 'America/New_York',
  streams        jsonb not null default '[]'  -- [{ id, url, name }]
);

-- ── CDN records ───────────────────────────────────────────────────────────────
create table if not exists cdn_records (
  id                 serial primary key,
  date               date not null,
  label              text not null,
  tournament_id      integer references tournaments(id) on delete set null,
  channel_id         text not null,
  channel_name       text not null,
  stream_hours       numeric not null default 0,
  minutes_delivered  numeric not null default 0,
  created_at         timestamptz not null default now()
);

-- ── Cost records ──────────────────────────────────────────────────────────────
create table if not exists cost_records (
  id                serial primary key,
  date              date not null,
  label             text not null,
  channel_count     integer not null default 1,
  start_time        text,
  end_time          text,
  hours_per_channel numeric,
  total_hours       numeric,
  created_at        timestamptz not null default now()
);

-- ── YouTube integration columns (added via migration) ───────────────────────
alter table tenant add column if not exists youtube_refresh_token    text;
alter table tenant add column if not exists youtube_channel_id       text;
alter table tenant add column if not exists youtube_channel_name     text;
alter table tenant add column if not exists youtube_channel_thumbnail text;

-- ── Stream registry (tenant ownership) ──────────────────────────────────────
-- Maps JW stream IDs to tenants. Used to filter channels per tenant in
-- multi-tenant deployments where multiple tenants share one JW site.
create table if not exists streams (
  id           serial primary key,
  tenant_id    text not null default 'default',
  jw_stream_id text not null unique,
  name         text,
  created_at   timestamptz not null default now()
);
create index if not exists streams_tenant_idx on streams (tenant_id);

-- ── YouTube streams ──────────────────────────────────────────────────────────
-- One row per JW stream that has a linked YouTube broadcast.
create table if not exists youtube_streams (
  jw_stream_id       text primary key,          -- JW broadcast stream / media ID
  jw_stream_name     text,                       -- stream title at creation time
  broadcast_id       text not null,             -- YouTube liveBroadcast ID (video ID)
  stream_id          text not null,             -- YouTube liveStream ID (RTMP ingest)
  rtmp_url           text,                       -- primary RTMP ingest address
  backup_rtmp_url    text,                       -- backup RTMP ingest address
  stream_key         text,                       -- RTMP stream key / stream name
  watch_url          text,                       -- https://youtube.com/watch?v=...
  privacy_status     text default 'public',
  scheduled_start    timestamptz,
  scheduled_end      timestamptz,
  thumbnail_set      boolean not null default false,
  created_at         timestamptz not null default now()
);

-- ── Facebook connection (tenant row columns) ─────────────────────────────────
alter table tenant add column if not exists facebook_page_access_token text;
alter table tenant add column if not exists facebook_page_id            text;
alter table tenant add column if not exists facebook_page_name          text;
alter table tenant add column if not exists facebook_page_picture       text;

-- ── Facebook streams ─────────────────────────────────────────────────────────
-- One row per JW stream that has a linked Facebook Live video.
create table if not exists facebook_streams (
  jw_stream_id     text primary key,          -- JW broadcast stream / media ID
  jw_stream_name   text,                       -- stream title at creation time
  live_video_id    text not null,              -- Facebook live video ID
  rtmp_url         text,                       -- RTMP(S) base URL (without key)
  stream_key       text,                       -- RTMP stream key
  secure_rtmp_url  text,                       -- full rtmps:// URL (for reference)
  watch_url        text,                       -- https://www.facebook.com/video/...
  page_id          text,                       -- Facebook Page ID
  page_name        text,                       -- Facebook Page name
  status           text default 'SCHEDULED_UNPUBLISHED',
  scheduled_start  timestamptz,
  created_at       timestamptz not null default now()
);

-- Seed default tenant row
insert into tenant (id) values ('default') on conflict (id) do nothing;

-- Seed default pricing row
insert into pricing (id) values ('default') on conflict (id) do nothing;

-- ══════════════════════════════════════════════════════════════════════════
-- Multi-tenant auth migration — Supabase Auth + Super Admin / Admin / Read-only
-- ══════════════════════════════════════════════════════════════════════════

-- Rename the singleton config table into a real multi-row tenants table.
-- Keeps the existing 'default' row (today's one customer) intact.
alter table tenant rename to tenants;
alter table tenants alter column id drop default;
alter table tenants add column if not exists slug text;
update tenants set slug = id where slug is null;
alter table tenants add constraint tenants_slug_key unique (slug);

-- Per-tenant JW Player credentials — replaces the global JW_SITE_ID/JW_API_SECRET
-- env vars. Each tenant gets its own JW Player site; isolation is inherent to
-- having a separate JW account per client, not an app-level filter.
alter table tenants add column if not exists jw_site_id    text;
alter table tenants add column if not exists jw_api_secret text;
-- Backfill today's one customer from the current env vars so it keeps working
-- unmodified — replace the placeholders with the real values before running.
update tenants set jw_site_id = '<value of JW_SITE_ID>', jw_api_secret = '<value of JW_API_SECRET>'
  where id = 'default';

-- Global user profile — mirrors auth.users, carries the global Super Admin flag.
-- Super Admin is agency-wide (Trilogy Digital staff only), not tenant-scoped.
create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  is_super_admin  boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Per-tenant membership + role (admin / read_only). One row per (tenant, user).
create table if not exists tenant_members (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  text not null references tenants(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       text not null check (role in ('admin','read_only')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists tenant_members_user_idx on tenant_members (user_id);

-- tenant_id already exists on `streams` (was default 'default') — drop the
-- default now that writers always pass an explicit tenant id. With per-tenant
-- JW sites this column is no longer a security boundary (JW's own site
-- boundary provides isolation) — it stays as a local record of what was
-- created under which tenant.
alter table streams alter column tenant_id drop default;

-- Add tenant scoping to the other previously-global tables.
alter table tournaments      add column if not exists tenant_id text references tenants(id) default 'default';
alter table cdn_records      add column if not exists tenant_id text references tenants(id) default 'default';
alter table cost_records     add column if not exists tenant_id text references tenants(id) default 'default';
alter table youtube_streams  add column if not exists tenant_id text references tenants(id) default 'default';
alter table facebook_streams add column if not exists tenant_id text references tenants(id) default 'default';
-- `pricing` stays a single global row — Costs/Pricing is Super-Admin-only and
-- agency-wide, not per-tenant.

-- ══════════════════════════════════════════════════════════════════════════
-- Ownership tracking for JW resources not covered by `streams` — closes the
-- gap where delete-ingest-point.js / delete-vod-media.js had no per-tenant
-- ownership check (JW's own site-scoped API isn't a guaranteed isolation
-- boundary since tenants.jw_site_id has no uniqueness constraint).
-- ══════════════════════════════════════════════════════════════════════════

-- ── Ingest point registry (tenant ownership) ────────────────────────────────
-- One row per JW static ingest point, written at creation time by
-- create-ingest-point.js. Used by delete-ingest-point.js as a defense-in-depth
-- ownership check, mirroring how `streams` is used by delete-stream.js.
create table if not exists ingest_points (
  id           serial primary key,
  tenant_id    text not null,
  jw_ingest_id text not null unique,
  name         text,
  format       text,
  created_at   timestamptz not null default now()
);
create index if not exists ingest_points_tenant_idx on ingest_points (tenant_id);

-- ── VOD media registry (tenant ownership) ───────────────────────────────────
-- One row per JW VOD media asset produced by live-to-vod capture. There's no
-- creation-time hook for these (JW generates them asynchronously after a
-- stream ends), so rows are backfilled opportunistically by GET /api/channels
-- the first time it observes a vod_media_id under the caller's own tenant —
-- first tenant to observe an asset claims it (ON CONFLICT DO NOTHING; a row's
-- tenant_id is never overwritten once set). Used by delete-vod-media.js as a
-- defense-in-depth ownership check.
--
-- Caveat: VOD assets that existed before this migration, or that no tenant's
-- /api/channels has polled yet, won't have a row here — deleting them will
-- 403 until GET /api/channels observes them at least once for that tenant.
create table if not exists vod_media (
  id           serial primary key,
  tenant_id    text not null,
  jw_media_id  text not null unique,
  jw_stream_id text,
  created_at   timestamptz not null default now()
);
create index if not exists vod_media_tenant_idx on vod_media (tenant_id);
