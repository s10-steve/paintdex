/**
 * Test setup, run before every suite, in whichever environment that suite asked
 * for.
 *
 * ## Why jsdom's `localStorage` goes missing
 *
 * Node ships a built-in `globalThis.localStorage` (still experimental) from 25
 * onwards. Vitest's jsdom environment copies a key from the jsdom window onto
 * `globalThis` only when that key is **absent** from `globalThis` or is in its
 * own hardcoded `KEYS` list — and `localStorage` is in neither camp, so Node's
 * property wins and the window's real `Storage` is never reachable. `window`,
 * `self` and `document.defaultView` are all repointed at `globalThis` by the
 * same pass, so there is no back door to the window that does have one.
 *
 * **Test for a working `Storage`, not for a missing one.** Without
 * `--localstorage-file` Node 26 evaluates the property to `undefined`, but Node
 * 25 hands back a truthy object with none of the methods on it — so an
 * `!globalThis.localStorage` guard reads it as "already fine", skips the
 * donor, and the suites fail on `localStorage.clear is not a function` instead.
 * Probing for `clear` covers both shapes and costs nothing on CI.
 *
 * The site's whole per-user state layer is `localStorage`, so that's six suites
 * — the visualiser's document, the poster, the deep links — dying on a
 * developer machine while CI (Node 24, which has no such global) stays green.
 * Deleting
 * Node's property first would be the tidy fix, but the only moment that would
 * help is before the environment is built, and a setup file runs after it.
 *
 * So: borrow a real one from a throwaway iframe, whose `contentWindow` is a
 * second jsdom window that Vitest never touched. An iframe rather than a
 * `new JSDOM()` because it needs no import — `@types/jsdom` isn't installed,
 * and `next build` typechecks this directory.
 *
 * **`Storage` is taken from the same window as the instance, deliberately.**
 * jsdom mints its interface classes per window, and `use-poster.test.tsx`
 * patches `Storage.prototype.setItem` to simulate a full quota. Point the class
 * and the instance at different windows and that patch hits nothing — the test
 * would pass by testing nothing.
 *
 * Only in jsdom: the pure `src/lib` suites run on `environment: "node"`, where
 * there is no `window` and nothing that wants storage.
 */
if (typeof window !== "undefined" && typeof globalThis.localStorage?.clear !== "function") {
  const frame = document.createElement("iframe");
  document.documentElement.appendChild(frame);
  // `Storage` is a global class rather than a `Window` member, so the cast is
  // what lets the loop read all three off the same window.
  const donor = frame.contentWindow as (Window & typeof globalThis) | null;
  if (donor) {
    for (const key of ["localStorage", "sessionStorage", "Storage"] as const) {
      Object.defineProperty(globalThis, key, {
        value: donor[key],
        configurable: true,
        writable: true,
      });
    }
  }
}
