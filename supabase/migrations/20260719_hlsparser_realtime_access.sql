-- Grants the browser (anon/authenticated, via supabase-js) read access to the
-- hlsparser tables and enables Postgres Realtime so the HLS Watcher tracker
-- screen can subscribe to live inserts. See docs/superpowers/specs/2026-07-19-hls-parser-events-design.md.

grant usage on schema hlsparser to anon, authenticated;
grant select on all tables in schema hlsparser to anon, authenticated;
alter default privileges in schema hlsparser grant select on tables to anon, authenticated;

alter publication supabase_realtime add table hlsparser.hls_streams;
alter publication supabase_realtime add table hlsparser.hls_parser_events;
