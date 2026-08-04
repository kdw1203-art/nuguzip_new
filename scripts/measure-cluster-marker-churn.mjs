#!/usr/bin/env node
/**
 * 지도 클러스터 마커 재생성 실측기 (최적화 50선 38번).
 *
 * ── 무엇을 재는가 ────────────────────────────────────────────────────────
 * NaverMap 은 마커를 **id 로** 재사용한다(components/map/NaverMap.tsx).
 * id 가 같으면 setPosition/setIcon 만 돌고, id 가 다르면 예전 마커를
 * setMap(null) 로 버리고 new maps.Marker 로 다시 만든다 — DOM 도 이벤트
 * 리스너도 새로. 그래서 "마커 재생성이 많은가"는 결국 **id 가 안정적인가**의
 * 문제다. 렌더 프로파일러 없이도 id 만 세면 정확히 답이 나온다.
 *
 * ── 왜 브라우저로 안 재는가 ──────────────────────────────────────────────
 * 이 샌드박스의 Playwright/Chromium 은 프록시를 안 타서 지도 SDK 도 사이트도
 * 못 연다. 대신 클러스터 좌표를 만드는 **서버 응답을 실제로 여러 번 부르고**
 * id 를 세는 쪽을 택했다. 재생성 판정에 필요한 입력이 전부 응답 안에 있으므로
 * 브라우저를 못 쓰는 게 정확도를 깎지 않는다. 다만 이건 "마커 몇 개가 다시
 * 만들어지는가"이지 "그래서 몇 ms 가 드는가"는 아니다 — 시간은 안 쟀다.
 *
 * ── 옛 응답으로 새 방식을 어떻게 비교했나 ────────────────────────────────
 * 옛 응답에는 셀 키가 없다. 그런데 한 셀 안 점들의 무게중심은 **반드시 그 셀
 * 안에** 있으므로 floor(centroid / cell) 로 셀 인덱스를 정확히 복원할 수 있다.
 * 추정이 아니라 항등식이다.
 *
 * 사용:  node scripts/measure-cluster-marker-churn.mjs [https://nuguzip.com]
 * 결과(2026-08-04, 강남 일대 zoom 12, 450m 씩 6번 팬):
 *   옛 id(무게중심 좌표) 26/30 재생성(87%) · 새 id(셀 키) 0/30(0%)
 */
import { execFileSync } from "node:child_process";

const BASE = process.argv[2] ?? "https://nuguzip.com";

/* app/api/map/clusters/route.ts 의 cellSizeForZoom 과 같은 표. 둘이 어긋나면
   이 스크립트가 조용히 틀린 답을 낸다 — 바꿀 때 같이 바꾼다. */
const cellFor = (z) => (z <= 8 ? 0.5 : z <= 10 ? 0.2 : z <= 11 ? 0.1 : z <= 12 ? 0.05 : 0.025);

const ZOOM = 12;
const CELL = cellFor(ZOOM);
/* 뷰포트는 폰 지도 화면 대략치, 팬은 0.004도 ≈ 450m — 손가락 한 번 스와이프. */
const H = 0.06;
const W = 0.09;
const LAT = 37.5;
const LNG = 127.03;
const FRAMES = 7;

const rows = [];
for (let i = 0; i < FRAMES; i++) {
  const p = new URLSearchParams({
    minLat: String(LAT - H / 2),
    maxLat: String(LAT + H / 2),
    minLng: String(LNG - W / 2 + i * 0.004),
    maxLng: String(LNG + W / 2 + i * 0.004),
    zoom: String(ZOOM),
  });
  let cs = [];
  try {
    const body = execFileSync("curl", ["-sf", `${BASE}/api/map/clusters?${p}`], {
      encoding: "utf8",
      maxBuffer: 32e6,
    });
    cs = JSON.parse(body).clusters ?? [];
  } catch {
    console.error(`프레임 ${i}: 응답을 못 받았다 — 못 잰 것이지 0건이 아니다.`);
    process.exit(2);
  }
  rows.push({
    old: new Set(cs.map((c) => `${c.lat}:${c.lng}`)),
    /* 서버가 key 를 주면 그대로, 아직 안 주는(캐시된) 응답이면 좌표에서 복원 */
    neu: new Set(
      cs.map((c) => c.key ?? `${CELL}:${Math.floor(c.lat / CELL)}:${Math.floor(c.lng / CELL)}`),
    ),
  });
  console.log(`프레임 ${i}: 클러스터 ${cs.length}개`);
}

const churn = (k) => {
  let recreated = 0;
  let total = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1][k];
    for (const id of rows[i][k]) {
      total += 1;
      if (!prev.has(id)) recreated += 1;
    }
  }
  return { recreated, total };
};

const o = churn("old");
const n = churn("neu");
const pct = (x, t) => (t === 0 ? "—" : `${Math.round((x / t) * 100)}%`);
console.log(`\n${FRAMES - 1}번 팬 동안 그려진 클러스터 마커 누계 ${o.total}개`);
console.log(`  옛 id(무게중심 좌표): 새로 만든 마커 ${o.recreated}개 (${pct(o.recreated, o.total)})`);
console.log(`  새 id(그리드 셀 키) : 새로 만든 마커 ${n.recreated}개 (${pct(n.recreated, n.total)})`);
