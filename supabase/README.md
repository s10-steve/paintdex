# The Paintdex database

Everything Supabase-shaped: the two projects, how a schema change gets from this
directory to production, and the setup that isn't in code.

Paintdex is a static site — the browser talks to Supabase directly, and the only
server-side read is the one anonymous RPC behind `/scheme/[slug]`. That means
**Row-Level Security is the entire security boundary**, so a schema change is a
security change until proven otherwise, and it is applied by hand rather than by
a deploy pipeline.

## Two projects

| | Production | Staging |
|---|---|---|
| Used by | `paintdex.app` (Vercel Production) | Vercel Preview + local `npm run dev` |
| Data | real users' schemes | throwaway |
| Where its keys live | Vercel env vars, Production scope | Vercel env vars, Preview scope, and your `.env.local` |

Both fit on Supabase's free plan, which allows two active projects per
organisation. Staging exists so a migration can be rehearsed against a real
Postgres with real RLS before it touches anyone's data — the thing you cannot
get from reading the SQL.

### Creating the staging project

1. In the Supabase dashboard, **New project** in the same organisation. Name it
   something unmistakable — `paintdex-staging`. Pick the same region as
   production so latency behaves comparably.
2. SQL editor → paste the **whole of `schema.sql`** and run it. This is the one
   situation where that is the right move: it is the bootstrap for a fresh
   project, so there is no data to lose if it fails. (See "Applying a change" for
   why you must never do this to production.) Nothing at risk isn't the same as
   nothing to check, though — hence the next step.
3. **Check the bootstrap landed**, in the same SQL editor. The whole file is one
   transaction, so a single failure means *nothing* was created — and the storage
   policies are the one part that can fail for a permissions reason rather than a
   syntax one (`create policy … on storage.objects` needs ownership of that
   table, which not every project grants the SQL editor).

   ```sql
   select filename from public.schema_migrations order by filename;    -- 3 rows
   select public, file_size_limit from storage.buckets
     where id = 'scheme-photos';                                       -- false, 2097152
   select count(*) from pg_policies
     where tablename = 'objects' and policyname like 'scheme photos%'; -- 5
   select column_name from information_schema.columns
     where table_name = 'schemes' and column_name = 'photo_path';      -- 1 row
   ```

   Anything short of that and the run didn't complete: paste `schema.sql` again
   (it's idempotent) and read the error. If it's specifically the policies, and
   specifically a permissions error, create them through Storage → Policies in
   the dashboard instead — matching the SQL exactly.

   **Three rows in `schema_migrations` means you do not apply anything from
   `migrations/`.** `schema.sql` already contains everything those deltas do and
   records them as applied, so a freshly bootstrapped project is current by
   construction. Deltas are only for a project that existed before they were
   written — which, in practice, means production.

4. **Supabase → your staging project → Authentication → Providers → Google.**
   Enable it and put the same client id production uses in **Authorized Client
   IDs**. This is per-project and off by default, so a new project always needs
   it: the browser hands Supabase a Google ID token and Supabase checks the
   token's audience against this list.

   Reusing production's OAuth client is fine. The client id only identifies who
   the token was minted for; each Supabase project has its own `auth.users` and
   its own RLS, so signing in against staging creates a staging-only user with no
   relationship to your production account.

5. **Google Cloud console → the same OAuth client → Authorized JavaScript
   origins.** Only if the origin you'll use isn't already listed —
   `http://localhost:3000` usually is, from whenever local sign-in was first set
   up. Check rather than add.

   **No Authorized redirect URIs are needed, for any origin.** Sign-in uses
   Google Identity Services in the browser and exchanges the ID token directly
   (`signInWithIdToken`, see `src/components/auth/auth-provider.tsx`), so Google
   never redirects anywhere and the Supabase callback URL is not part of the
   flow. That's also why the consent screen is branded to our own domain.

6. Settings → API: copy the project URL and the `anon` key.

7. **In Vercel → Settings → Environment Variables, make both halves of the
   switch**, in one sitting:
   - Narrow the **existing** `NEXT_PUBLIC_SUPABASE_*` vars to the **Production**
     scope. They're currently set for every environment, so leaving them means
     two values competing for Preview.
   - Add the **staging** URL and anon key, scoped to **Preview**.

   Do both together: a Preview build with neither pair set ships with accounts
   silently disabled — the site works, sign-in just isn't there — which is a
   confusing way to find out you did half of it.

   Ignore the **Development** scope. It feeds `vercel dev` and `vercel env pull`,
   and this project's local workflow is `npm run dev` against a hand-written
   `.env.local`, which never consults Vercel. Whether the option is available to
   you doesn't matter.

   `NEXT_PUBLIC_*` values are inlined at build time, so **open PR previews keep
   the old ones until they're redeployed**. To confirm which project a deployed
   page is talking to, look at the host on any Supabase request in the network
   tab.

8. Put all three vars in your local `.env.local` — the staging URL and anon key,
   plus `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (the same one). Restart `npm run dev`
   afterwards — the values are read when the server starts, so an already-running
   one won't pick them up.

After this, `npm run dev` and every PR preview read and write staging. Nothing
you do while developing can touch a real user's scheme. Skip step 7 and previews
keep writing to production, which is the one thing this whole arrangement exists
to prevent.

### The Google sign-in caveat

Vercel gives each *deployment* its own URL, and Google will not accept a wildcard
in Authorized JavaScript origins — so sign-in is broken on a bare preview URL no
matter what you configure. Two ways round it:

- **Use the branch alias.** Vercel also publishes a stable per-branch URL
  (`paintdex-git-<branch>-<scope>.vercel.app`). Add the ones you actually use to
  the OAuth client and sign-in works on those.
- **Test auth locally.** `http://localhost:3000` is a stable origin, so add that
  once and the signed-in paths are testable on your machine.

Everything that is *not* auth — RLS behaviour under the anon key, the storage
policies, the share page, triggers, constraints — is testable on any preview
without this.

### Testing the share-image feature

The photo half of the share-image studio is the most database-shaped thing in the
app — a private bucket, four owner policies, one anonymous policy and a delete
trigger — and most of it is only reachable signed in, so localhost is where it
gets exercised. In order:

1. Signed in, on a **saved** scheme, open **Share image** and add a photo. Reload
   the page: it should come back. Storage → `scheme-photos` should hold
   `<user-id>/<scheme-id>.jpg`, and the scheme's `photo_path` should point at it.
   (Signed out, or on a scheme you haven't saved, the photo stays in
   `localStorage` and never reaches the bucket — that's the intended split, not a
   failure.)
2. **Publish** the scheme, then open `/scheme/<slug>` in a private window. The
   photo should render, from a signed URL, with no CSP error in the console.
3. **Unpublish** and hard-reload that window. The signed URL should stop
   resolving — this is the "unlisted, not public" rule holding for objects as
   well as rows, and it is the single most important thing to confirm by hand.
4. **Remove** the photo in the studio, and confirm the object goes from the
   bucket and `photo_path` goes back to null.
5. **Delete** the whole scheme and confirm its object is gone. That one is the
   `schemes_delete_photo` trigger, not the client, so it's the path that also
   covers a scheme deleted on another device.

Steps 2 and 3 are anonymous, so they work on a PR preview too, once Preview
points at staging.

## Applying a change

**Never paste `schema.sql` at production.** The SQL editor runs a pasted script
as a single transaction, so one unrelated statement failing rolls back the change
you came to make, silently. v0.12.0 lost that bet: the run aborted somewhere,
`get_public_scheme` was never created, and production served "Scheme not
available" for every share link while the permissive policy the release existed
to remove stayed exactly where it was. `schema.sql` is the bootstrap for a fresh
project and nothing else.

Instead, per change:

1. **Write a delta** in `migrations/`, named `NNNN-vX.Y.Z-short-description.sql`.
   Every statement idempotent (`if not exists`, `drop policy if exists` before
   `create policy`, `on conflict do nothing`), so re-running it — including
   part-way through a failed run — is safe.
2. **End it by recording itself**, as the last statement:
   ```sql
   insert into public.schema_migrations (filename)
   values ('NNNN-vX.Y.Z-short-description.sql')
   on conflict (filename) do nothing;
   ```
   Last, so a file that fails half way doesn't leave a row claiming success.
3. **Add the same filename to the block at the bottom of `schema.sql`**, so a
   freshly bootstrapped project doesn't look like it is missing every migration
   ever written.
4. **Finish with a `-- Verify` block**: the queries that prove it worked, as
   comments. Every existing migration has one; run it, don't skim it.
5. **Run it against staging first**, then the verify block, then whatever manual
   check the feature needs.
6. **Run it against production before deploying the code that needs it.** Not
   after, and not "at the same time" — a Vercel deploy is fast and a schema
   change is not atomic with it. Confirm it rather than assuming: read the
   verify block's output.

### Is production up to date?

```sql
select filename, applied_at from public.schema_migrations order by filename;
```

Compare against `ls supabase/migrations/`. Anything in the directory and not in
the table has not been run.

The database cannot force a migration to declare itself, so steps 2 and 3 are
conventions — but `test/migrations.test.ts` checks them, and CI runs it. A
migration that forgets to record itself, records itself anywhere but as its last
statement, or is missing from `schema.sql`'s block, fails the build. What no test
can check is whether you actually *ran* the file; that part is still on you, which
is what the query above is for.

## What is not in these files

Applied by hand in the dashboard, and easy to forget when standing up a project:

- **Google auth provider** — enabled, with the client id in Authorized Client
  IDs, under Authentication → Providers. **Per Supabase project**, so every new
  one needs it. The same client id also goes in `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- **Authorized JavaScript origins** on the Google OAuth client — Google Cloud
  console, not Supabase, and shared across every environment that uses that
  client, so it's usually already right. No redirect URIs: see step 5 above.
- **Storage bucket settings** are the exception: `scheme-photos` and its size and
  MIME limits *are* in the SQL (`0003-…`), so don't also set them in the UI —
  they'd drift.

## Files here

- `schema.sql` — bootstrap for a **fresh** project only.
- `migrations/` — the deltas, in order, applied by hand.
