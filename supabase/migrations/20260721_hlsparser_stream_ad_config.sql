-- JW Player ad config selected at stream-creation time, used later to build
-- an SSAI-enabled preview URL on the monitoring/tracker screen.

alter table hlsparser.hls_streams add column if not exists ad_config_id text;
