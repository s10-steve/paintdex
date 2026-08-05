/**
 * Drift guard for the hand-applied migration workflow, in the same spirit as
 * `catalogue-sources.test.ts`.
 *
 * `public.schema_migrations` is what makes "is production up to date?" a query
 * rather than a memory, but the database cannot make a migration declare itself
 * — a file that forgets its final insert silently goes unrecorded, and the table
 * quietly stops being trustworthy. Neither can it notice a migration missing
 * from `schema.sql`'s bootstrap block, which would make every freshly created
 * project (the staging one, say) look like it were missing everything.
 *
 * Both are conventions a human has to follow, applied by hand in a SQL editor
 * where nothing runs first. So they're checked here instead, where something
 * does.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SUPABASE_DIR = path.join(process.cwd(), "supabase");
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, "migrations");

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const read = (file: string) => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
const schemaSql = readFileSync(path.join(SUPABASE_DIR, "schema.sql"), "utf8");

/** Filenames inserted into `schema_migrations`, ignoring SQL comments. */
function recordedIn(sql: string): string[] {
  const live = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  return [...live.matchAll(/'([^']+\.sql)'/g)].map((m) => m[1]);
}

describe("supabase migrations", () => {
  it("has migrations to check", () => {
    // Guards the guard: a glob that matches nothing passes every `every` below.
    expect(migrations.length).toBeGreaterThan(0);
  });

  it("names every file `NNNN-vX.Y.Z-description.sql`", () => {
    // The number is the apply order, and it's the only thing carrying it —
    // there is no manifest and no tool reading these.
    for (const file of migrations) {
      expect(file).toMatch(/^\d{4}-v\d+\.\d+\.\d+-[a-z0-9-]+\.sql$/);
    }
  });

  it("gives each migration a unique number", () => {
    const numbers = migrations.map((f) => f.slice(0, 4));
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("records each migration's own filename", () => {
    // 0001 predates the table; it's backfilled by 0002 instead.
    const selfRecording = migrations.filter((f) => !f.startsWith("0001-"));
    for (const file of selfRecording) {
      expect(recordedIn(read(file))).toContain(file);
    }
  });

  it("records the filename as the file's last statement", () => {
    // A file that fails half way must not leave a row claiming it succeeded.
    // Everything before the insert is idempotent, so re-running is the fix.
    for (const file of migrations.filter((f) => !f.startsWith("0001-"))) {
      const sql = read(file);
      const statements = sql
        .split(";")
        .map((s) =>
          s
            .split("\n")
            .filter((line) => !line.trimStart().startsWith("--"))
            .join("\n")
            .trim(),
        )
        .filter(Boolean);
      expect(statements.at(-1)).toContain("schema_migrations");
    }
  });

  it("lists every migration in schema.sql's bootstrap block", () => {
    // Otherwise a project built from schema.sql reports itself as missing every
    // migration ever written, and someone helpfully replays them all.
    const recorded = recordedIn(schemaSql);
    for (const file of migrations) {
      expect(recorded).toContain(file);
    }
  });

  it("never reads an RLS-protected table inline from a storage policy", () => {
    // The bug 0004 fixed, and one that cannot be caught by reading the SQL or by
    // any test that doesn't have a live Postgres: a subquery inside a policy is
    // evaluated with the *calling* role's privileges, so `select … from
    // public.schemes` inside a policy granted `to anon` is itself filtered by
    // `schemes`'s own RLS — which for anon matches nothing. The policy silently
    // becomes "always false".
    //
    // The fix is to ask through a `security definer` function, so this guard
    // just insists the policy body doesn't name the table directly.
    // Anchored on the policy name so a match can't start at some earlier
    // `create policy` and swallow the security-definer function in between —
    // whose body names the table legitimately, and must.
    const policies = [
      ...schemaSql.matchAll(/create policy\s+"[^"]+"\s+on storage\.objects[\s\S]*?;/g),
    ];
    expect(policies.length).toBeGreaterThan(0);
    for (const [policy] of policies) {
      expect(policy).not.toMatch(/from\s+public\.schemes/);
    }
  });

  it("claims no migration in schema.sql that doesn't exist", () => {
    // The other direction: a renamed or deleted file left behind here would
    // mark a migration applied that nobody can read.
    for (const file of recordedIn(schemaSql)) {
      expect(migrations).toContain(file);
    }
  });
});
