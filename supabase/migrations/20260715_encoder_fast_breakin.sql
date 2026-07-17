-- Encoder Control — FAST Channel Break-in destination (stub)
--
-- A future simulcast destination that breaks in to a FAST (Free Ad-supported
-- Streaming TV) channel via the JW API when this encoder goes live, and
-- restores normal programming when it stops. The actual JW API call isn't
-- confirmed yet — see the STUB handlers in encoder-go-live.js/encoder-stop.js.
--
-- Same shape as the other simulcast destinations: simulcast_fast controls
-- whether it's configured/available for this encoder at all, and
-- simulcast_fast_default controls whether it starts pre-checked in the
-- Encoder Control page's destinations panel.

alter table encoders add column if not exists simulcast_fast         boolean not null default false;
alter table encoders add column if not exists simulcast_fast_default boolean not null default false;
