-- v0.13.0 — make the anonymous photo read actually work.
--
-- Apply THIS on an existing project, not the whole of `../schema.sql`. See the
-- header of `0001-…` for why that distinction is load-bearing.
--
-- Run after `0003-…`. Safe to run on a project that has never had a photo.
--
-- ---------------------------------------------------------------------------
-- The bug
-- ---------------------------------------------------------------------------
-- `0003` gave `storage.objects` this policy, so the share page could read a
-- published scheme's photo anonymously:
--
--   create policy "scheme photos read published" on storage.objects
--     for select to anon
--     using (
--       bucket_id = 'scheme-photos'
--       and exists (
--         select 1 from public.schemes s
--         where s.photo_path = storage.objects.name and s.is_public = true
--       )
--     );
--
-- It can never pass. A subquery inside a policy is evaluated with the calling
-- role's privileges, so that `select` from `public.schemes` is itself subject to
-- `public.schemes`'s RLS — and the only SELECT policy there is "select own"
-- (`auth.uid() = user_id`). For `anon`, `auth.uid()` is null, so the subquery
-- matches nothing, `exists` is false, and the read is refused. Every share page
-- with a photo logged `createSignedUrl failed` and rendered without it.
--
-- Nothing was insecure — the failure was closed, not open — but the feature did
-- not work, and no amount of reading the policy in isolation shows why. Only
-- running it does.
--
-- ---------------------------------------------------------------------------
-- 1. Ask the question through a security definer function.
-- ---------------------------------------------------------------------------
-- Same instrument as `get_public_scheme`, for the same reason: `security
-- definer` runs the body as the owner, so `public.schemes`'s RLS doesn't hide
-- the row from a caller who is allowed to know this one fact about it.
--
-- Its body is therefore the security boundary, so keep it this narrow: an exact
-- equality match on `photo_path`, an `is_public` check, and a boolean out. There
-- is no pattern match and nothing is returned but yes or no, so it cannot be
-- walked — and answering it at all requires already knowing the full object
-- path, which is `<user_id>/<scheme_id>.jpg`, two uuids. That is strictly less
-- than `get_public_scheme` already discloses for a slug someone holds.
--
-- Note this depends on `public.schemes` NOT having `force row level security`
-- set, which would apply RLS to the owner too and reintroduce the bug.
create or replace function public.is_published_scheme_photo(p_path text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from public.schemes s
    where s.photo_path = p_path
      and s.is_public = true
  );
$$;

-- `public` here is the SQL pseudo-role (everyone), not the `public` schema.
revoke all on function public.is_published_scheme_photo(text) from public;
grant execute on function public.is_published_scheme_photo(text) to anon, authenticated;

-- The lookup now runs on every anonymous object read, so give it an index.
-- Partial, mirroring `schemes_share_idx`: most rows have no photo.
create index if not exists schemes_photo_path_idx
  on public.schemes (photo_path) where photo_path is not null;

-- ---------------------------------------------------------------------------
-- 2. Repoint the policy at it.
-- ---------------------------------------------------------------------------
-- Still `to anon` only, deliberately. The share page is server-rendered with the
-- anon client (`src/lib/supabase/server.ts`) whoever is looking at it, so that is
-- the only role that ever signs one of these URLs. If a signed-in browser is
-- ever made to read another user's published photo directly, widen it then —
-- knowingly — rather than pre-emptively now.
drop policy if exists "scheme photos read published" on storage.objects;
create policy "scheme photos read published" on storage.objects
  for select to anon
  using (
    bucket_id = 'scheme-photos'
    and public.is_published_scheme_photo(name)
  );

-- ---------------------------------------------------------------------------
-- 3. Record that this ran.
-- ---------------------------------------------------------------------------
insert into public.schema_migrations (filename)
values ('0004-v0.13.0-fix-published-photo-read.sql')
on conflict (filename) do nothing;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- With `<path>` the photo_path of a scheme you have PUBLISHED:
--
--   select public.is_published_scheme_photo('<path>');   -- true
--   -- and as the role that actually reads it:
--   set local role anon;
--   select public.is_published_scheme_photo('<path>');   -- true  (was the bug)
--   reset role;
--
-- Then unpublish that scheme and repeat: both must return false. That pair is
-- the whole feature — the second one failing is a broken share page, the fourth
-- one failing is a photo still readable after you unshared it.
--
--   select filename from public.schema_migrations order by filename;  -- 4 rows
