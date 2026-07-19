/**
 * Webpack 청크 누락(Cannot find module './611.js' 등)은 대부분 .next 캐시 손상입니다.
 * OneDrive 폴더에서 개발하거나, 같은 프로젝트로 dev를 여러 번 띄울 때 자주 납니다.
 */
import { existsSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  join(root, ".next"),
  join(root, ".turbo"),
  join(root, "node_modules", ".cache"),
];

for (const p of targets) {
  if (!existsSync(p)) continue;
  rmSync(p, { recursive: true, force: true });
  console.log("removed:", p);
}
console.log("clean-next: done. 다시 `npm run dev` 하세요.");
