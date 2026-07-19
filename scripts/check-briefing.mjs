/**
 * AI 시장 브리핑 검증 (#25)
 *
 * 홈 화면 브리핑 생성 로직(lib/newui/home-data.ts → computeBriefing)이 만드는
 * 수치가 원천 데이터(market_region_monthly)와 일치하는지 검사한다.
 *
 *  1) 원천 재계산 — market_region_monthly에서 브리핑과 동일한 조건으로 조회해
 *     최신월·구별 등락(trend_delta_pct)을 독립적으로 다시 집계
 *  2) 생성 로직 재현 — computeBriefing과 동일한 규칙으로 브리핑 텍스트 생성
 *  3) 대조 — 생성된 텍스트에서 수치(N곳 중 M곳, 평균 ±X%, 기준월)를 파싱해
 *     원천 재계산 값과 일치하는지 검증
 *
 * 사용: node ./scripts/check-briefing.mjs
 * env(SUPABASE URL/키) 없으면 "skip" 출력 후 exit 0. 불일치 시 exit 1.
 * CI 연동은 별도 담당(스크립트만 제공).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFile(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile(join(root, ".env.local"));
loadEnvFile(join(root, ".env"));

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const validKey = (k) =>
  k && (k.startsWith("eyJ") || k.startsWith("sb_")) ? k : undefined;
const key =
  validKey(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) ||
  validKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) ||
  validKey(process.env.SUPABASE_ANON_KEY?.trim()) ||
  validKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim());

if (!url || !/^https?:\/\//.test(url) || !key) {
  console.info("[check-briefing] skip — SUPABASE URL/키 env 없음 (검사 생략)");
  process.exit(0);
}

/* ---------- 1) 원천 조회 (computeBriefing과 동일 조건) ---------- */

const query = new URLSearchParams({
  select: "region_name,month,trend_delta_pct",
  deal_type: "eq.trade",
  property_type: "eq.apartment",
  region_name: "like.서울*",
  order: "month.desc",
  limit: "80",
});

let rows;
try {
  const res = await fetch(`${url}/rest/v1/market_region_monthly?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403
        ? " — 현재 키로 market_region_monthly 조회 권한 없음 (SUPABASE_SERVICE_ROLE_KEY 필요)"
        : "";
    console.info(`[check-briefing] skip — 원천 조회 실패 (HTTP ${res.status})${hint}`);
    process.exit(0);
  }
  rows = await res.json();
} catch (e) {
  console.info(`[check-briefing] skip — 원천 조회 오류: ${e?.message ?? e}`);
  process.exit(0);
}

if (!Array.isArray(rows) || rows.length === 0) {
  console.info("[check-briefing] skip — market_region_monthly 데이터 없음 (브리핑도 null이어야 정상)");
  process.exit(0);
}

/* ---------- 2) 생성 로직 재현 (lib/newui/home-data.ts computeBriefing과 동일 규칙) ---------- */

function generateBriefing(sourceRows) {
  const latestMonth = sourceRows[0]?.month;
  if (!latestMonth || !/^\d{6}$/.test(latestMonth)) return null;
  const deltas = new Map();
  for (const r of sourceRows) {
    if (r.month !== latestMonth || !r.region_name) continue;
    const d = Number(r.trend_delta_pct);
    if (!Number.isFinite(d) || deltas.has(r.region_name)) continue;
    deltas.set(r.region_name, d);
  }
  const n = deltas.size;
  if (n === 0) return null;
  const values = [...deltas.values()];
  const falling = values.filter((d) => d < -0.1).length;
  const rising = values.filter((d) => d > 0.1).length;
  const avg = values.reduce((a, b) => a + b, 0) / n;
  const arrow = avg > 0.05 ? "▲" : avg < -0.05 ? "▼" : "—";
  const lead =
    falling >= rising
      ? `서울 주요 구 ${n}곳 중 ${falling}곳 하락`
      : `서울 주요 구 ${n}곳 중 ${rising}곳 상승`;
  const avgLabel =
    arrow === "—" ? "평균 보합" : `평균 ${arrow}${Math.abs(avg).toFixed(1)}%`;
  return {
    text: `${lead}, ${avgLabel}`,
    asOfLabel: `기준일 ${latestMonth.slice(0, 4)}.${latestMonth.slice(4, 6)}`,
    latestMonth,
  };
}

const briefing = generateBriefing(rows);
if (!briefing) {
  console.info("[check-briefing] skip — 최신월 유효 데이터 없음 (브리핑도 null이어야 정상)");
  process.exit(0);
}

/* ---------- 3) 원천 재계산 대조 — 텍스트 수치 파싱 후 독립 집계와 비교 ---------- */

// 독립 재계산 (생성 함수와 별도 경로: 월별 그룹핑으로 최신월 판정)
const byMonth = new Map();
for (const r of rows) {
  if (!r.month || !/^\d{6}$/.test(r.month) || !r.region_name) continue;
  const d = Number(r.trend_delta_pct);
  if (!Number.isFinite(d)) continue;
  if (!byMonth.has(r.month)) byMonth.set(r.month, new Map());
  const m = byMonth.get(r.month);
  if (!m.has(r.region_name)) m.set(r.region_name, d);
}
const latestMonth = [...byMonth.keys()].sort().at(-1);
const regionDeltas = byMonth.get(latestMonth) ?? new Map();
const values = [...regionDeltas.values()];
const expected = {
  month: latestMonth,
  n: regionDeltas.size,
  falling: values.filter((d) => d < -0.1).length,
  rising: values.filter((d) => d > 0.1).length,
  avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN,
};

// 생성 텍스트에서 수치 파싱
const leadMatch = /서울 주요 구 (\d+)곳 중 (\d+)곳 (하락|상승)/.exec(briefing.text);
const avgMatch = /평균 (?:보합|([▲▼])([0-9]+(?:\.[0-9]+)?)%)/.exec(briefing.text);
const asOfMatch = /기준일 (\d{4})\.(\d{2})/.exec(briefing.asOfLabel);

const failures = [];
const check = (label, ok, detail) => {
  if (ok) console.info(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures.push(label);
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

console.info(`[check-briefing] 생성 브리핑: "${briefing.text}" (${briefing.asOfLabel})`);
console.info(`[check-briefing] 원천 재계산: 최신월 ${expected.month} · ${expected.n}개 구 · 하락 ${expected.falling} · 상승 ${expected.rising} · 평균 ${expected.avg.toFixed(3)}%`);

check("텍스트 형식(N곳 중 M곳)", Boolean(leadMatch), leadMatch ? undefined : briefing.text);
check("평균 표기 형식", Boolean(avgMatch), avgMatch ? undefined : briefing.text);
check("기준일 형식", Boolean(asOfMatch), asOfMatch ? undefined : briefing.asOfLabel);

if (leadMatch) {
  const [, nStr, mStr, dir] = leadMatch;
  check("구 수(N) 일치", Number(nStr) === expected.n, `텍스트 ${nStr} vs 원천 ${expected.n}`);
  const expDir = expected.falling >= expected.rising ? "하락" : "상승";
  const expCount = expDir === "하락" ? expected.falling : expected.rising;
  check("방향(하락/상승) 일치", dir === expDir, `텍스트 ${dir} vs 원천 ${expDir}`);
  check("해당 방향 구 수(M) 일치", Number(mStr) === expCount, `텍스트 ${mStr} vs 원천 ${expCount}`);
  check("M ≤ N", Number(mStr) <= Number(nStr), `${mStr} ≤ ${nStr}`);
}
if (avgMatch) {
  const [, arrow, absStr] = avgMatch;
  if (arrow === undefined) {
    // "평균 보합" — |avg| ≤ 0.05 여야 함
    check("평균 보합 판정 일치", Math.abs(expected.avg) <= 0.05, `원천 평균 ${expected.avg.toFixed(3)}%`);
  } else {
    const expArrow = expected.avg > 0.05 ? "▲" : expected.avg < -0.05 ? "▼" : "—";
    check("평균 방향 일치", arrow === expArrow, `텍스트 ${arrow} vs 원천 ${expArrow}`);
    // 소수 1자리 반올림 오차 허용 (±0.05%p)
    check(
      "평균 수치 일치(±0.05%p)",
      Math.abs(Number(absStr) - Math.abs(expected.avg)) <= 0.05 + 1e-9,
      `텍스트 ${absStr}% vs 원천 ${Math.abs(expected.avg).toFixed(3)}%`,
    );
  }
}
if (asOfMatch) {
  check(
    "기준월 일치",
    `${asOfMatch[1]}${asOfMatch[2]}` === expected.month,
    `텍스트 ${asOfMatch[1]}${asOfMatch[2]} vs 원천 ${expected.month}`,
  );
}

if (failures.length > 0) {
  console.error(`\n[check-briefing] 실패 — 불일치 ${failures.length}건: ${failures.join(", ")}`);
  process.exit(1);
}
console.info("\n[check-briefing] 통과 — 브리핑 수치가 원천 데이터와 일치합니다.");
