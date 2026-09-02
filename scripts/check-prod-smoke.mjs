#!/usr/bin/env node
/**
 * 배포 후 프로덕션 스모크 (고도화 43).
 *
 * deploy.yml 의 Deploy 스텝 **성공 직후** 실행된다 — "배포가 초록"과 "사용자가
 * 보는 화면이 살아 있다"는 다른 사실이기 때문이다. 프리빌트 아카이브가 잘못
 * 올라가거나 env 가 빠져 500 이 나도 vercel deploy 자체는 성공으로 끝난다.
 *
 * 검사: 핵심 5 URL 이 200 이고, 서버 렌더 HTML 에 페이지 고유 마커가 있는지.
 * 마커는 "그 페이지가 제 콘텐츠를 그렸다"는 최소 증거다 — 500 에러 페이지나
 * 빈 셸이 200 으로 위장하는 경우를 잡는다.
 *
 * 실패 처리: 전파 지연·순간 504 를 배포 실패로 오인하지 않도록 URL 당 3회
 * (20초 간격) 재시도 후에만 실패로 판정한다. 실패 시 exit 1 — 워크플로가
 * 이슈를 만든다.
 */

const BASE = process.env.SMOKE_BASE_URL?.trim() || "https://nuguzip.com";

/** 마커는 서버 렌더 HTML 에 항상 있는 정적 문자열만 쓴다(데이터 의존 금지 —
 *  DB 장애 시에도 페이지 셸은 그려져야 하고, 그건 이 검사의 실패가 아니다). */
const TARGETS = [
  { path: "/", marker: "임장" },
  { path: "/tx", marker: "실거래" },
  { path: "/search", marker: "통합 검색" },
  { path: "/subscription", marker: "구독" },
  { path: "/llms.txt", marker: "내집나우" },
];

const RETRIES = 3;
const RETRY_WAIT_MS = 20_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkOnce(t) {
  const url = `${BASE}${t.path}`;
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "nuguzip-deploy-smoke/1.0" },
  });
  if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
  const body = await res.text();
  if (!body.includes(t.marker)) {
    return { ok: false, why: `200이지만 마커 "${t.marker}" 없음 (본문 ${body.length}B)` };
  }
  return { ok: true };
}

async function checkWithRetry(t) {
  let last = { ok: false, why: "미실행" };
  for (let i = 1; i <= RETRIES; i++) {
    try {
      last = await checkOnce(t);
    } catch (e) {
      last = { ok: false, why: e instanceof Error ? e.message : String(e) };
    }
    if (last.ok) return { ...last, attempts: i };
    if (i < RETRIES) await sleep(RETRY_WAIT_MS);
  }
  return { ...last, attempts: RETRIES };
}

const failures = [];
for (const t of TARGETS) {
  const r = await checkWithRetry(t);
  if (r.ok) {
    console.log(`OK   ${t.path} (시도 ${r.attempts})`);
  } else {
    console.error(`FAIL ${t.path} — ${r.why} (${RETRIES}회 시도)`);
    failures.push(`${t.path}: ${r.why}`);
  }
}

if (failures.length > 0) {
  console.error(`\n프로덕션 스모크 실패 ${failures.length}/${TARGETS.length}건`);
  process.exit(1);
}
console.log(`\n프로덕션 스모크 통과 — ${TARGETS.length}개 URL (${BASE})`);
