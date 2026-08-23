#!/usr/bin/env node
/* [#83] 빌링 오픈 리허설 — 심사 승인 당일 30분 런북(docs/runbooks/billing-open-runbook.md)을
 * 그대로 따라가기 전에, 기계로 확인 가능한 전제들을 한 번에 점검한다.
 * 실결제는 하지 않는다(그건 런북 4단계의 사람 몫). 네트워크는 프로덕션 GET 만.
 *
 * 사용: node scripts/billing-open-rehearsal.mjs
 * 종료코드: 0 = 리허설 통과(오픈 전 상태 정상) · 1 = 확인 필요 항목 있음
 */
import { readFileSync, existsSync } from "node:fs";

const BASE = process.env.REHEARSAL_BASE_URL ?? "https://nuguzip.com";
const results = [];
const add = (name, ok, detail) => results.push({ name, ok, detail });

async function fetchText(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": "Mozilla/5.0 (billing-rehearsal)" },
    redirect: "follow",
  });
  return { status: res.status, text: await res.text() };
}

// 1. 런북 존재 + 필수 단계 문구
try {
  const runbook = readFileSync("docs/runbooks/billing-open-runbook.md", "utf8");
  const steps = ["라이브 키 교체", "동결 게이트 갱신", "재배포", "스모크 테스트", "롤백"];
  const missing = steps.filter((s) => !runbook.includes(s));
  add("런북 단계 완비", missing.length === 0, missing.length ? `누락: ${missing.join(", ")}` : "5단계 확인");
} catch {
  add("런북 단계 완비", false, "docs/runbooks/billing-open-runbook.md 를 읽지 못함");
}

// 2. 동결 게이트 스크립트 존재 (오픈 시 갱신 대상)
add(
  "동결 게이트 스크립트",
  existsSync("scripts/check-toss-review-freeze.mjs"),
  "오픈 단계 2에서 이 게이트를 갱신해야 함",
);

// 3. 프로덕션 /subscription — 오픈 전에는 사전등록, 오픈 후에는 결제 버튼
try {
  const sub = await fetchText("/subscription");
  const preorder = sub.text.includes("오픈 알림 받기");
  const checkout = sub.text.includes("플러스 시작하기");
  /* 정확히 하나만 참이어야 한다. 둘 다 참(본문 설명 카피에 문구가 겹치는 경우 포함)은
     자동 판정 불가 — CHECK 로 내려 오픈 당일 눈으로 확인하게 한다. */
  const exactlyOne = preorder !== checkout;
  add(
    "/subscription 상태 일관성",
    sub.status === 200 && exactlyOne,
    `HTTP ${sub.status} · 사전등록문구=${preorder} · 결제버튼문구=${checkout}${
      !exactlyOne ? " — 문구가 겹침: 실제 버튼 상태를 눈으로 확인" : ""
    }`,
  );
  add(
    "현재 모드",
    true,
    checkout ? "결제 개통 상태 — 이미 오픈됨" : "사전등록 상태 — 오픈 대기(정상)",
  );
} catch (e) {
  add("/subscription 상태 일관성", false, String(e));
}

// 4. 웹훅 — 모르는 이벤트에 200 (재시도 폭주 방지 계약)
try {
  const res = await fetch(`${BASE}/api/payments/toss/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType: "REHEARSAL_PING" }),
  });
  add("토스 웹훅 응답 계약", res.status === 200, `HTTP ${res.status} (200 이어야 함)`);
} catch (e) {
  add("토스 웹훅 응답 계약", false, String(e));
}

// 5. 헬스 — toss 블록
try {
  const health = await fetchText("/api/health");
  let tossState = "unknown";
  try {
    const j = JSON.parse(health.text);
    tossState = JSON.stringify(j.toss ?? j.env?.toss ?? "미노출").slice(0, 120);
  } catch {
    tossState = `JSON 파싱 불가 (HTTP ${health.status})`;
  }
  add("헬스 toss 블록", health.status === 200, tossState);
} catch (e) {
  add("헬스 toss 블록", false, String(e));
}

// 결과 출력
let fail = 0;
for (const r of results) {
  if (!r.ok) fail += 1;
  console.log(`${r.ok ? "PASS" : "CHECK"}  ${r.name} — ${r.detail}`);
}
console.log(
  fail === 0
    ? "\n[rehearsal] 통과 — 승인 당일에는 런북 1~5단계만 순서대로 실행하면 됩니다."
    : `\n[rehearsal] 확인 필요 ${fail}건 — 위 CHECK 항목을 해소한 뒤 다시 실행하세요.`,
);
process.exit(fail === 0 ? 0 : 1);
