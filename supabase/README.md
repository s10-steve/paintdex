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
| Where its keys live | Vercel env vars, Production scope | Vercel env vars, Preview + Development scopes, and your `.env.local` |

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
   project, and there is nothing to lose if it fails. (See "Applying a change"
   for why you must never do this to production.)
3. Authentication → Providers → Google: enable it and paste the same Google
   client id production uses. Then add the staging origins to that OAuth
   client's **Authorized JavaScript origins** in the Google Cloud console — see
   the caveat below.
4. Settings → API: copy the project URL and the `anon` key.
5. In Vercel → Settings → Environment Variables, add
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the
   staging values, scoped to **Preview** and **Development** only. Leave the
   existing Production values alone. They are inlined at build time, so a
   redeploy is needed for the change to take.
6. Copy the same pair into your local `.env.local`.

After this, `npm run dev` and every PR preview read and write staging. Nothing
you do while developing can touch a real user's scheme.

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

- **Google auth provider** — enabled, with the client id, under Authentication →
  Providers. The client id also goes in `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- **Authorized JavaScript origins** on the Google OAuth client, in the Google
  Cloud console rather than Supabase.
- **Storage bucket settings** are the exception: `scheme-photos` and its size and
  MIME limits *are* in the SQL (`0003-…`), so don't also set them in the UI —
  they'd drift.

## Files here

- `schema.sql` — bootstrap for a **fresh** project only.
- `migrations/` — the deltas, in order, applied by hand.
