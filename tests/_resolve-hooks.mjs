// Node's ESM resolver requires file extensions. The modules under lib/ are
// written for the Next.js bundler and import each other extensionlessly
// ("./plans"), so a bare `node --test` cannot load lib/entitlements.js at all.
//
// This hook adds the extension back on for relative specifiers only. It changes
// nothing about the modules under test — it is the bundler's resolution rule,
// reimplemented for the test process.

const RELATIVE = /^\.\.?\//;
const HAS_EXT = /\.[cm]?[jt]sx?$/i;

// A package subpath with no "exports" map, such as next/server, which route
// handlers import. The bundler resolves it to next/server.js; Node's ESM
// resolver does not, so the tests that call route handlers directly need the
// same rule.
const PACKAGE_SUBPATH = /^(@[^/]+\/)?[^./@][^/]*\/[^/]/;

export async function resolve(specifier, context, nextResolve) {
  if (RELATIVE.test(specifier) && !HAS_EXT.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      // Fall through to the real resolver so the original error is reported.
    }
  }
  if (PACKAGE_SUBPATH.test(specifier) && !HAS_EXT.test(specifier)) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
      return nextResolve(`${specifier}.js`, context);
    }
  }
  return nextResolve(specifier, context);
}
