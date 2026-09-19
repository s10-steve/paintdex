import { createRequire } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const require = createRequire(import.meta.url);

/**
 * Tell `eslint-plugin-react` which React this is, instead of letting it look.
 *
 * ESLint 10 removed the deprecated rule-context API that the plugin's version
 * sniffer still calls, so `detect` — the default `eslint-config-next` leaves in
 * place — dies in `resolveBasedir` with `contextOrFilename.getFilename is not a
 * function` before a single file is linted. It is not a config error and not
 * ours to fix upstream: `eslint-plugin-react` 7.37.5 is the current release and
 * `eslint-config-next` bundles it while advertising `eslint: ">=9.0.0"`.
 *
 * Naming the version skips the sniffer entirely — nothing else in the plugin
 * touches that API — and it is the more honest input anyway, since the answer
 * was always going to be whatever `package.json` pins. Read it from there
 * rather than writing it out, or this is a second place to remember on every
 * React bump. Drop the whole block once the bundled plugin supports ESLint 10.
 */
const reactVersion = require("./package.json").dependencies.react;

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: { react: { version: reactVersion } },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
