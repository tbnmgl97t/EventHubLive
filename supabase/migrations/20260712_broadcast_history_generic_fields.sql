-- Encoder Control productionization, Phase 5 — provider-agnostic broadcast history
--
-- This product isn't JW-only long-term — more CDN/clipping integrations may be
-- added later. Rename the JW-specific jw_clip_id to the generic asset_id, add
-- a provider column so future integrations can identify which backend created
-- the asset, and add columns for the delivery link plus who started/ended the
-- broadcast (captured from the authenticated session, not user-editable).

alter table broadcast_history rename column jw_clip_id to asset_id;
alter table broadcast_history add column if not exists provider text not null default 'jwplayer';
alter table broadcast_history add column if not exists asset_url text;
alter table broadcast_history add column if not exists started_by text;
alter table broadcast_history add column if not exists ended_by text;
