# Supabase CLI & Single-File Migration Guide

This guide covers how to install the Supabase CLI, link this project, and safely execute a single migration file from `supabase/migrations/` without risking a broad, history-altering `supabase db push`.

## Part 1: Installing and Setting Up the Supabase CLI

### 1. Install the CLI

Depending on your package manager or operating system, install the Supabase CLI globally:

- Using npm (Node.js):
  ```
  npm install -g supabase
  ```
- Using Homebrew (macOS / Linux):
  ```
  brew install supabase/tap/supabase
  ```
- Using Scoop (Windows):
  ```
  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
  scoop install supabase
  ```

### 2. Verify Installation

```
supabase --version
```

### 3. Log In to Your Supabase Account

```
supabase login
```

This opens a browser window asking you to authorize the CLI.

### 4. Link This Project

Link your local workspace to the remote Supabase project using its project reference ID (found in the project URL: `app.supabase.com/project/<project-ref>`):

```
supabase link --project-ref <project-ref>
```

You'll be prompted for the database password.

## Part 2: Safely Running a Single-File Migration

Instead of `supabase db push` (which applies every pending migration and can affect more than intended), target and run only a specific `.sql` file directly against the database with `psql`:

```
supabase db psql -f ./path/to/your/migration_file.sql
```

Example, for the migration files in this repo's `supabase/migrations/` folder:

```
supabase db psql -f ./supabase/migrations/20260720_encoder_brightspot_original_headline.sql
```

### Alternative: Supabase Dashboard (no CLI required)

1. Open the [Supabase Dashboard](https://app.supabase.com/).
2. Select the project.
3. Open **SQL Editor** in the left sidebar.
4. Click **New Query**.
5. Paste the contents of the `.sql` file.
6. Click **Run**.

## Naming convention in this repo

Files in `supabase/migrations/` follow `YYYYMMDD_description.sql` (a second same-day file gets a distinguishing suffix in the description, not a numeric prefix). Migrations are written idempotently (`create table if not exists`, `alter table ... add column if not exists`) so they're safe to re-run. There are no down-migrations.
