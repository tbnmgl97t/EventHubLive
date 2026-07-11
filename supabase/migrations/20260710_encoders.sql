-- Encoder Control productionization, Phase 1 — encoders + broadcast history
--
-- An `encoders` row represents a physical hardware encoder in a newsroom. It
-- stores the ingest config an operator types into that hardware, plus the
-- always-on 24/7 JW channel the encoder is assigned to for breaking-news
-- override. `broadcast_history` records each time a producer went live —
-- Phase 2 (go-live orchestration) is what actually writes to it.
--
-- Deviations from a generic Supabase starter schema, to match this project's
-- existing conventions (see supabase/schema.sql):
--   * tenant_id is TEXT referencing tenants(id), not UUID — tenants.id in
--     this project is a text slug, not a UUID.
--   * No RLS policies. This project has none anywhere (tenant isolation is
--     enforced in code, via resolveTenantSession() in every /api handler,
--     which uses the service-role client and would bypass RLS regardless).
--     A `users` table with `auth.uid()` lookups — as in a stock RLS policy —
--     doesn't exist here; the closest equivalent is `tenant_members`.
--   * `id` stays UUID (gen_random_uuid(), already used by `profiles` in
--     schema.sql) since broadcast_history.encoder_id references it and there's
--     no reason to prefer serial here.

create table if not exists encoders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null references tenants(id) on delete cascade,
  name                text not null,
  description         text,
  channel_id          text not null,   -- JW 24/7 channel/stream ID
  channel_name        text,            -- display name for the channel
  ingest_format       text not null default 'rtmp',      -- rtmp, rtmps, srt, srt_pull, hls, hls_pull, rtp, rtp_fec
  region              text not null default 'us-east-1', -- us-east-1 or eu-west-1
  ingest_point_id     text,            -- JW ingest point ID
  ingest_url          text,            -- full ingest URL (shown to operator for hardware config)
  stream_key          text,            -- stream key (shown to operator)
  simulcast_youtube   boolean not null default false,
  simulcast_facebook  boolean not null default false,
  simulcast_website   boolean not null default true,
  simulcast_app       boolean not null default false,
  vod_recording       boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists encoders_tenant_idx on encoders (tenant_id);

create table if not exists broadcast_history (
  id              uuid primary key default gen_random_uuid(),
  encoder_id      uuid not null references encoders(id) on delete cascade,
  tenant_id       text not null references tenants(id) on delete cascade,
  title           text,
  started_at      timestamptz,
  ended_at        timestamptz,
  destinations    jsonb not null default '[]',  -- array of: "website", "youtube", "facebook", "app"
  jw_clip_id      text,                          -- filled in after post-broadcast clipping
  clip_title      text,
  clip_metadata   jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists broadcast_history_encoder_idx on broadcast_history (encoder_id);
create index if not exists broadcast_history_tenant_idx  on broadcast_history (tenant_id);
