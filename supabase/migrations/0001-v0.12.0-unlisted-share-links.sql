-- v0.12.0 — the database delta, for a project that already has the schema.
--
-- Apply THIS on an existing project, not the whole of `../schema.sql`. That
-- file is the bootstrap for a fresh project: it is a hundred-odd statements
-- covering the entire schema, the Supabase SQL editor runs a pasted script as a
-- single transaction, and so *any* statement failing — including ones unrelated
-- to what you are changing — silently rolls back the ones you actually wanted.
--
-- That is not theoretical. Running the full file for this release aborted on
-- some earlier statement, took `get_public_scheme` down with it, and left
-- production serving "Scheme not available" for every share link while the
-- permissive policy it was supposed to remove stayed in place.
--
-- Every statement here is idempotent, so re-running it is safe, including
-- part-way through.
--
-- Run it BEFORE deploying the v0.12.0 code: the app calls the function below
-- and has no fallback if it is missing.

-- ---------------------------------------------------------------------------
-- 1. Published schemes become unlisted rather than world-readable.
-- ---------------------------------------------------------------------------
-- Permissive SELECT policies are OR-combined, so this one did not mean
-- "readable via its link" — it meant "readable by anyone who asks". With the
-- shipped anon key, `select('*')` returned every published scheme in the
-- database: title, full `data`, and `user_id`.
drop policy if exists "schemes select public" on public.schemes;

-- The replacement, and the only way an anonymous reader can see someone else's
-- row. `security definer` is what lets it return a row the caller has no policy
-- for, which makes its body the security boundary — keep it this narrow: an
-- equality match on `share_slug`, an `is_public` check, no pattern match, no
-- ordering, no offset. `user_id` is deliberately not in the result.
create or replace function public.get_public_scheme(p_slug text)
  returns table (
    id         uuid,
    title      text,
    data       jsonb,
    share_slug text,
    created_at timestamptz,
    updated_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select s.id, s.title, s.data, s.share_slug, s.created_at, s.updated_at
  from public.schemes s
  where s.share_slug = p_slug
    and s.is_public = true
  limit 1;
$$;

-- `public` here is the SQL pseudo-role (everyone), not the `public` schema.
revoke all on function public.get_public_scheme(text) from public;
grant execute on function public.get_public_scheme(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cap the scheme title.
-- ---------------------------------------------------------------------------
-- Client-supplied and previously unbounded, which defeated the `data` size cap
-- beside it — and that string is what the share page and the generated
-- OpenGraph image render.
--
-- If this fails, some existing row is over the limit. Find them with:
--   select id, length(title) from public.schemes where length(title) > 200;
alter table public.schemes drop constraint if exists schemes_title_length;
alter table public.schemes
  add constraint schemes_title_length check (length(title) <= 200);

-- ---------------------------------------------------------------------------
-- 3. Pin the trigger function's search_path.
-- ---------------------------------------------------------------------------
-- The other two functions in the schema already do this; Supabase's linter
-- flags the omission as `function_search_path_mutable`.
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

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--   select * from public.get_public_scheme('<a-real-share-slug>');  -- one row
--   set local role anon;
--   select count(*) from public.schemes;                            -- 0
