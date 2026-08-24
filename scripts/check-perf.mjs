/* [OPT-40] 성능 스모크 — 빌드 산출물을 기동해 핵심 경로의 서버 응답을 잰다.
   빌드 체인에는 넣지 않는다(서버 기동·환경 의존 — Vercel 빌드에서 오탐 위험).
   회차(wave) 검증과 수동 점검에서 `npm run check:perf` 로 돌린다.
   PERF_STRICT=1 이면 예산 초과 시 exit 1. 기본은 리포트만. */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = process.env.PERF_PORT || "3719";
const BASE = `http://127.0.0.1:${PORT}`;
const ROUTES = [
  { path: "/", budgetMs: 1500 },
  { path: "/analysis", budgetMs: 2000 },
  { path: "/analysis/accuracy", budgetMs: 2500 },
  { path: "/apply", budgetMs: 2000 },
];

const server = spawn("npx", ["next", "start", "-p", PORT], { stdio: "ignore", detached: true });
let up = false;
for (let i = 0; i < 40; i++) {
  await delay(500);
  try {
    const r = await fetch(BASE + "/api/health").catch(() => fetch(BASE + "/"));
    if (r) { up = true; break; }
  } catch { /* 재시도 */ }
}
let failed = false;
if (!up) {
  console.error("서버 기동 실패 — .next 빌드가 있는지, 포트가 비었는지 확인");
  failed = true;
} else {
  for (const r of ROUTES) {
    const t0 = performance.now();
    try {
      const res = await fetch(BASE + r.path, { redirect: "manual" });
      const ms = Math.round(performance.now() - t0);
      const over = ms > r.budgetMs || res.status >= 500;
      if (over) failed = true;
      console.log(`${over ? "✗" : "✓"} ${r.path} — ${res.status} · ${ms}ms (예산 ${r.budgetMs}ms)`);
    } catch (e) {
      failed = true;
      console.log(`✗ ${r.path} — 요청 실패: ${e?.message ?? e}`);
    }
  }
}
try { process.kill(-server.pid); } catch { try { server.kill(); } catch {} }
if (failed && process.env.PERF_STRICT === "1") process.exit(1);
console.log(failed ? "△ 성능 스모크에 초과·실패 항목 있음 (비엄격 모드 — 리포트만)" : "✓ 성능 스모크 통과");
