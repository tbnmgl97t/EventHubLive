-- Encoder Control productionization, Phase 4 — YouTube 24/7 broadcast creation
--
-- Auto-creating a persistent YouTube broadcast for a 24/7 encoder (see
-- api/youtube-create-broadcast.js) also mints a bound ingest stream (RTMP
-- URL + stream key) the operator needs to simulcast from their hardware
-- encoder. Store it alongside youtube_broadcast_id so it survives page
-- reloads and doesn't need to be re-fetched from YouTube every time.

alter table encoders add column if not exists youtube_ingest_url text;
alter table encoders add column if not exists youtube_stream_key text;
