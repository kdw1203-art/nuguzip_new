#!/usr/bin/env node
/**
 * 중복 제출(더블 클릭) 가드 전수 감사 (최적화 50선 45번).
 *
 * ── 왜 만들었나 ──────────────────────────────────────────────────────────
 * "폼에 busy 가드가 있나"는 눈으로 세면 반드시 빠진다. 저장소에 쓰기 fetch 가
 * 100곳 넘게 흩어져 있고, 가드 모양이 네 가지나 되기 때문이다.
 *   (a) if (busy) return           — 재진입 차단
 *   (b) setBusy(true) → disabled=  — 진행 상태를 버튼에 묶음
 *   (c) 조건부 렌더                 — 제출 버튼을 다른 버튼으로 갈아끼움(AgentChat 중단)
 *   (d) 낙관적 제거                 — 누른 행이 즉시 사라져 두 번째 클릭 대상이 없음
 * 정규식으로 "가장 가까운 함수"를 찾으면 `const res = await fetch(...)` 를
 * 함수 시작으로 오인해 본문이 두 줄로 잘린다(1차 시도에서 105곳 중 101곳이
 * "가드 없음"으로 나왔다 — 전부 거짓이었다). 그래서 TypeScript AST 로 쓴다.
 *
 * ── 이 스크립트는 게이트가 아니다 ────────────────────────────────────────
 * check:final-release 에 넣지 않았다. 어휘(BUSY)를 아무리 넓혀도 (c)·(d) 처럼
 * **코드 모양으로는 안 드러나는 가드**는 원리상 못 잡는다. 가끔 틀리는 게이트는
 * 아무도 안 보는 게이트가 된다. 대신 손으로 읽어 통과시킨 곳을 아래 CLEARED 에
 * 이유와 함께 남겨 두고, 여기 없는 새 항목만 화면에 띄운다.
 * 새 항목이 뜨면 손으로 읽고, 진짜 결함이면 고치고, 아니면 CLEARED 에 이유를
 * 적어 넣는 게 이 도구의 사용법이다.
 *
 * 사용:  node scripts/audit-double-submit.mjs [--all]
 *        --all 을 주면 CLEARED 를 무시하고 원본 판정을 전부 찍는다.
 */
import ts from "typescript";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/* 어휘를 좁게 잡으면 멀쩡한 가드를 "없음"으로 센다 — 1차 시도에서 actionBusy·
   helpfulBusy·leaving·submitState 가 전부 미검출로 나왔다. 부분 일치로 넓히고,
   남는 건 손으로 읽는다. 넓혀서 놓치는 쪽이 좁혀서 없는 버그를 만드는 쪽보다 낫다. */
const BUSY =
  /busy|sav(e|ing)|submit|loading|pending|send(ing)?|sent|leav|work|inflight|posting|creat|updat|delet|process|verif|request|upload|vot|acting|done|lock|guard|disabled|state|status|phase|mutat|running|claim/i;
const busyish = (n) => BUSY.test(n);

/* ── 손으로 읽어 통과시킨 곳 (2026-08-04) ─────────────────────────────────
   줄 번호가 아니라 **파일+핸들러 이름**으로 잡는다. 줄은 위에 한 줄만 넣어도
   밀리지만 이름은 안 밀린다. 값은 통과 이유이고, 이유 없는 항목은 안 넣는다. */
const CLEARED = new Map(
  Object.entries({
    "app/components/RecentComplexes.tsx::(익명)":
      "useEffect 안 방문 기록 upsert. 사용자가 누르는 제출이 아니고 서버에서 멱등.",
    "app/components/RecentComplexes.tsx::remove":
      "낙관적 제거 — setItems 로 행이 먼저 사라져 두 번째 클릭 대상이 없다.",
    "app/components/soft-signup/SoftSignupProvider.tsx::track":
      "퍼널 계측 비콘(keepalive). 중복 제출 개념이 없다.",
    "app/components/ads/AdSlotTracker.tsx::onClick":
      "광고 클릭 집계 비콘. 두 번 누르면 클릭이 실제로 두 번인 게 맞다.",
    "app/my/listings/ListingManageActions.tsx::save":
      'setMode("busy") 가 disabled={mode === "busy"} 에 묶여 있다. 어휘가 mode 를 못 잡을 뿐.',
    "app/town/groups/[id]/ChatRoom.tsx::(익명)":
      "useEffect 안 방 참가 호출. 코드 주석대로 멱등이고 제출 경로가 아니다.",
    "app/notifications/page.tsx::onRemove":
      "낙관적 제거 — setSubs 필터가 먼저 돌아 버튼째 사라진다.",
    "app/notifications/page.tsx::markAllRead":
      'if (mode !== "live") return + 낙관적 표시 + 서버 멱등.',
    "app/notifications/page.tsx::onOpen":
      "if (!item.read) 로 두 번째 호출이 막히고 PATCH 자체가 멱등.",
    "app/calculator/calculator-client.tsx::(익명)":
      "대출 계산 조회(POST 로 입력만 보냄). 디바운스 + AbortController, 쓰기가 아니다.",
    "app/map/map-client.tsx::(익명)":
      "경로 재조회(POST 로 좌표만 보냄). 디바운스 + AbortController, 쓰기가 아니다.",
    "app/welcome/WelcomeClient.tsx::(익명)":
      "recordStep 퍼널 기록(fire-and-forget) · finish 는 if (busy) return 로 막혀 있는데 " +
      "fetch 가 regions.map 콜백 안이라 바깥 함수가 map 콜백으로 잡힌다.",
    "app/analysis/compare/page.tsx::(익명)":
      "비교표 조회(POST 로 id 배열 전달). idsKey 로 키된 useEffect, 쓰기가 아니다.",
  }),
);

const showAll = process.argv.includes("--all");

const files = execSync(
  `grep -rlE 'method: ?"(POST|PATCH|PUT|DELETE)"' app components --include=*.tsx`,
  { encoding: "utf8" },
)
  .trim()
  .split("\n");

const out = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

  /* 이 파일이 쓰기 fetch 를 부르는 지점들을 모으고, 각 지점의 "가장 가까운
     함수"를 핸들러로 본다. */
  const targets = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(sf).endsWith("fetch")) {
      const txt = node.getText(sf);
      if (/method:\s*"(POST|PATCH|PUT|DELETE)"/.test(txt)) targets.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  for (const call of targets) {
    let fn = call.parent;
    while (
      fn &&
      !ts.isFunctionDeclaration(fn) &&
      !ts.isFunctionExpression(fn) &&
      !ts.isArrowFunction(fn) &&
      !ts.isMethodDeclaration(fn)
    )
      fn = fn.parent;
    if (!fn) continue;
    /* 핸들러 이름: const send = async () => ... 형태에서 변수명을 잡는다 */
    let name = "(익명)";
    const p = fn.parent;
    if (p && ts.isVariableDeclaration(p)) name = p.name.getText(sf);
    else if (ts.isFunctionDeclaration(fn) && fn.name) name = fn.name.getText(sf);
    const line = sf.getLineAndCharacterOfPosition(call.getStart(sf)).line + 1;

    /* 가드 1: 재진입 차단 — if (busyish) return  또는  if (ref.current) return */
    let reentry = false;
    const scan = (n) => {
      if (ts.isIfStatement(n)) {
        const c = n.expression.getText(sf);
        const hasReturn =
          n.thenStatement && /(^|\W)return(\W|$)/.test(n.thenStatement.getText(sf).slice(0, 120));
        if (hasReturn && (/\.current\b/.test(c) || c.split(/[^\w.$]+/).some((t) => t && busyish(t))))
          reentry = true;
      }
      ts.forEachChild(n, scan);
    };
    scan(fn);

    /* 가드 2: 진행 상태 세팅 — setBusy(true) 류가 fetch 앞에 있다 */
    let setter = false;
    const scan2 = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const nm = n.expression.text;
        if (/^set[A-Z]/.test(nm) && busyish(nm.slice(3)) && n.getStart(sf) < call.getStart(sf))
          setter = true;
      }
      ts.forEachChild(n, scan2);
    };
    scan2(fn);

    /* 사용자 경로인가: 같은 파일에서 이 이름이 on[A-Z] 속성에 쓰였는지 */
    const userTriggered =
      name !== "(익명)"
        ? new RegExp(`on(Click|Submit|Change|KeyDown)=\\{[^}]*\\b${name.replace(/[$]/g, "\\$")}\\b`).test(
            src,
          )
        : /on(Click|Submit)=\{\s*(async\s*)?\(/.test(src);
    out.push({ f, line, name, userTriggered, guarded: reentry || setter });
  }
}

const user = out.filter((r) => r.userTriggered);
const beacon = out.filter((r) => !r.userTriggered);
const raw = user.filter((r) => !r.guarded);
const residue = showAll ? raw : raw.filter((r) => !CLEARED.has(`${r.f}::${r.name}`));

console.log(`쓰기 fetch 호출부 ${out.length}곳 / 파일 ${new Set(out.map((r) => r.f)).size}개`);
console.log(
  `  사용자 조작 경로 ${user.length}곳 — 코드로 가드 확인 ${user.length - raw.length} · 미검출 ${raw.length}`,
);
console.log(`  비콘·효과 경로 ${beacon.length}곳 (중복 제출 개념이 없어 대상 아님)`);
console.log(`  미검출 중 손으로 읽어 통과 ${raw.length - residue.length}곳 (CLEARED)\n`);

if (residue.length === 0) {
  console.log("손으로 읽어야 할 새 항목: 없음");
} else {
  console.log("손으로 읽어야 할 새 항목:");
  for (const r of residue) console.log(`   ${r.f}:${r.line}  ${r.name}()`);
}
process.exit(residue.length === 0 ? 0 : 1);
