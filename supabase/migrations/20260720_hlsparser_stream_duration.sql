-- Optional max-run duration (seconds) for an HLS Watcher stream's parser
-- task, forwarded to the trigger.dev 'hls-watcher' task's payload. Nullable —
-- omitting it means the task runs until manually stopped.

alter table hlsparser.hls_streams add column if not exists duration_seconds integer;
