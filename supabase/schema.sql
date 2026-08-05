-- Paintdex — Supabase schema (Phase 1: accounts + saved schemes)
--
-- Paintdex stays a static site: the browser talks to Supabase directly, so
-- security lives entirely in Row-Level Security. Every table MUST have RLS
-- enabled — a table without RLS is world-readable/writable with the public
-- anon key.
--
-- **This file is for bootstrapping a fresh project.** To change an existing
-- one, write a delta in `supabase/migrations/` and run that instead.
--
-- The reason is not style. The SQL editor runs a pasted script as a single
-- transaction, so any statement failing rolls back every other statement with
-- it — including the change you came to make. Pasting this whole file to apply
-- a two-line change means betting that all hundred-odd statements still succeed
-- against the live database, and losing that bet quietly. v0.12.0 lost it: the
-- run aborted somewhere, `get_public_scheme` was never created, and production
-- served "Scheme not available" for every share link while the permissive
-- policy the release existed to remove stayed exactly where it was.
--
-- Run this in the Supabase SQL editor (or `supabase db push`). It is
-- idempotent-ish: safe to re-run on a fresh project. Paint references are
-- stored as plain text slugs (Paint.id from data/paints/*.json) — paints live
-- in the repo, not the DB, so there is no foreign key to a paints table.

-- ---------------------------------------------------------------------------
-- schema_migrations: which files in supabase/migrations/ have been applied.
--
-- A project bootstrapped from this file already has everything those deltas
-- would do, so they are all recorded as applied at the bottom of this file —
-- otherwise a fresh project would look years behind and someone would helpfully
-- "catch it up" by replaying them.
-- ---------------------------------------------------------------------------
create table if not exists public.schema_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now()
);
-- No policies, so none can be OR-combined into something wider later. This is
-- deployment bookkeeping; the browser has no reason to read it.
alter table public.schema_migrations enable row level security;
comment on table public.schema_migrations is
  'Which files in supabase/migrations/ have been applied. Written by hand as the last statement of each migration.';

-- ---------------------------------------------------------------------------
-- profiles: 1:1 with auth.users, created automatically on signup.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- schemes: one row per saved scheme. `data` is the exportSchemeJSON() shape
-- (jsonb, versioned by its `format` field). is_public / share_slug are unused
-- in Phase 1 but included now so the later share-link feature needs no
-- migration.
-- ---------------------------------------------------------------------------
create table if not exists public.schemes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'Untitled scheme',
  data       jsonb not null,
  is_public  boolean not null default false,
  share_slug text unique,
  -- Object name in the `scheme-photos` bucket, always `<user_id>/<scheme_id>.jpg`.
  -- A column rather than a field inside `data`, because `data` is stringified by
  -- `canonicalScheme()` to detect unflushed edits, and is what `duplicateScheme`
  -- copies wholesale.
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists schemes_user_idx on public.schemes (user_id);
create index if not exists schemes_share_idx
  on public.schemes (share_slug) where share_slug is not null;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.schemes  enable row level security;

-- profiles: a user can read only their own profile, and write only their own.
-- Phase 1 never displays anyone else's profile, so there is no reason to expose
-- the whole table (a world-readable policy would let anyone with the public
-- anon key enumerate every user id + signup time). When public share links
-- land and a scheme's author name needs to show, add a narrow policy that
-- exposes just the profiles referenced by a public scheme — don't reopen the
-- table with `using (true)`.
drop policy if exists "profiles read"        on public.profiles;
drop policy if exists "profiles read self"   on public.profiles;
drop policy if exists "profiles upsert self" on public.profiles;
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles read self"   on public.profiles for select using (auth.uid() = id);
create policy "profiles upsert self" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update self" on public.profiles for update using (auth.uid() = id);

-- schemes: the owner has full CRUD, and that is the ONLY select policy.
--
-- There used to be a second one — `using (is_public = true)` — so that the
-- share viewer could read a published scheme anonymously. Permissive SELECT
-- policies are OR-combined, so that policy did not mean "readable via its
-- link"; it meant "readable by anyone who asks". With the shipped anon key,
-- `from('schemes').select('*')` returned every published scheme in the
-- database — title, full `data` and `user_id` — with no slug required. The
-- share UI promises "anyone with the link can view", and a 40-bit unguessable
-- token is pointless if enumeration isn't needed to get the whole table.
--
-- Published schemes are therefore *unlisted*: reachable only by slug, through
-- `public.get_public_scheme` below, which is `security definer` and so is the
-- one and only way an anonymous reader can see someone else's row.
drop policy if exists "schemes select own"    on public.schemes;
drop policy if exists "schemes select public" on public.schemes;
drop policy if exists "schemes insert self"   on public.schemes;
drop policy if exists "schemes update self"   on public.schemes;
drop policy if exists "schemes delete self"   on public.schemes;
create policy "schemes select own"    on public.schemes for select using (auth.uid() = user_id);
create policy "schemes insert self"   on public.schemes for insert with check (auth.uid() = user_id);
create policy "schemes update self"   on public.schemes for update using (auth.uid() = user_id);
create policy "schemes delete self"   on public.schemes for delete using (auth.uid() = user_id);

-- The single slug-scoped read: one published scheme, by exact share slug.
--
-- `security definer` bypasses RLS, which is the point — it's what lets this
-- return a row the caller has no policy for. That makes its body the security
-- boundary, so keep it exactly this narrow: an equality match on `share_slug`,
-- an `is_public` check, and no way to ask for anything else. There is no
-- pattern match, no ordering and no offset, so it cannot be walked.
--
-- `user_id` is deliberately not in the result: the viewer never displays an
-- author, and the old blanket policy exposed it to anyone who asked.
drop function if exists public.get_public_scheme(text);
create function public.get_public_scheme(p_slug text)
  returns table (
    id         uuid,
    title      text,
    data       jsonb,
    share_slug text,
    photo_path text,
    created_at timestamptz,
    updated_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select s.id, s.title, s.data, s.share_slug, s.photo_path, s.created_at, s.updated_at
  from public.schemes s
  where s.share_slug = p_slug
    and s.is_public = true
  limit 1;
$$;

-- `public` here is the SQL pseudo-role (everyone), not the `public` schema.
revoke all on function public.get_public_scheme(text) from public;
grant execute on function public.get_public_scheme(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: model photos for the share-image studio
-- ---------------------------------------------------------------------------
-- Private bucket. A public one serves its objects with no auth at all, so a
-- photo would stay readable after the scheme was unpublished or deleted — the
-- same hole the `is_public` SELECT policy above turned out to be for rows.
--
-- The size and MIME limits are the storage equivalent of `schemes_data_size`
-- below: uploads go straight from the browser with the anon key, so the cap has
-- to be here. One object per scheme, times the 100-scheme cap, bounds an account.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scheme-photos', 'scheme-photos', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "scheme photos read own"      on storage.objects;
drop policy if exists "scheme photos insert own"    on storage.objects;
drop policy if exists "scheme photos update own"    on storage.objects;
drop policy if exists "scheme photos delete own"    on storage.objects;
drop policy if exists "scheme photos read published" on storage.objects;

-- The owner works inside their own folder, keyed on the first path segment.
create policy "scheme photos read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'scheme-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "scheme photos insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'scheme-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "scheme photos update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'scheme-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "scheme photos delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'scheme-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- The anonymous read, for the public share page. A SECOND permissive SELECT
-- policy, and permissive policies OR together — so it widens access. That is
-- only acceptable because of how narrow it is: readable if and only if some
-- scheme currently points at the object *and* that scheme is published.
-- Unpublishing revokes it immediately. The bucket is still private, so the page
-- mints a short-lived signed URL, and signing is gated on this policy passing.
create policy "scheme photos read published" on storage.objects
  for select to anon
  using (
    bucket_id = 'scheme-photos'
    and exists (
      select 1 from public.schemes s
      where s.photo_path = storage.objects.name
        and s.is_public = true
    )
  );

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep schemes.updated_at fresh on every update.
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

drop trigger if exists schemes_touch on public.schemes;
create trigger schemes_touch
  before update on public.schemes
  for each row execute function public.touch_updated_at();

-- Deleting a scheme deletes its photo. The client can't be the one to do this:
-- a scheme deleted on another device, or cascaded away with the account, never
-- runs any of our code. security definer because `storage.objects` has its own
-- RLS and the deleting session may not be allowed to touch the row directly.
create or replace function public.delete_scheme_photo()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if old.photo_path is not null then
    delete from storage.objects
    where bucket_id = 'scheme-photos' and name = old.photo_path;
  end if;
  return old;
end;
$$;

drop trigger if exists schemes_delete_photo on public.schemes;
create trigger schemes_delete_photo
  after delete on public.schemes
  for each row execute function public.delete_scheme_photo();

-- ---------------------------------------------------------------------------
-- Quotas / abuse limits
-- ---------------------------------------------------------------------------
-- The browser inserts rows directly with the public anon key, so per-account
-- limits must live in the database — the client can't be trusted to enforce
-- them. RLS already restricts a user to their own rows; these bound how many
-- and how large those rows can be, so no single account can run up unbounded
-- storage. Both limits are tunable; a real scheme is only a few KB.

-- Cap each scheme's stored JSON size (~100 KB is very generous).
alter table public.schemes drop constraint if exists schemes_data_size;
alter table public.schemes
  add constraint schemes_data_size check (octet_length(data::text) <= 100000);

-- Cap the title too. It's client-supplied and was unbounded, which defeated the
-- size cap above — a single row could hold megabytes in `title` alone, and that
-- string is what the share page and the generated OpenGraph image render.
alter table public.schemes drop constraint if exists schemes_title_length;
alter table public.schemes
  add constraint schemes_title_length check (length(title) <= 200);

-- Cap the number of schemes per account. A count can't be expressed as a CHECK
-- (it references other rows), so it runs as a BEFORE INSERT trigger. The
-- "Scheme limit reached" message is matched by the visualiser to show a
-- specific, actionable error. security definer + a fixed search_path make the
-- count authoritative regardless of RLS (mirrors handle_new_user above).
create or replace function public.enforce_scheme_quota()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  max_schemes constant int := 100;
begin
  if (select count(*) from public.schemes where user_id = new.user_id) >= max_schemes then
    raise exception 'Scheme limit reached (max % per account).', max_schemes
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists schemes_quota on public.schemes;
create trigger schemes_quota
  before insert on public.schemes
  for each row execute function public.enforce_scheme_quota();

-- ---------------------------------------------------------------------------
-- Migration bookkeeping
-- ---------------------------------------------------------------------------
-- Everything above already includes what each delta in `supabase/migrations/`
-- does, so a project built from this file is up to date by construction. Record
-- them, or the next person to compare the directory against the table will
-- conclude a fresh project is missing every migration ever written.
--
-- **Add a line here whenever you add a migration**, or a newly bootstrapped
-- project (a staging one, say) will diverge from production the first time
-- someone runs the "pending" list against it.
insert into public.schema_migrations (filename) values
  ('0001-v0.12.0-unlisted-share-links.sql'),
  ('0002-v0.13.0-migration-tracking.sql'),
  ('0003-v0.13.0-scheme-photos.sql')
on conflict (filename) do nothing;
