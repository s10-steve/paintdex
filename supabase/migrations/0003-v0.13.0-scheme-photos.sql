-- v0.13.0 — model photos for the share-image studio, stored in Supabase Storage.
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
-- Run `0002-…` first: this file's last statement records itself in the table
-- that one creates.
--
-- Run both BEFORE deploying the v0.13.0 code: the studio uploads to the bucket
-- below and the share page selects the new column, and neither has a fallback.

-- ---------------------------------------------------------------------------
-- 1. Where a scheme's photo lives.
-- ---------------------------------------------------------------------------
-- A column on `schemes`, deliberately NOT a field inside `data`.
--
-- `data` is the export shape, and `canonicalScheme()` stringifies it to decide
-- whether the editor holds edits that never reached the server. Putting the
-- photo reference in there would change that string for every existing row at
-- once, so every document would look dirty on its next load — and
-- `duplicateScheme` would copy the pointer, quietly pointing someone's "save a
-- copy" at the original owner's photo.
--
-- The value is the object name inside the `scheme-photos` bucket, always
-- `<user_id>/<scheme_id>.jpg`. Deterministic, so replacing a photo overwrites
-- the object rather than orphaning it.
alter table public.schemes add column if not exists photo_path text;

-- ---------------------------------------------------------------------------
-- 2. The bucket.
-- ---------------------------------------------------------------------------
-- Private. A public bucket serves its objects with no auth at all, which would
-- leave a photo readable forever — including after the scheme is unpublished or
-- deleted — and that is the shape of hole section 1 of the previous migration
-- closed for scheme rows.
--
-- The size and MIME limits are the storage equivalent of `schemes_data_size`:
-- the browser uploads directly with the public anon key, so the cap has to live
-- in the database. One object per scheme, times the existing 100-scheme cap,
-- bounds what an account can consume.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scheme-photos', 'scheme-photos', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 3. Who can read and write those objects.
-- ---------------------------------------------------------------------------
-- Owners work inside their own folder, keyed on the first path segment. The
-- app never constructs a path any other way, but the policy is what makes that
-- true rather than merely customary.
drop policy if exists "scheme photos read own"   on storage.objects;
drop policy if exists "scheme photos insert own" on storage.objects;
drop policy if exists "scheme photos update own" on storage.objects;
drop policy if exists "scheme photos delete own" on storage.objects;
drop policy if exists "scheme photos read published" on storage.objects;

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

-- The anonymous read, for the public share page.
--
-- This is a SECOND permissive SELECT policy on `storage.objects`, and permissive
-- policies OR together — so it widens access rather than narrowing it. That is
-- only acceptable because of how narrow it is: an object is readable anonymously
-- if, and only if, some scheme currently points at it *and* that scheme is
-- published. Unpublishing revokes it in the same instant, with no cache to
-- invalidate and no link to rotate.
--
-- It still does not make the object fetchable without a URL: the bucket is
-- private, so the page mints a short-lived signed URL, and signing is itself
-- gated on this policy passing.
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
-- 4. The share page needs the path.
-- ---------------------------------------------------------------------------
-- `create or replace` cannot change a function's OUT columns, so this is a drop
-- and recreate. The body stays exactly as narrow as it was: an equality match
-- on `share_slug`, an `is_public` check, no pattern match, no ordering, no
-- offset, and `user_id` still absent from the result.
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
-- 5. Deleting a scheme deletes its photo.
-- ---------------------------------------------------------------------------
-- Without this, every deleted scheme leaves its object behind for good. The
-- client cannot be the one to do it: a scheme deleted on another device, or
-- cascaded away when the account is removed, never runs any of our code.
--
-- security definer because `storage.objects` has its own RLS and the deleting
-- session is not necessarily allowed to touch the row directly.
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
-- 6. Record that this ran.
-- ---------------------------------------------------------------------------
-- Last statement, so a file that fails part-way through doesn't claim success.
insert into public.schema_migrations (filename)
values ('0003-v0.13.0-scheme-photos.sql')
on conflict (filename) do nothing;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--   -- the new column comes back, and only for a published slug
--   select * from public.get_public_scheme('<a-real-share-slug>');   -- one row
--
--   -- the bucket is private and capped
--   select public, file_size_limit from storage.buckets where id = 'scheme-photos';
--                                                            -- false, 2097152
--
--   -- the table itself is still unreadable anonymously
--   set local role anon;
--   select count(*) from public.schemes;                             -- 0
--
--   -- and everything in supabase/migrations/ is now accounted for
--   select filename from public.schema_migrations order by filename;
