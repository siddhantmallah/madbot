// Installs the extensionless-import resolver. Every test file imports this
// first, then reaches for lib/* with a dynamic `await import(...)` — a static
// import would be resolved before this module ever ran.
import { register } from "node:module";

register("./_resolve-hooks.mjs", import.meta.url);
