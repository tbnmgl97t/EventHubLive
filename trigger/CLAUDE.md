# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A trigger.dev (v4 SDK, `@trigger.dev/sdk/v3` API) project. There is no application server here — all code is background task definitions run by the trigger.dev worker, triggered either from the trigger.dev dashboard or via the trigger.dev API/SDK from an external caller.

## Commands

```bash
npx trigger.dev@latest dev     # start the local dev worker (builds and watches src/trigger/**)
npm install                    # install dependencies
```

There is no build, lint, or test script configured (`npm test` is the uninitialized npm-init placeholder). Type checking happens implicitly as part of `trigger dev`'s build step (esbuild via the trigger.dev CLI) — there's no standalone `tsc` script.

### Triggering a task run

Tasks are invoked, not executed directly. Either:
- From the trigger.dev dashboard's "Test" tab for the project (`proj_lxclwwrhmiwudbhywswi`), or
- Via the REST API (note: `/api/v1/tasks/.../trigger` to trigger, but `/api/v3/runs/{id}` to read a run back — the two resources are on different API versions):
  ```bash
  curl -X POST https://api.trigger.dev/api/v1/tasks/<task-id>/trigger \
    -H "Authorization: Bearer $TRIGGER_SECRET_KEY" \
    -H "Content-Type: application/json" \
    -d '{"payload": { ... }}'
  ```
- Or from other backend code via `tasks.trigger<typeof someTask>("task-id", payload)` from `@trigger.dev/sdk/v3`.

`TRIGGER_SECRET_KEY` (a dev/staging/prod key from the dashboard) must be set in the environment of whatever is triggering a run. It is stored locally in `.env` (gitignored) for this project's own use.

A run's live worker must be running (`trigger dev` locally, or the deployed worker in staging/prod) to actually execute a triggered/queued run — otherwise the run just sits queued until a worker comes online.

### Where logs show up

- The terminal running `trigger dev` prints one line per run (start/success/failure), not full inline log detail.
- Full `logger.log`/`logger.error` output and a run's final return value are visible in the trigger.dev dashboard's run view, or via `GET https://api.trigger.dev/api/v3/runs/{runId}` (Bearer auth) which returns the run's `payload` and `output`.

## Architecture

- **`trigger.config.ts`** — trigger.dev project config. `dirs: ["./src/trigger"]` means every file under `src/trigger/` is scanned and imported by the trigger.dev build; any top-level side-effecting code in that directory runs at build/import time, not just when a task executes. Default `maxDuration: 3600`s and retry policy apply to all tasks unless overridden per-task.
- **`src/trigger/example.ts`** — the scaffolded `hello-world` task (trivial, kept as a smoke-test task).
- **`src/trigger/hls-watcher.ts`** — the `hls-watcher` task. Given `{ url, interval?, duration?, tags?, outFile? }`:
  1. Resolves `url` to a media playlist (follows `#EXT-X-STREAM-INF` if it's a master playlist).
  2. Polls the media playlist on a loop (`interval` seconds, defaulting to the playlist's `EXT-X-TARGETDURATION`, or 4s), logging each newly-seen `#EXT-X-*` tag exactly once.
  3. Downloads every newly-seen media segment and scans it for in-band SCTE-35 (via `scte35.js`), since SCTE-35 markers aren't always signaled in the playlist itself.
  4. Also decodes SCTE-35 carried in `#EXT-X-DATERANGE` tags' `SCTE35-OUT`/`SCTE35-IN`/`SCTE35-CMD` hex attributes.
  5. Runs until `duration` seconds elapse, or until the task's `maxDuration` is hit if `duration` is omitted (there's no user-facing "stop" — a task run just completes and returns `{ mediaUrl, eventCount, events }`).
  6. If `outFile` is given, every event is also appended as one JSON object per line (JSONL) to that path, in addition to being logged and included in the return value.
  7. Every tag/segment event (not just SCTE-35 hits — `scte35` is just metadata on the row, possibly an empty array) is also written to Supabase's `hls_parser_events` table (see below), tagged with this run's ID.
- **`src/trigger/scte35.js`** — plain CommonJS module (imported into the TS task via named import; trigger.dev's esbuild-based bundler handles the interop) that scans a raw MPEG-TS segment buffer for `splice_info_section` (SCTE-35, `table_id 0xFC`) and does a partial decode (table/section header, and `splice_insert` command fields). It only reassembles single-TS-packet sections — a section split across multiple TS packets is not reassembled and will be skipped.
- **`src/trigger/supabase.ts`** — minimal PostgREST (Supabase REST API) client used only by `hls-watcher.ts`, via the `service_role` key (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` env vars, set in `.env` for local dev). No Supabase client library is used, just `fetch` against `${SUPABASE_URL}/rest/v1/...`.
  - `hls_streams` is owned entirely by a separate Next.js app: it creates rows and sets `current_task_id` to a run's ID before/when it triggers `hls-watcher`. This task **never writes to `hls_streams`** — `findHlsStreamByTaskId` only reads the row matching `current_task_id = ctx.run.id`, purely to get `tenant_id` for attributing this run's events. If no row matches (e.g. a race between the Next.js app triggering and setting `current_task_id`), `hls-watcher` logs a warning and still watches the stream, it just skips all `hls_parser_events` writes for that run.
  - `hls_parser_events` has no `stream_id` column — events are attributed only by `tenant_id` + `task_id` (this run's ID), not linked back to a specific `hls_streams` row at the DB level. Correlating an event to "which stream" means joining externally on `hls_streams.current_task_id`, which only holds the *most recent* run per stream (not a durable link).
  - `hls_streams`/`hls_parser_events` live in the **`hlsparser` Postgres schema, not `public`**. PostgREST only serves `public` unless told otherwise, so every request sends `Accept-Profile: hlsparser` (reads) or `Content-Profile: hlsparser` (writes) — dropping these gets a `PGRST205`/"Could not find the table" 404 even though the table exists.
  - `hls_parser_events.tenant_id` (like `hls_streams.tenant_id`) is a **foreign key into a real `public.tenants` table** — it's not a free-form string. As of this writing the only valid values are `"default"` (Trilogy Digital) and `"es2jpLg2"` (News on 9); an unrecognized `tenant_id` fails the insert with a `23503` FK-violation.
  - PostgREST responds to `Prefer: return=minimal` writes with an **empty body** (status 201 or 204, not just 204) — `restRequest` reads the body as text first and only `JSON.parse`s it if non-empty, rather than assuming `204` is the only "no body" case (calling `.json()` on an empty response throws "Unexpected end of JSON input").
  - `hls_parser_events` inserts are fire-and-forget from `emit()` (logged via `logger.error` on failure, not thrown) so a transient Supabase write failure doesn't abort an otherwise-healthy long-running watch.
