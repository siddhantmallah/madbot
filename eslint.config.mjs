// `next lint` was removed in Next 16; this is the setup its docs give in its
// place (node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
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
