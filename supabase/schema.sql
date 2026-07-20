-- Paintdex — Supabase schema (Phase 1: accounts + saved schemes)
--
-- Paintdex stays a static site: the browser talks to Supabase directly, so
-- security lives entirely in Row-Level Security. Every table MUST have RLS
-- enabled — a table without RLS is world-readable/writable with the public
-- anon key.
--
-- Run this in the Supabase SQL editor (or `supabase db push`). It is
-- idempotent-ish: safe to re-run on a fresh project. Paint references are
-- stored as plain text slugs (Paint.id from data/paints/*.json) — paints live
-- in the repo, not the DB, so there is no foreign key to a paints table.

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

-- schemes: owner has full CRUD; anyone (incl. logged-out) can read public ones.
-- The two SELECT policies are OR-combined, giving "own rows OR public rows".
drop policy if exists "schemes select own"    on public.schemes;
drop policy if exists "schemes select public" on public.schemes;
drop policy if exists "schemes insert self"   on public.schemes;
drop policy if exists "schemes update self"   on public.schemes;
drop policy if exists "schemes delete self"   on public.schemes;
create policy "schemes select own"    on public.schemes for select using (auth.uid() = user_id);
create policy "schemes select public" on public.schemes for select using (is_public = true);
create policy "schemes insert self"   on public.schemes for insert with check (auth.uid() = user_id);
create policy "schemes update self"   on public.schemes for update using (auth.uid() = user_id);
create policy "schemes delete self"   on public.schemes for delete using (auth.uid() = user_id);

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
