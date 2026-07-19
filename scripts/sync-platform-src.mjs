/**
 * Vite export 의 `src` 아래 디렉터리들을 `my-app/platform-src` 로 미러합니다.
 * 사용: npm run sync:platform -- "C:/Users/.../Real Estate Community Platform (1)/src"
 *
 * Windows: robocopy exit 0~7 은 성공입니다.
 * 원본에 없는 폴더는 건너뜁니다.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUBDIRS = [
  "assets",
  "components",
  "contexts",
  "data",
  "docs",
  "guidelines",
  "hooks",
  "lib",
  "pages",
  "public",
  "scripts",
  "src",
  "styles",
  "supabase",
  "types",
  "utils",
];

const srcRoot = process.argv[2]?.trim();
if (!srcRoot) {
  console.error(
    "Usage: npm run sync:platform -- \"<path-to-vite-export>/src\"",
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dstRoot = path.join(__dirname, "..", "platform-src");

function mirror(sub) {
  const from = path.join(srcRoot, sub);
  if (!fs.existsSync(from)) {
    console.warn(`sync-platform-src: skip (missing): ${sub}`);
    return;
  }
  const to = path.join(dstRoot, sub);
  const r = spawnSync(
    "robocopy",
    [from, to, "/E", "/IS", "/IT", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"],
    { stdio: "inherit", shell: false, windowsHide: true },
  );
  const code = r.status ?? 1;
  if (code >= 8) {
    console.error(`robocopy failed (${code}): ${sub}`);
    process.exit(code);
  }
}

for (const sub of SUBDIRS) {
  mirror(sub);
}
console.log("sync-platform-src: done →", dstRoot);
