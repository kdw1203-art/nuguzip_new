import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.join(__dirname, "..", "components", "ui");

/** Vite 별칭 `pkg@1.2.3` → npm 패키지명 */
function stripVersionedImports(source) {
  return source
    .replace(/from\s+["']([^"']+)@[^"']+["']/g, 'from "$1"')
    .replace(/import\s+["']([^"']+)@[^"']+["']/g, 'import "$1"')
    .replace(/from\s+["']\.\/utils["']/g, 'from "@/lib/utils"')
    .replace(/from\s+["']\.\.\/\.\.\/lib\/utils["']/g, 'from "@/lib/utils"');
}

function walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(name.name)) {
      const raw = fs.readFileSync(p, "utf8");
      const next = stripVersionedImports(raw);
      if (next !== raw) fs.writeFileSync(p, next, "utf8");
    }
  }
}

walk(uiDir);
console.log("normalize-ui-imports: done");
