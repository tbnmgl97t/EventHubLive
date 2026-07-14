-- Encoder Control — BrightSpot publish/unpublish orchestration (stub)
--
-- Each encoder can be paired with two BrightSpot pages: the "Encoder Page"
-- (the editorial page for this feed) and the "Encoder Video Page" (the
-- Video (ViewNexa) livestream page itself). Once the BrightSpot REST
-- Management API access is sorted out, go-live/stop will publish/unpublish
-- these by id as part of the broadcast orchestration.
--
-- Stored as manual id/name pairs for now (same pattern as channel_id/
-- channel_name) — a live BrightSpot picker replaces the manual entry once
-- the API access issue is resolved.

alter table encoders add column if not exists brightspot_page_id         text;
alter table encoders add column if not exists brightspot_page_name       text;
alter table encoders add column if not exists brightspot_video_page_id   text;
alter table encoders add column if not exists brightspot_video_page_name text;
