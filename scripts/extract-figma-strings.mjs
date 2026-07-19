import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const f = path.join(os.tmpdir(), "figma-bundle.js");
const s = fs.readFileSync(f, "utf8");

const paths = new Set();
for (const m of s.matchAll(/["'](\/[a-zA-Z0-9_\-/?#]{1,48})["']/g)) {
  paths.add(m[1]);
}
console.log("--- paths ---");
console.log([...paths].sort().join("\n"));
