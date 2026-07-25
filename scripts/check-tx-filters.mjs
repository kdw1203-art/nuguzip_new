#!/usr/bin/env node
/**
 * #150 안전장치 — 해제(취소)된 실거래가 시세로 다시 새어 들어오는 것을 막는다.
 *
 * 배경(실측, 2026-07-25): market_transactions 의 매매 22,869행 중 402행(1.76%)이
 * 국토부에 해제신고된 계약이었다. cdealType="O" 로 응답에 분명히 들어오는데도
 * 코드 어디에서도 읽지 않아, "없던 일이 된 계약"이 평균가·구간집계·지도 시세·
 * 알림가에 정상 거래로 섞여 있었다. 361개 단지가 영향을 받았고, 그중 33개 단지는
 * 남는 실거래가 하나도 없어 "해제된 계약만으로 존재하던 단지"였다.
 *
 * 지금은 적재 시 is_cancelled 로 표시하고(행 자체는 남긴다 — 해제 이력도 사실이다),
 * 읽는 쪽 전부에서 걸러낸다. 그런데 이 필터는 한 줄이라 새 쿼리를 쓸 때 잊기 쉽다.
 * 그래서 "매매를 읽으면서 해제분을 빼지 않은 쿼리"를 빌드 전에 여기서 막는다.
 *
 * 규칙: 소스에 `.eq("transaction_type", "trade")` 가 있으면, 같은 쿼리 체인 안에
 *       `is_cancelled` 가 함께 있어야 한다.
 * 예외: 줄 끝 또는 바로 윗줄에 `tx-filters-allow: <이유>` 주석을 달면 통과시킨다
 *       (해제된 거래 자체를 보여주는 화면 등, 의도적으로 포함해야 하는 경우).
 *
 * 사용: node scripts/check-tx-filters.mjs   (빌드와 무관 — 소스만 읽는다)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["app", "lib", "scripts"];
const EXTS = [".ts", ".tsx", ".mjs", ".js"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git"]);
/** 이 파일 자신은 규칙 문구를 예시로 담고 있어 스스로를 검사 대상에 넣지 않는다. */
const SELF = fileURLToPath(import.meta.url);

/** 체인 탐색 범위 — PostgREST 체인은 한 줄에 한 메서드씩 쓰므로 앞뒤 15줄이면 충분하다. */
const WINDOW = 15;
const TRADE_FILTER = /\.eq\(\s*["']transaction_type["']\s*,\s*["']trade["']\s*\)/;
const CANCEL_FILTER = /is_cancelled/;
const ALLOW = /tx-filters-allow:/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const offenders = [];
let checked = 0;

for (const dirName of SCAN_DIRS) {
  const dir = join(root, dirName);
  let files = [];
  try {
    files = walk(dir);
  } catch {
    continue; // 없는 디렉터리는 건너뛴다
  }

  for (const file of files) {
    if (file === SELF) continue;
    const src = readFileSync(file, "utf8");
    if (!TRADE_FILTER.test(src)) continue;

    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (!TRADE_FILTER.test(lines[i])) continue;
      checked += 1;

      // 명시적 예외 주석(해당 줄 또는 바로 윗줄)
      if (ALLOW.test(lines[i]) || (i > 0 && ALLOW.test(lines[i - 1]))) continue;

      const from = Math.max(0, i - WINDOW);
      const to = Math.min(lines.length, i + WINDOW + 1);
      const chain = lines.slice(from, to).join("\n");
      if (CANCEL_FILTER.test(chain)) continue;

      offenders.push({
        file: relative(root, file),
        line: i + 1,
        code: lines[i].trim(),
      });
    }
  }
}

if (offenders.length > 0) {
  console.error("\n✗ 해제(취소) 거래 필터 검사 실패\n");
  console.error("  아래 쿼리는 매매 실거래를 읽으면서 해제된 계약을 걸러내지 않습니다.");
  console.error("  해제분이 섞이면 평균가·구간집계·알림가가 실제로 일어나지 않은 거래를 반영합니다.\n");
  for (const o of offenders) {
    console.error(`    - ${o.file}:${o.line}`);
    console.error(`        ${o.code}`);
  }
  console.error("\n  해결: 같은 체인에 .eq(\"is_cancelled\", false) 를 추가하세요.");
  console.error("        의도적으로 해제분을 포함해야 하면 위 줄에");
  console.error("        // tx-filters-allow: <이유> 주석을 남기세요.\n");
  process.exit(1);
}

console.log(`✓ 해제 거래 필터 검사 통과 — 매매 조회 ${checked}곳 모두 is_cancelled 를 제외합니다.`);
