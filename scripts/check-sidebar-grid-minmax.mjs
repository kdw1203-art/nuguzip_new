#!/usr/bin/env node
/* 2단 "본문 + 고정폭 사이드바" 그리드가 `1fr` 을 그대로 쓰고 있는지 본다.
 *
 * 왜 규칙이 되었나 (2026-08-06 실측):
 *   /notes/[id] 는 `lg:grid-cols-[1fr_400px]` 였다. CSS 에서 `1fr` 은
 *   `minmax(auto, 1fr)` 이고 `auto` 의 최소값은 min-content 다. 왼쪽 칼럼 안에
 *   가로 1172px 짜리 썸네일 줄이 있었더니 왼쪽 트랙이 그 아래로 줄지 않았고,
 *   400px 사이드바(판단 근거·점수 축)가 통째로 컨테이너 밖으로 밀려났다.
 *     뷰포트 1296 → 왼쪽 칼럼 1222px · aside 848~1690 · document.scrollWidth 1690
 *   `minmax(0,1fr)` 로 바꾸니 왼쪽 780 · aside 848~1248 · scrollWidth 1296.
 *   자손에 걸린 overflow-x-auto 는 도움이 안 된다 — 자동 최소 크기를 0 으로
 *   만드는 것은 그 스크롤러가 **그리드 아이템 자신일 때**뿐이다.
 *
 * 범위 (숨기지 않는다):
 *   · 트랙이 정확히 2개이고, 한쪽이 `<N>px` 리터럴, 다른 쪽이 `1fr` 인 것만 본다.
 *     이게 실제로 터진 부류이고, 고쳐도 의미가 안 바뀌는 부류다.
 *   · 3트랙 이상 표 모양 그리드(`[130px_100px_…_1fr]` 등)는 **보지 않는다**.
 *     같은 실패가 가능하지만 재 보지 않았고, minmax(0,·) 가 셀 내용을 넘치게
 *     만들 수 있어 일괄로 바꾸지 않는다. 재고 나서 넓힌다.
 *   · 텍스트만 읽는다. 런타임 폭은 못 잰다.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** `grid-cols-[...]` 안의 트랙 목록을 뽑는다. Tailwind 임의값은 공백 대신 `_`. */
const GRID_RE = /grid-cols-\[([^\]]+)\]/g;

/** 순수 함수 — 소스 문자열에서 위반 목록을 만든다. */
export function findSidebarGridViolations(source) {
  const out = [];
  const lines = source.split("\n");
  lines.forEach((line, i) => {
    GRID_RE.lastIndex = 0;
    let m;
    while ((m = GRID_RE.exec(line)) !== null) {
      // Tailwind 임의값은 공백을 `_` 로 쓴다. minmax(0,1fr)·repeat(3,1fr) 처럼
      // 함수형 트랙은 공백 없이 적히므로 안쪽에 `_` 가 없다 — 그냥 쪼개면 된다.
      const tracks = m[1].split("_");
      if (tracks.length !== 2) continue;
      const isPx = (t) => /^\d+(?:\.\d+)?px$/.test(t);
      const isBareFr = (t) => /^\d*\.?\d*fr$/.test(t);
      const hasPx = tracks.some(isPx);
      const bare = tracks.filter(isBareFr);
      if (hasPx && bare.length === 1) {
        out.push({
          line: i + 1,
          match: m[0],
          // 경계에 `\w` 를 쓰면 안 된다 — `_` 가 \w 라서 `1fr_400px` 의 `1fr` 이
          // 안 잡힌다(자가검사가 이걸 잡아냈다). 트랙 구분자 `_` 는 허용해야 한다.
          fix: m[0].replace(
            new RegExp(`(?<![\\dA-Za-z(,.])${bare[0]}(?![\\dA-Za-z)])`),
            `minmax(0,${bare[0]})`,
          ),
        });
      }
    }
  });
  return out;
}

/* ---------- 실행부 ---------- */

const SKIP = new Set(["node_modules", ".next", ".git", "public", "dist"]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx$/.test(p)) acc.push(p);
  }
  return acc;
}

function selftest() {
  const MUST_CATCH = [
    'className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]"',
    'className="grid gap-4 md:grid-cols-[280px_1fr]"',
    'className="lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px]"', // 두 건
    "grid-cols-[420px_1fr]",
  ];
  const MUST_PASS = [
    'className="lg:grid-cols-[minmax(0,1fr)_400px]"',
    'className="lg:grid-cols-[400px_minmax(0,1fr)]"',
    "grid-cols-[1.4fr_1fr]", // px 트랙 없음 — 대상 아님
    "grid-cols-[52px_1fr_92px]", // 3트랙 — 범위 밖이라고 적어 둔 부류
    "grid-cols-[200px_repeat(3,1fr)]", // 2트랙이지만 bare fr 아님
    "grid-cols-1",
    "grid-cols-[1fr_1fr]", // px 없음
  ];
  let bad = 0;
  for (const s of MUST_CATCH) {
    const v = findSidebarGridViolations(s);
    if (v.length === 0) {
      bad++;
      console.log("MUST_CATCH 놓침:", s);
    }
  }
  // 두 건짜리 표본이 실제로 2건으로 잡히는지도 본다(정규식이 첫 건에서 멈추면 못 잡는다)
  const two = findSidebarGridViolations(MUST_CATCH[2]);
  if (two.length !== 2) {
    bad++;
    console.log(`MUST_CATCH 개수 오류: 2건이어야 하는데 ${two.length}건`);
  }
  for (const s of MUST_PASS) {
    const v = findSidebarGridViolations(s);
    if (v.length > 0) {
      bad++;
      console.log("MUST_PASS 오탐:", s, JSON.stringify(v));
    }
  }
  // 고침 문자열이 실제로 원하는 모양인지
  const f = findSidebarGridViolations("lg:grid-cols-[1fr_400px]")[0];
  if (f?.fix !== "grid-cols-[minmax(0,1fr)_400px]") {
    bad++;
    console.log("fix 문자열 오류:", JSON.stringify(f));
  }
  const g = findSidebarGridViolations("md:grid-cols-[280px_1fr]")[0];
  if (g?.fix !== "grid-cols-[280px_minmax(0,1fr)]") {
    bad++;
    console.log("fix 문자열 오류(좌측 고정):", JSON.stringify(g));
  }
  console.log(
    bad === 0
      ? "✔ 자가검사 통과 — 심은 결함 5종 전부 잡고, 통과해야 할 7종은 안 잡는다"
      : `✗ 자가검사 실패 ${bad}건`,
  );
  return bad === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/^.*[\\/]/, ""));

if (invokedDirectly) {
  if (process.argv.includes("--selftest")) process.exit(selftest());

  const root = process.cwd();
  const files = [join(root, "app"), join(root, "components")]
    .filter((d) => {
      try {
        return statSync(d).isDirectory();
      } catch {
        return false;
      }
    })
    .flatMap((d) => walk(d));

  let count = 0;
  for (const f of files) {
    const hits = findSidebarGridViolations(readFileSync(f, "utf8"));
    for (const h of hits) {
      count++;
      console.log(`  ${relative(root, f)}:${h.line}  ${h.match}  →  ${h.fix}`);
    }
  }
  if (count === 0) {
    console.log(
      `[check-sidebar-grid-minmax] PASS — .tsx ${files.length}개에서 2트랙(고정px + 1fr) 그리드의 bare 1fr 0건`,
    );
    console.log(
      "  ※ 범위: 트랙 2개짜리만 봅니다. 3트랙 이상 표 그리드는 재 보지 않았고 규칙 대상이 아닙니다.",
    );
    console.log(
      "  ※ 텍스트만 읽습니다. 실제 렌더 폭은 이 게이트가 못 잽니다.",
    );
    process.exit(0);
  }
  console.log(
    `[check-sidebar-grid-minmax] FAIL — ${count}건. \`1fr\` 은 minmax(auto,1fr) 라서 안쪽 넓은 자식이 고정폭 사이드바를 컨테이너 밖으로 밀어냅니다.`,
  );
  process.exit(1);
}
