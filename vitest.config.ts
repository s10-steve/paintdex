import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // Node by default — the `src/lib` suites are pure. Component tests opt into
    // jsdom per file with a `@vitest-environment jsdom` docblock.
    environment: "node",
    // See test/setup.ts — Node 26's built-in `localStorage` global shadows
    // jsdom's and reads as undefined.
    setupFiles: ["./test/setup.ts"],
  },
});
