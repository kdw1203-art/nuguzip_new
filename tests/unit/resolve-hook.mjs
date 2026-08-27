/**
 * resolve 훅 — @/ 별칭과 확장자 없는 상대 import 를 실제 .ts 파일로 해석한다.
 * register.mjs 가 등록한다. 테스트 실행 시에만 쓰인다.
 *
 * [2026-08-27 수리] 윈도우에서 상대 import 가 전부 깨져 있었다.
 *
 * 예전 코드는 부모 파일의 디렉터리를 이렇게 구했다:
 *     const dir = parentPath.slice(0, parentPath.lastIndexOf("/"));
 * 그런데 윈도우에서 fileURLToPath 는 역슬래시 경로를 돌려준다
 * (C:\...\tests\unit\x.test.ts). 거기엔 "/" 가 하나도 없으므로 lastIndexOf 는
 * -1 이고, slice(0, -1) 은 **파일명 마지막 한 글자만 잘라 낸다**:
 *     C:\...\tests\unit\x.test.t
 * 이걸 디렉터리로 쓰면 ../../lib/... 가 한 단계 얕게 풀려
 * tests/lib/... 를 찾다 실패하고, 훅이 그냥 통과시켜 ERR_MODULE_NOT_FOUND 가 난다.
 * 그래서 확장자를 **적어 준** 테스트(`.../ai-tools.ts`)만 통과하고, 확장자를
 * 생략한 테스트(plan-labels·billing-periods·fail-categories·imjang-* 등)는
 * 윈도우에서만 통째로 실패했다. 리눅스(CI·컨테이너)에서는 "/" 라 멀쩡했으므로
 * 아무도 못 봤다 — 플랫폼 하나에서만 죽는 조용한 고장이다.
 *
 * 경로 조작은 손으로 하지 않고 node:path 에 맡긴다(구분자를 아는 유일한 코드다).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.cwd();

function firstExisting(baseNoExt) {
  for (const cand of [
    baseNoExt,
    `${baseNoExt}.ts`,
    `${baseNoExt}.tsx`,
    path.join(baseNoExt, "index.ts"),
  ]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // @/foo/bar → <root>/foo/bar(.ts|.tsx|/index.ts)
  if (specifier.startsWith("@/")) {
    const hit = firstExisting(path.resolve(ROOT, specifier.slice(2)));
    if (hit) return nextResolve(pathToFileURL(hit).href, context);
  }
  // ./x or ../x without extension → add .ts/.tsx
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[cm]?[jt]sx?$/.test(specifier)
  ) {
    if (context.parentURL) {
      const dir = path.dirname(fileURLToPath(context.parentURL));
      const hit = firstExisting(path.resolve(dir, specifier));
      if (hit) return nextResolve(pathToFileURL(hit).href, context);
    }
  }
  return nextResolve(specifier, context);
}
