-- Both tables are only ever accessed through api/* routes using the
-- service-role key (which bypasses RLS), never directly by the frontend's
-- anon-key client — so enabling RLS with no policies closes off direct
-- anon/authenticated access via PostgREST without affecting the app.

alter table public.broadcast_history enable row level security;
alter table public.encoders enable row level security;
