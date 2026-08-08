-- v0.14.0 — "My paints": the paints you own, and the ones you want to buy.
--
-- Apply THIS on an existing project, not the whole of `../schema.sql`. That
-- file is the bootstrap for a fresh project, the Supabase SQL editor runs a
-- pasted script as a single transaction, and so *any* statement failing —
-- including ones unrelated to what you are changing — silently rolls back the
-- ones you actually wanted. v0.12.0 shipped that way and took every share link
-- on production down with it.
--
-- Every statement here is idempotent, so re-running it is safe, including
-- part-way through.
--
-- Run BEFORE deploying the v0.14.0 code: `/my-paints` and the add-to-collection
-- buttons select from and write to the table below, and there is no fallback —
-- the feature is accounts-only by design, so nothing degrades to localStorage.

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------
-- One row per paint per user, carrying which of the two lists it is in.
--
-- A `status` column rather than two booleans: a paint is in exactly one list,
-- so buying something off the wishlist is a single UPDATE and there is no
-- owned-and-wishlisted state for the UI to explain. The unique constraint below
-- is what makes that true, and is also the conflict target the client's upsert
-- names — `setPaintStatus` adds and moves through the same call.
--
-- `paint_id` is the catalogue slug (`Paint.id` from `data/paints/*.json`) and
-- has no foreign key, for the reason given at the top of `../schema.sql`: the
-- paints live in the repo, not the database, so there is no table to point at.
-- The consequence is that an id can outlive its paint — a rename or a removed
-- brand — which the client handles by showing the row as "no longer in the
-- catalogue" rather than dropping it silently.
create table if not exists public.paint_collection (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  paint_id   text not null,
  status     text not null default 'owned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The lists are always read for one user, usually split by status.
create index if not exists paint_collection_user_idx
  on public.paint_collection (user_id, status);

-- Both the "one list per paint" rule and the upsert's conflict target. Named
-- explicitly rather than declared inline on the column, so `on conflict
-- (user_id, paint_id)` in the client resolves to something with a stable name.
create unique index if not exists paint_collection_user_paint_key
  on public.paint_collection (user_id, paint_id);

-- ---------------------------------------------------------------------------
-- 2. Limits, in the database.
-- ---------------------------------------------------------------------------
-- The browser writes these rows directly with the public anon key, so every
-- bound has to live here — the same reasoning as `schemes_data_size` and
-- `schemes_title_length`. A client-side check is a courtesy to the user, not a
-- constraint on anyone.
alter table public.paint_collection
  drop constraint if exists paint_collection_status;
alter table public.paint_collection
  add constraint paint_collection_status
  check (status in ('owned', 'wishlist'));

-- Catalogue ids run to about 80 characters at their longest; 200 is slack, not
-- a target. Without it `paint_id` is unbounded text and the row cap below is
-- the only thing standing between an account and an arbitrary amount of storage.
alter table public.paint_collection
  drop constraint if exists paint_collection_paint_id_length;
alter table public.paint_collection
  add constraint paint_collection_paint_id_length
  check (char_length(paint_id) between 1 and 200);

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security.
-- ---------------------------------------------------------------------------
-- Four owner-only policies, and deliberately nothing else. There is no public
-- or shared view of a collection, so unlike `schemes` there is no anonymous
-- read to carve out — and no `security definer` function is needed either.
--
-- Every policy name is dropped first, so re-running this file replaces rather
-- than fails, and so a policy renamed in a future migration leaves nothing
-- behind. Permissive policies OR together: an orphan left here would widen
-- access, not narrow it.
alter table public.paint_collection enable row level security;

drop policy if exists "paint_collection select own"  on public.paint_collection;
drop policy if exists "paint_collection insert self" on public.paint_collection;
drop policy if exists "paint_collection update self" on public.paint_collection;
drop policy if exists "paint_collection delete self" on public.paint_collection;

create policy "paint_collection select own" on public.paint_collection
  for select using (auth.uid() = user_id);

create policy "paint_collection insert self" on public.paint_collection
  for insert with check (auth.uid() = user_id);

create policy "paint_collection update self" on public.paint_collection
  for update using (auth.uid() = user_id);

create policy "paint_collection delete self" on public.paint_collection
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. `updated_at` maintenance.
-- ---------------------------------------------------------------------------
-- `public.touch_updated_at()` already exists — it is what keeps `schemes`
-- honest, and any project this file runs against has that table. It is restated
-- here only so the trigger below has something to resolve if this is ever run
-- against an older bootstrap.
--
-- The body must stay **byte-identical to the one in `../schema.sql`**: this is
-- `create or replace`, so a version missing the pinned `search_path` would not
-- fail, it would quietly downgrade the function that `schemes_touch` also uses.
create or replace function public.touch_updated_at()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists paint_collection_touch on public.paint_collection;
create trigger paint_collection_touch
  before update on public.paint_collection
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. A row cap per account.
-- ---------------------------------------------------------------------------
-- An abuse backstop, not a product limit: the catalogue is about 4,900 paints,
-- so someone who genuinely owns everything must still fit. 5,000 leaves room
-- for the catalogue to grow before anyone real meets this, while still bounding
-- what a stolen anon key can insert.
--
-- `security definer` with a pinned `search_path`, like `enforce_scheme_quota`:
-- the counting select must not be filtered by the caller's own RLS, and the
-- function must not be resolvable against a caller-controlled schema.
--
-- `before insert` only. An update moves a paint between lists and cannot change
-- the row count, so charging it the count query would be pure cost.
create or replace function public.enforce_paint_collection_quota()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  max_paints constant int := 5000;
begin
  if (select count(*) from public.paint_collection where user_id = new.user_id) >= max_paints then
    raise exception 'Collection limit reached (max % paints per account).', max_paints
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists paint_collection_quota on public.paint_collection;
create trigger paint_collection_quota
  before insert on public.paint_collection
  for each row execute function public.enforce_paint_collection_quota();

-- ---------------------------------------------------------------------------
-- 6. Record that this ran.
-- ---------------------------------------------------------------------------
-- Last statement, so a file that fails part-way through doesn't claim success.
insert into public.schema_migrations (filename)
values ('0005-v0.14.0-paint-collection.sql')
on conflict (filename) do nothing;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--   -- the table exists, with RLS on and four policies
--   select relrowsecurity from pg_class where oid = 'public.paint_collection'::regclass;
--                                                            -- true
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'paint_collection'
--   order by policyname;                                     -- 4 rows
--
--   -- the constraint rejects a third list
--   insert into public.paint_collection (user_id, paint_id, status)
--   values (auth.uid(), 'test-paint', 'maybe');              -- check_violation
--
--   -- and the unique index makes an upsert a move, not a duplicate
--   insert into public.paint_collection (user_id, paint_id, status)
--   values (auth.uid(), 'test-paint', 'wishlist')
--   on conflict (user_id, paint_id) do update set status = excluded.status;
--   insert into public.paint_collection (user_id, paint_id, status)
--   values (auth.uid(), 'test-paint', 'owned')
--   on conflict (user_id, paint_id) do update set status = excluded.status;
--   select count(*), max(status) from public.paint_collection
--   where paint_id = 'test-paint';                           -- 1, 'owned'
--   delete from public.paint_collection where paint_id = 'test-paint';
--
--   -- nothing is readable anonymously
--   set local role anon;
--   select count(*) from public.paint_collection;            -- 0
--
--   -- and everything in supabase/migrations/ is now accounted for
--   select filename from public.schema_migrations order by filename;
