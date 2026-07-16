# EventHub Live

React (Vite) + Supabase app deployed on Vercel, with backend logic implemented as Vercel serverless functions in `api/`.

## Prerequisites

- Node.js 22.x
- npm
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
- Access to the `trilogy-digital/eventhublive` Vercel project (ask a teammate to add you if you don't have access)

## 1. Install dependencies

```bash
npm install
```

## 2. Link the project to Vercel

This pulls the project's real environment variables instead of you having to source them manually.

```bash
vercel login
vercel link
```

When prompted, choose the `trilogy-digital` team and the `eventhublive` project.

## 3. Pull environment variables

```bash
vercel env pull .env.local
```

This creates `.env.local` with the Development environment variables (Supabase URL/keys, YouTube OAuth credentials, Postgres/Edge Config vars, etc.).

> **Note:** `VITE_SEAWARD_API_KEY` is currently only configured under the **Production** environment in Vercel, so `vercel env pull` won't fetch it into `.env.local` by default. If you need it locally, pull it explicitly:
> ```bash
> vercel env pull --environment=production /tmp/.env.prod
> grep VITE_SEAWARD_API_KEY /tmp/.env.prod >> .env.local
> rm /tmp/.env.prod
> ```

See `.env.example` for the minimal set of variables the frontend needs directly.

## 4. Run the app

- **Frontend only** (no `/api/*` routes — fine for pure UI work):
  ```bash
  npm run dev
  ```
- **Frontend + API routes** (needed for auth, streaming, encoder control, YouTube/Facebook/BrightSpot integrations, etc.):
  ```bash
  npm run dev:api
  ```
  This runs `vercel dev`, which serves the Vite app and the `api/` serverless functions together.

The app runs at **http://localhost:5173**.

## Database (Supabase)

Schema and migrations live in `supabase/`:
- `supabase/schema.sql` — base schema
- `supabase/migrations/*.sql` — incremental migrations, applied in filename (date) order

Apply these against your Supabase project via the Supabase SQL editor or CLI — there's no `db:push`/`db:migrate` npm script in this repo.

### Creating the first Super Admin

After the multi-tenant migration in `supabase/schema.sql` has been applied (needs the `profiles` table), bootstrap the first admin account:

```bash
node scripts/bootstrap-super-admin.mjs you@example.com "some-strong-password"
```

This reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.

## Build

```bash
npm run build   # production build
npm run preview # preview the production build locally
```

## Project structure

```
api/            Vercel serverless functions (auth, streaming, encoders, YouTube/Facebook/BrightSpot integrations, cron jobs)
src/
  components/   React components
  contexts/     React context providers
  lib/          Shared client-side utilities (e.g. Supabase client)
  theme/        MUI theme config
  assets/       Static assets
supabase/       Database schema and migrations
scripts/        One-off maintenance/setup scripts
```
