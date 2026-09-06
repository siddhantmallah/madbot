// Resolve hook: lets plain Node import the repo's lib/*.js modules, which use
// extensionless relative specifiers (a bundler convention Node's ESM resolver
// does not implement). Test-only; nothing under lib/ or app/ is touched.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (/^\.{1,2}\//.test(specifier) && !/\.(m?js|cjs|json|node)$/i.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of [".js", ".mjs", "/index.js"]) {
      if (existsSync(fileURLToPath(new URL(base.href + ext)))) {
        return next(specifier + ext, context);
      }
    }
  }
  return next(specifier, context);
}
