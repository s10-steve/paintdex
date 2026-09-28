import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkRelease, compareVersions } from "../scripts/check-release.mjs";

/**
 * The changelog check's release rule: a PR that changes `src/` versions and
 * dates itself (see "The changelog and releasing" in CLAUDE.md). Each case is
 * a way the old "cut it later" habit, or a merge race, would slip past.
 */
const TODAY = "2026-09-29";

const changelog = (...sections: string[]) =>
  ["# Changelog", "", "Intro.", "", ...sections].join("\n") + "\n";
const BASE_CHANGELOG = changelog(
  "## [Unreleased]",
  "",
  "## [0.16.0] - 2026-09-28",
  "",
  "### Fixed",
  "",
  "- **An old fix.**",
);
const pkg = (version: string) => JSON.stringify({ name: "paintdex", version });
const lock = (a: string, b = a) => JSON.stringify({ name: "paintdex", version: a, packages: { "": { version: b } } });

const released = (version: string, date = TODAY) =>
  changelog(
    "## [Unreleased]",
    "",
    `## [${version}] - ${date}`,
    "",
    "### Added",
    "",
    "- **A new thing.**",
    "",
    "## [0.16.0] - 2026-09-28",
    "",
    "### Fixed",
    "",
    "- **An old fix.**",
  );

const run = (over: Partial<Parameters<typeof checkRelease>[0]> = {}) =>
  checkRelease({
    baseChangelog: BASE_CHANGELOG,
    headChangelog: released("0.17.0"),
    basePackage: pkg("0.16.0"),
    headPackage: pkg("0.17.0"),
    headLock: lock("0.17.0"),
    today: TODAY,
    ...over,
  });

describe("checkRelease", () => {
  it("passes a PR that bumps, dates and heads its own release", () => {
    expect(run()).toEqual({ errors: [], warnings: [], version: "0.17.0" });
    expect(run({ headPackage: pkg("0.16.1"), headLock: lock("0.16.1"), headChangelog: released("0.16.1") }).errors).toEqual([]);
  });

  it("fails the old habit: entries under [Unreleased], no bump", () => {
    const { errors } = run({
      headChangelog: changelog("## [Unreleased]", "", "### Added", "", "- **A new thing.**", "", "## [0.16.0] - 2026-09-28", "", "- **An old fix.**"),
      headPackage: pkg("0.16.0"),
      headLock: lock("0.16.0"),
    });
    expect(errors.join("\n")).toMatch(/still 0\.16\.0/);
    expect(errors.join("\n")).toMatch(/Entries are under '## \[Unreleased\]'/);
    // Its newest heading is the base's own [0.16.0] — nothing new was released.
    expect(errors.join("\n")).toMatch(/\[0\.16\.0\] is already released/);
  });

  it("fails a bump that goes backwards or sideways", () => {
    expect(run({ headPackage: pkg("0.15.9"), headLock: lock("0.15.9"), headChangelog: released("0.15.9") }).errors[0]).toMatch(/Bump it/);
  });

  it("fails when package-lock.json's two root versions weren't bumped with it", () => {
    expect(run({ headLock: lock("0.16.0") }).errors).toEqual([expect.stringMatching(/0\.16\.0 and 0\.16\.0, not 0\.17\.0/)]);
    expect(run({ headLock: lock("0.17.0", "0.16.0") }).errors).toHaveLength(1);
  });

  it("fails a version that doesn't match the newest changelog heading", () => {
    expect(run({ headChangelog: released("0.17.1") }).errors).toEqual([expect.stringMatching(/newest release .* \[0\.17\.1\], not \[0\.17\.0\]/)]);
  });

  it("fails an undated, malformed or impossible date", () => {
    const undated = released("0.17.0").replace(` - ${TODAY}`, "");
    expect(run({ headChangelog: undated }).errors).toEqual([expect.stringMatching(/needs a date/)]);
    expect(run({ headChangelog: released("0.17.0", "29/09/2026") }).errors).toEqual([expect.stringMatching(/needs a date/)]);
    expect(run({ headChangelog: released("0.17.0", "2026-02-30") }).errors).toEqual([expect.stringMatching(/needs a date/)]);
  });

  it("fails a release dated before the one it follows", () => {
    expect(run({ headChangelog: released("0.17.0", "2026-09-01") }).errors).toEqual([
      expect.stringMatching(/dated 2026-09-01, before \[0\.16\.0\] \(2026-09-28\)/),
    ]);
  });

  it("only warns about a date that isn't today — a PR can wait for review", () => {
    const { errors, warnings } = run({ headChangelog: released("0.17.0", "2026-09-28") });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([expect.stringMatching(/change it to 2026-09-29/)]);
  });

  it("fails a version the base branch already released — the second of two PRs in flight", () => {
    const base = released("0.17.0", "2026-09-29");
    expect(run({ baseChangelog: base, basePackage: pkg("0.17.0") }).errors.join("\n")).toMatch(/already released on the base branch/);
  });

  it("fails an empty release heading", () => {
    const empty = changelog("## [Unreleased]", "", `## [0.17.0] - ${TODAY}`, "", "## [0.16.0] - 2026-09-28", "", "- **An old fix.**");
    expect(run({ headChangelog: empty }).errors).toEqual([expect.stringMatching(/has no entries/)]);
  });

  it("fails a changelog that doesn't open with [Unreleased]", () => {
    expect(run({ headChangelog: released("0.17.0").replace("## [Unreleased]\n\n", "") }).errors).toEqual([
      expect.stringMatching(/must start with an empty '## \[Unreleased\]'/),
    ]);
  });
});

describe("compareVersions", () => {
  it("compares numerically, not as strings", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("0.16.0", "0.16.0")).toBe(0);
    expect(compareVersions("0.16.0", "0.16.1")).toBe(-1);
  });
});

/**
 * The repo's own files have to satisfy the parser, or the first real PR finds
 * the check broken rather than the release.
 */
describe("the real CHANGELOG.md and package.json", () => {
  it("agree on the newest release, with [Unreleased] empty on top", () => {
    const md = readFileSync("CHANGELOG.md", "utf8");
    const version = JSON.parse(readFileSync("package.json", "utf8")).version;
    const [date] = md.match(new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\] - (\\S+)$`, "m"))!.slice(1);
    const { errors } = checkRelease({
      baseChangelog: "# Changelog\n",
      headChangelog: md,
      basePackage: JSON.stringify({ version: "0.0.0" }),
      headPackage: readFileSync("package.json", "utf8"),
      headLock: readFileSync("package-lock.json", "utf8"),
      today: date,
    });
    expect(errors).toEqual([]);
  });
});
