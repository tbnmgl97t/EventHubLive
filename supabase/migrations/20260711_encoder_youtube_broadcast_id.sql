-- Encoder Control productionization, Phase 3 — go-live orchestration
--
-- YouTube go-live for a 24/7 encoder toggles privacyStatus on a *persistent*
-- YouTube broadcast (bound once, at simulcast setup time, to the encoder's
-- always-on JW channel) — it does not create a new broadcast per go-live like
-- the one-off event flow in create-stream.js does. That persistent broadcast
-- ID has to live somewhere; the encoder row is the natural home since it's
-- fixed per-encoder, not per-broadcast-session.

alter table encoders add column if not exists youtube_broadcast_id text;
