// Preload with: node --import ./tests/_register.mjs tests/<file>.test.mjs
import { register } from "node:module";
register("./_resolve-ext.mjs", import.meta.url);
