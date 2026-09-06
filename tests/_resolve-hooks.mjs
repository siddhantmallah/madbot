// Node's ESM resolver requires file extensions. The modules under lib/ are
// written for the Next.js bundler and import each other extensionlessly
// ("./plans"), so a bare `node --test` cannot load lib/entitlements.js at all.
//
// This hook adds the extension back on for relative specifiers only. It changes
// nothing about the modules under test — it is the bundler's resolution rule,
// reimplemented for the test process.

const RELATIVE = /^\.\.?\//;
const HAS_EXT = /\.[cm]?[jt]sx?$/i;

export async function resolve(specifier, context, nextResolve) {
  if (RELATIVE.test(specifier) && !HAS_EXT.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      // Fall through to the real resolver so the original error is reported.
    }
  }
  return nextResolve(specifier, context);
}
