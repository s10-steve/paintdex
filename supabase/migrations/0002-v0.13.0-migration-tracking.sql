-- v0.13.0 — record which migrations have been applied.
--
-- Apply THIS on an existing project, not the whole of `../schema.sql`. See the
-- header of `0001-…` for why that distinction is load-bearing.
--
-- Run this BEFORE `0003-…`, which records itself in the table it creates.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- Migrations here are applied by hand in the SQL editor, and until now nothing
-- recorded that they had been. "Is production up to date?" was answered from
-- memory, or by reading the schema and inferring backwards — which is exactly
-- how v0.12.0's rolled-back migration went unnoticed until every share link on
-- the site was broken.
--
-- This is a convention, not a mechanism: the database cannot force a migration
-- to declare itself. Every migration's LAST statement inserts its own filename
-- here, and a migration that forgets simply goes unrecorded. That is the
-- accepted cost of not taking on the Supabase CLI, which would enforce it in
-- exchange for owning the whole workflow.
--
-- Last, deliberately: a file that fails part-way through should not leave a row
-- claiming it succeeded. Statements before it may still have applied, which is
-- why they are all written to be idempotent — re-running the file is the fix.

create table if not exists public.schema_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now()
);

-- No policies, so no policy can be OR-combined into something wider later. The
-- SQL editor runs as `postgres` and bypasses RLS; anon and authenticated get
-- nothing, which is right — this is deployment bookkeeping, not app data, and
-- the browser has no reason to read it.
alter table public.schema_migrations enable row level security;

comment on table public.schema_migrations is
  'Which files in supabase/migrations/ have been applied. Written by hand as the last statement of each migration.';

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- 0001 predates this table. It is recorded here on the assumption that any
-- project reaching this file has already had it applied — true of production
-- and of any project bootstrapped from `schema.sql`.
--
-- If you are unsure, check for what it created before trusting the row:
--   select proname from pg_proc where proname = 'get_public_scheme';   -- 1 row
--   select polname from pg_policy where polname = 'schemes select public';
--                                                                     -- 0 rows
insert into public.schema_migrations (filename) values
  ('0001-v0.12.0-unlisted-share-links.sql'),
  ('0002-v0.13.0-migration-tracking.sql')
on conflict (filename) do nothing;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--   select filename, applied_at from public.schema_migrations order by filename;
--
-- Compare that against `ls supabase/migrations/`. Anything in the directory and
-- not in the table has not been run.
