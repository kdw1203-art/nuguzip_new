import { strict as assert } from "node:assert";
import test from "node:test";

import {
  foldOpsAlerts,
  parseHealthBody,
  relativeTime,
  type InboxItemView,
} from "../../lib/notifications/format";

/* 화면에서 실제로 잘못 나왔던 것들만 고정한다.
   기준 시각은 스크린샷을 찍은 그 시점(2026-08-25 22:48 UTC ≒ 08-26 07:48 KST). */
const NOW = new Date("2026-08-26T07:48:00+09:00");
const at = (kst: string) => new Date(`${kst}+09:00`).toISOString();

test("같은 날짜가 두 가지 표기로 갈라지지 않는다", () => {
  /* 예전 구현은 경과 ms 를 24h 로 나눠서, 같은 8월 19일인데 시각에 따라
     "6일 전" 과 "08. 19." 로 갈렸다. */
  const morning = relativeTime(at("2026-08-19T06:55:00"), NOW);
  const dawn = relativeTime(at("2026-08-19T02:00:00"), NOW);
  const night = relativeTime(at("2026-08-19T23:30:00"), NOW);
  assert.equal(morning, dawn);
  assert.equal(morning, night);
  // 7일째부터는 절대 날짜 — 셋 다 같은 절대 날짜여야 한다
  assert.equal(morning, "8월 19일");

  // 경계 바로 안쪽(6일)은 시각이 달라도 똑같이 상대 표기
  assert.equal(relativeTime(at("2026-08-20T06:55:00"), NOW), "6일 전");
  assert.equal(relativeTime(at("2026-08-20T23:30:00"), NOW), "6일 전");
});

test("오늘·어제·N일 전 경계", () => {
  assert.equal(relativeTime(at("2026-08-26T07:00:00"), NOW), "48분 전");
  assert.equal(relativeTime(at("2026-08-26T01:00:00"), NOW), "6시간 전");
  assert.equal(relativeTime(at("2026-08-26T00:05:00"), NOW), "7시간 전");
  // 자정을 넘겼으면 몇 시간 차이든 "어제"
  assert.equal(relativeTime(at("2026-08-25T23:55:00"), NOW), "어제");
  assert.equal(relativeTime(at("2026-08-24T09:00:00"), NOW), "2일 전");
  assert.equal(relativeTime(at("2026-08-20T09:00:00"), NOW), "6일 전");
});

test("7일 이상은 절대 날짜 — 같은 해면 연도를 빼고 쓴다", () => {
  const label = relativeTime(at("2026-08-04T12:00:00"), NOW);
  assert.equal(label, "8월 4일");
  assert.ok(!label.includes("2026"));
  assert.ok(relativeTime(at("2025-12-30T12:00:00"), NOW).includes("2025"));
});

test("[HEALTH] 접두사와 중복 문장을 걷어낸다", () => {
  const r = parseHealthBody(
    "[HEALTH] db.query_load 이 critical 상태입니다 — DB 실행시간 787043 ms/시간",
  );
  assert.equal(r.checkName, "db.query_load");
  assert.equal(r.severity, "critical");
  assert.equal(r.body, "DB 실행시간 787043 ms/시간");
  assert.ok(!r.body.includes("[HEALTH]"));
  assert.ok(!r.body.includes("상태입니다"));
});

test("[HEALTH] 이지만 상태 문장이 없는 형태도 본문을 살린다", () => {
  const r = parseHealthBody("[HEALTH] seo.cwv_page — /map → CLS p75 0.825 (표본 26)");
  assert.equal(r.checkName, "seo.cwv_page");
  assert.equal(r.body, "/map → CLS p75 0.825 (표본 26)");
  assert.equal(r.severity, undefined);
});

test("[HEALTH] 가 아닌 본문은 건드리지 않는다", () => {
  const raw = "서울 강남구에 새 매물 3건이 올라왔어요";
  assert.deepEqual(parseHealthBody(raw), { body: raw });
});

const row = (
  id: string,
  title: string,
  body: string,
  createdAt: string,
  readAt: string | null = null,
): InboxItemView => ({ id, title, body, actionUrl: "/admin/ops", readAt, createdAt });

test("같은 제목의 경보는 한 줄로 접히고 반복 횟수·최초 시각을 남긴다", () => {
  const rows = [
    row("a", "Core Web Vitals 이상", "[HEALTH] seo.cwv_page — CLS 0.825", at("2026-08-26T06:55:00")),
    row("b", "Core Web Vitals 이상", "[HEALTH] seo.cwv_page — CLS 0.810", at("2026-08-25T06:55:00")),
    row("c", "Core Web Vitals 이상", "[HEALTH] seo.cwv_page — CLS 0.810", at("2026-08-24T06:55:00")),
    row("d", "SEO 색인 경로 이상", "[HEALTH] seo.asset — robots.txt", at("2026-08-19T09:00:00")),
  ];
  const folded = foldOpsAlerts(rows);
  assert.equal(folded.length, 2);

  const cwv = folded[0];
  assert.equal(cwv.repeat, 3);
  assert.equal(cwv.createdAt, at("2026-08-26T06:55:00")); // 대표는 최신
  assert.equal(cwv.firstAt, at("2026-08-24T06:55:00")); // 최초는 가장 오래된 것
  assert.deepEqual(cwv.groupIds.sort(), ["a", "b", "c"]);
  assert.equal(cwv.body, "CLS 0.825"); // 대표 본문은 최신 값
  assert.equal(folded[1].repeat, 1);
});

test("묶음은 전부 읽어야 읽음 — 하나라도 안 읽었으면 안 읽음", () => {
  const base = [
    row("a", "실거래 적재", "[HEALTH] market_transactions.ingest — 누적 0", at("2026-08-26T01:00:00"), "2026-08-26T02:00:00Z"),
    row("b", "실거래 적재", "[HEALTH] market_transactions.ingest — 누적 0", at("2026-08-25T01:00:00")),
  ];
  assert.equal(foldOpsAlerts(base)[0].read, false);

  const allRead = base.map((r) => ({ ...r, readAt: "2026-08-26T02:00:00Z" }));
  assert.equal(foldOpsAlerts(allRead)[0].read, true);
});

test("'운영 점검 필요 · 점검키' 제목은 사람 말로 바뀌고, 원문 키는 남는다", () => {
  const folded = foldOpsAlerts([
    row("a", "운영 점검 필요 · db.query_load", "[HEALTH] db.query_load 이 critical 상태입니다 — 부하", at("2026-08-26T06:30:00")),
  ]);
  assert.equal(folded[0].title, "DB 부하");
  // 화면에서 본 문구로 로그를 검색할 수 있어야 하므로 원문 키는 버리지 않는다
  assert.equal(folded[0].checkName, "db.query_load");
  assert.equal(folded[0].severity, "critical");
});

test("매핑에 없는 점검 키는 접두사만 떼고 그대로 쓴다", () => {
  const folded = foldOpsAlerts([
    row("a", "운영 점검 필요 · some.new_check", "[HEALTH] some.new_check — 무언가", at("2026-08-26T06:30:00")),
  ]);
  assert.equal(folded[0].title, "some.new_check");
});

test("빈 목록은 빈 결과", () => {
  assert.deepEqual(foldOpsAlerts([]), []);
});
