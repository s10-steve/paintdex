#!/usr/bin/env node
/**
 * The release half of the changelog check: a PR that changes `src/` must
 * version itself.
 *
 * Every push to `main` deploys, so a user-facing PR *is* a release, and it
 * names itself in the PR — its own `## [X.Y.Z] - YYYY-MM-DD` heading under an
 * empty `## [Unreleased]`, and the matching bump in `package.json` and
 * `package-lock.json`. Deferring that to a later "cut" is what left eight PRs
 * running unversioned in production and let one entry land under a version
 * that had already been tagged without it. See "The changelog and releasing"
 * in CLAUDE.md.
 *
 * Run by `.github/workflows/changelog.yml` only once it knows the PR touches
 * `src/` and has no `no changelog` label. `checkRelease` is pure, so the rules
 * are pinned in `test/check-release.test.ts`; the CLI below just gathers the
 * base branch's copies through git.
 *
 * Usage: BASE=main node scripts/check-release.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const HEADING = /^## \[([^\]]+)\](?: - (\S+))?\s*$/gm;

/** -1, 0 or 1, for two `X.Y.Z` strings. */
export function compareVersions(a, b) {
  const pa = a.match(SEMVER).slice(1).map(Number);
  const pb = b.match(SEMVER).slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/** A real calendar date in `YYYY-MM-DD`, not merely the right shape. */
function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Every `## [...]` heading, in file order, with where its body starts and ends. */
function headings(md) {
  const out = [];
  for (const m of md.matchAll(HEADING)) {
    out.push({ name: m[1], date: m[2] ?? null, start: m.index, bodyStart: m.index + m[0].length });
  }
  out.forEach((h, i) => (h.end = out[i + 1]?.start ?? md.length));
  return out;
}

/**
 * @param {object} input
 * @param {string} input.baseChangelog  CHANGELOG.md on the base branch
 * @param {string} input.headChangelog  CHANGELOG.md in the PR
 * @param {string} input.basePackage    package.json on the base branch
 * @param {string} input.headPackage    package.json in the PR
 * @param {string} input.headLock       package-lock.json in the PR
 * @param {string} input.today          `YYYY-MM-DD`, UTC
 * @returns {{ errors: string[], warnings: string[], version: string | null }}
 */
export function checkRelease({ baseChangelog, headChangelog, basePackage, headPackage, headLock, today }) {
  const errors = [];
  const warnings = [];

  const baseVersion = JSON.parse(basePackage).version;
  const version = JSON.parse(headPackage).version;
  if (!SEMVER.test(version ?? "")) {
    errors.push(`package.json version "${version}" isn't X.Y.Z.`);
    return { errors, warnings, version: null };
  }
  if (SEMVER.test(baseVersion ?? "") && compareVersions(version, baseVersion) <= 0) {
    errors.push(
      `package.json is still ${version}, and the base branch is at ${baseVersion}. Bump it — minor for anything new, patch for fixes only.`,
    );
  }

  // Edited by hand, never regenerated (see "Dependencies" in CLAUDE.md), so
  // it's easy to bump package.json and forget these two.
  const lock = JSON.parse(headLock);
  const lockVersions = [lock.version, lock.packages?.[""]?.version];
  if (lockVersions.some((v) => v !== version)) {
    errors.push(
      `package-lock.json's root versions are ${lockVersions.map((v) => v ?? "missing").join(" and ")}, not ${version}. Edit both by hand — don't regenerate the lock file.`,
    );
  }

  const head = headings(headChangelog);
  const top = head[0];
  // The newest release is the first heading that isn't [Unreleased], found by
  // name rather than position, so a missing [Unreleased] is reported once
  // instead of also making the wrong heading look like the release.
  const releaseAt = head.findIndex((h) => h.name !== "Unreleased");
  const release = head[releaseAt];
  if (top?.name !== "Unreleased") {
    errors.push("CHANGELOG.md must start with an empty '## [Unreleased]' heading.");
  } else if (headChangelog.slice(top.bodyStart, top.end).trim()) {
    errors.push(
      `Entries are under '## [Unreleased]'. Move them to a '## [${version}] - ${today}' heading below it; [Unreleased] stays empty.`,
    );
  }
  if (!release || release.name !== version) {
    errors.push(
      `The newest release in CHANGELOG.md is ${release ? `[${release.name}]` : "missing"}, not [${version}]. Add '## [${version}] - ${today}' just below '## [Unreleased]'.`,
    );
  } else {
    if (!release.date || !isDate(release.date)) {
      errors.push(`'## [${version}]' needs a date: '## [${version}] - YYYY-MM-DD' (the day it merges).`);
    } else {
      const previous = head.slice(releaseAt + 1).find((h) => h.date && isDate(h.date));
      if (previous && release.date < previous.date) {
        errors.push(`[${version}] is dated ${release.date}, before [${previous.name}] (${previous.date}).`);
      } else if (release.date !== today) {
        // Not an error: a PR can wait for review. But the rule is "the day it
        // merges", so say so while there's still time to fix it.
        warnings.push(`[${version}] is dated ${release.date}; if it merges today, change it to ${today}.`);
      }
    }
    if (!headChangelog.slice(release.bodyStart, release.end).trim()) {
      errors.push(`'## [${version}]' has no entries.`);
    }
  }

  // Two PRs in flight both claim the next number. Whichever merges second
  // finds it taken here — the cue to renumber and re-date.
  if (headings(baseChangelog).some((h) => h.name === version)) {
    errors.push(`[${version}] is already released on the base branch. Take the next number and re-date.`);
  }

  return { errors, warnings, version };
}

function main() {
  const base = process.env.BASE;
  if (!base) throw new Error("Set BASE to the PR's base branch.");
  const atBase = (file) => execFileSync("git", ["show", `origin/${base}:${file}`], { encoding: "utf8" });
  const result = checkRelease({
    baseChangelog: atBase("CHANGELOG.md"),
    headChangelog: readFileSync("CHANGELOG.md", "utf8"),
    basePackage: atBase("package.json"),
    headPackage: readFileSync("package.json", "utf8"),
    headLock: readFileSync("package-lock.json", "utf8"),
    today: new Date().toISOString().slice(0, 10),
  });
  for (const w of result.warnings) console.log(`::warning file=CHANGELOG.md::${w}`);
  for (const e of result.errors) console.log(`::error file=CHANGELOG.md::${e}`);
  if (result.errors.length) process.exit(1);
  console.log(`Release ${result.version} is versioned and dated.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
