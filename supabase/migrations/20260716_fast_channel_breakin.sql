-- FAST Channel Break-in — real Pop-up Channels API wiring
--
-- tenants.fast_api_key: the Bearer token for JW's Pop-up Channels API
-- (https://api.fast.jwp.services), generated in that product's own UI under
-- the account's API keys page. Tenant-scoped like the other integrations.
--
-- encoders.fast_channel_id: which Pop-up (FAST) channel this encoder breaks
-- into. That channel must be channel_type: 1 (Scheduled/linear) with
-- live_mixing enabled, or the schedule PATCH used for break-in has no effect.
--
-- encoders.fast_schedule_item_id: the schedule item id returned when the
-- break-in was inserted, so the matching stop/restore call can remove
-- exactly that item rather than guessing. Ephemeral — set on go-live,
-- cleared on stop.

alter table encoders add column if not exists fast_channel_id        text;
alter table encoders add column if not exists fast_schedule_item_id  text;
alter table tenants  add column if not exists fast_api_key           text;
