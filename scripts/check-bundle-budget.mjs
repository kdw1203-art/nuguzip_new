/* [OPT-29] 번들 예산 게이트 — next build 산출물의 라우트별 First-Load JS 상한.
   예산을 넘으면 빌드를 실패시켜 번들 다이어트가 회귀하지 않게 한다.
   측정 방식: .next/app-build-manifest.json 의 라우트별 파일 목록 + 실제 파일 크기(gzip 아님·raw).
   예산은 2026-08-24 실측값 + ~25% 여유로 설정 — 낮추는 방향의 조정만 허용. */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, ".next", "app-build-manifest.json");

/** 라우트: raw KB 상한 (실측 + 여유)
 *
 * [F90] 2026-08-27 재조정 — 여유를 25% 에서 ~8% 로 좁힌다.
 *
 * 처음 예산을 잡을 때는 다이어트 직후라 어디까지 줄어들지 몰라 25% 를 뒀다.
 * 그 뒤 사흘 동안 다섯 라우트가 전부 예산의 63~79% 에 머물렀다 — 즉 지금 예산은
 * "회귀를 잡는 선"이 아니라 "100KB 를 더 늘려도 초록불인 선"이다. 게이트가
 * 실제로 막는 것이 없으면 없는 것과 같다.
 *
 * 여유를 8% 로 좁히면 라우트당 30~40KB 까지는 조용히 늘어나도 되고(정상적인
 * 기능 추가), 그 이상은 빌드가 멈춰 이유를 말하게 된다. 늘리는 방향의 조정은
 * 여전히 근거(무엇이 얼마나 늘었고 왜 필요한가)와 함께여야 한다. */
const BUDGETS_KB = {
  "/page": 495, // 실측 457KB (2026-08-27)
  "/map/page": 375, // 실측 347KB — MapClientLazy 분리 후
  "/analysis/page": 490, // 실측 453KB
  "/analysis/ai/[tool]/page": 480, // 실측 441KB
  "/notes/new/page": 470, // 실측 434KB — VoiceMemoRecorder 분리 후
};

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch {
  console.log("· .next/app-build-manifest.json 없음 — 번들 예산 검사를 건너뜁니다(빌드 산출물 필요).");
  process.exit(0);
}

const pages = manifest.pages ?? {};
let failed = false;
const lines = [];
for (const [route, budgetKb] of Object.entries(BUDGETS_KB)) {
  const files = pages[route];
  if (!Array.isArray(files)) {
    lines.push(`· ${route}: 매니페스트에 없음(라우트 이름 변경?) — 건너뜀`);
    continue;
  }
  let bytes = 0;
  for (const f of new Set(files)) {
    if (!f.endsWith(".js")) continue;
    try {
      bytes += statSync(path.join(ROOT, ".next", f)).size;
    } catch {
      /* 파일 없음 — 무시 */
    }
  }
  const kb = Math.round(bytes / 1024);
  const over = kb > budgetKb;
  if (over) failed = true;
  lines.push(`${over ? "✗" : "✓"} ${route}: ${kb}KB / 예산 ${budgetKb}KB${over ? "  ← 초과!" : ""}`);
}
console.log(lines.join("\n"));
if (failed) {
  console.error("\n번들 예산 초과 — 무거워진 임포트를 분리(next/dynamic)하거나 예산 근거를 갱신하세요.");
  process.exit(1);
}
console.log("✓ 번들 예산 통과");
