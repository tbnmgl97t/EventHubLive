-- Encoder Control — per-destination "on by default" toggle
--
-- simulcast_website/youtube/facebook/app already control whether a
-- destination is configured/available for an encoder at all. These new
-- columns are a separate concern: whether that destination should start
-- pre-checked in the Encoder Control page's destinations panel each time a
-- new broadcast is set up, vs. requiring the operator to select it
-- deliberately every time.
--
-- Defaults preserve current behavior: Website pre-checks, everything else
-- doesn't.

alter table encoders add column if not exists simulcast_website_default  boolean not null default true;
alter table encoders add column if not exists simulcast_youtube_default  boolean not null default false;
alter table encoders add column if not exists simulcast_facebook_default boolean not null default false;
alter table encoders add column if not exists simulcast_app_default      boolean not null default false;
