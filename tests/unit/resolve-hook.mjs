/**
 * resolve 훅 — @/ 별칭과 확장자 없는 상대 import 를 실제 .ts 파일로 해석한다.
 * register.mjs 가 등록한다. 테스트 실행 시에만 쓰인다.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.cwd();

function firstExisting(baseNoExt) {
  for (const cand of [baseNoExt, `${baseNoExt}.ts`, `${baseNoExt}.tsx`, `${baseNoExt}/index.ts`]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // @/foo/bar → <root>/foo/bar(.ts|.tsx|/index.ts)
  if (specifier.startsWith("@/")) {
    const hit = firstExisting(`${ROOT}/${specifier.slice(2)}`);
    if (hit) return nextResolve(pathToFileURL(hit).href, context);
  }
  // ./x or ../x without extension → add .ts/.tsx
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    if (context.parentURL) {
      const parentPath = fileURLToPath(context.parentURL);
      const dir = parentPath.slice(0, parentPath.lastIndexOf("/"));
      const hit = firstExisting(`${dir}/${specifier}`);
      if (hit) return nextResolve(pathToFileURL(hit).href, context);
    }
  }
  return nextResolve(specifier, context);
}
