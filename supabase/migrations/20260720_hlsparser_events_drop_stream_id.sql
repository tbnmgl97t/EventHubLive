-- Drop hls_parser_events.stream_id (and its FK to hls_streams) — events are
-- looked up by task_id only now (a stream's task can restart, so task_id is
-- the correlation key for a single run, not stream_id). Dropping the column
-- automatically drops the FK constraint and the two indexes that included
-- it (hls_parser_events_stream_idx, hls_parser_events_type_idx).

alter table hlsparser.hls_parser_events drop column if exists stream_id;

-- Recreate the type-filtered index keyed on task_id instead of stream_id.
create index if not exists hls_parser_events_type_idx on hlsparser.hls_parser_events (task_id, type, occurred_at);
