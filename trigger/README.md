# trigger

trigger.dev (v4 SDK) background tasks for EventHubLive — currently the `hls-watcher` task, which polls an HLS playlist, logs tag/segment events, scans segments for in-band SCTE-35, and writes every event to Supabase's `hls_parser_events` table. See `CLAUDE.md` in this folder for architecture details and how it fits together with `../api/create-stream.js` and `../api/hls-watcher-streams.js`.

## Setup

```bash
npm install
```

Create a `.env` file in this folder (gitignored) with:

```bash
TRIGGER_SECRET_KEY=              # dev/staging/prod key, from the trigger.dev dashboard
SUPABASE_URL=                    # e.g. https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=       # service_role key -- server-side only, never expose this
```

## Build / run locally

There's no separate build step for local development — `trigger dev` builds and watches in one step:

```bash
npx trigger.dev@latest dev
```

This starts a local worker that picks up runs triggered against your dev environment (from the trigger.dev dashboard's Test tab, or via the API/SDK). It rebuilds automatically on file changes. Leave it running while you're testing; a triggered run just sits queued until a worker is online to execute it.

## Deploy

```bash
npx trigger.dev@latest deploy               # deploys to prod (default)
npx trigger.dev@latest deploy --env staging # deploys to staging instead
```

This builds the project (bundles everything under `src/trigger/`) and pushes it to trigger.dev's cloud infrastructure for the target environment — no separate CI/build pipeline is needed on the EventHubLive/Vercel side, deployment is entirely through this CLI command. A few flags worth knowing:

- `--dry-run` — see what would be deployed without actually deploying.
- `--local-build` — build the deployment image locally instead of using trigger.dev's remote build servers (useful if the remote build is failing and you need more visibility).
- `--skip-promotion` — deploy without promoting it to be the active deployment for that environment (e.g. to test a build before it takes traffic).

Environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) must also be set for staging/prod in the trigger.dev dashboard under that environment's settings — the local `.env` file only applies to `trigger dev`.
