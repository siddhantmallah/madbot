// `next lint` was removed in Next 16; this is the setup its docs give in its
// place (node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  // A variable used but never defined. Off in the Next preset, and that let a
  // ReferenceError reach production on 2026-10-15: /api/orgs/me read a
  // `settings` whose declaration had been deleted, and every dashboard load
  // failed. Not on scripts/, whose CommonJS Node globals the preset doesn't
  // declare.
  {
    files: ["app/**/*.js", "lib/**/*.js", "proxy.js"],
    rules: { "no-undef": "error" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // A design handoff with its own bundled code, not part of the app.
    "UI Mockups for Sheet-handoff/**",
    ".claude/**",
  ]),
]);
