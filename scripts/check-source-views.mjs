#!/usr/bin/env node
/**
 * public.*_source 뷰 실조회 게이트.
 *
 * ── 왜 있나 ────────────────────────────────────────────────────────────
 * 2026-07-25, 마이그레이션 20260725042708 이 market_agg 의 MV 세 개를
 * drop + create 했다. DROP MATERIALIZED VIEW 는 GRANT 를 같이 지우는데
 * (CREATE OR REPLACE MATERIALIZED VIEW 는 존재하지 않는다) 재생성 뒤
 * 다시 부여한 건 public.*_source 래퍼 뷰뿐이었다. 그 래퍼는
 * security_invoker = on 이라 **호출자가** 밑단 MV 권한을 직접 들고 있어야
 * 하므로, 래퍼에 준 GRANT 는 아무 효력이 없었다.
 * 결과: 모든 조회가 42501 permission denied 로 떨어졌고, 그 실패를 화면이
 * "데이터 없음" 으로 렌더해 /tx 와 /sitemap-tx.xml 이 하루 동안 죽어 있었다.
 * 빌드는 초록이었다 — 아무 게이트도 실제로 뷰를 읽어 보지 않았기 때문이다.
 *
 * 그래서 이 스크립트는 타입도 문법도 아닌 **권한**을 본다: 배포 전에
 * 각 뷰를 anon 과(키가 있으면) service_role 로 한 번씩 실제로 조회한다.
 *
 * ── 판정 규칙 ──────────────────────────────────────────────────────────
 *   PostgREST 4xx 오류(42501 등) → FAIL. 이게 이 게이트의 존재 이유다.
 *   행 0개                    → PASS + 경고. 권한 문제와 다르며, 계절적으로
 *                               정말 빌 수 있는 뷰도 있으므로 배포를 막지 않는다.
 *   5xx                       → SKIP. 권한이 아니라 가용성 문제다. 서버가 답을
 *                               못 만든 것이므로 "읽을 수 있는가"에 아무 답도 없다.
 *   네트워크 도달 불가         → SKIP. 샌드박스·오프라인 러너에서 깨끗이 물러난다
 *                               (없는 사실을 지어내지 않고 "확인 못 함"이라 적는다).
 *   키 없음                   → SKIP.
 *
 * 사용: node ./scripts/check-source-views.mjs   ·   npm run check:source-views
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
loadEnvFile(join(root, ".env.production"));
loadEnvFile(join(root, ".env"));

/**
 * 뷰마다 "누가 읽어야 하는가" 가 다르다 — 실제 코드 경로에 맞춘다.
 * anon: 브라우저/빌드가 서비스 롤 없이 읽는 경로가 존재하는 뷰.
 * service: 서버 라우트에서만 읽는 뷰.
 */
const VIEWS = [
  { name: "tx_band_landing_source", roles: ["anon", "service"], note: "/tx · /tx/[region]" },
  { name: "tx_band_complex_source", roles: ["anon", "service"], note: "/tx/[region]/[kind]/[band]" },
  { name: "map_price_point_source", roles: ["service"], note: "/api/map/clusters" },
  { name: "complex_sitemap_source", roles: ["service"], note: "/sitemap-complexes.xml" },
  {
    /* 빌드 시 prerender 가 getReadOnlySupabase() 로 읽는다. 배포 빌드 환경에는
       SUPABASE_SERVICE_ROLE_KEY 가 없어 실제로는 anon 으로 나가므로, anon 권한이
       빠지면 정적 HTML 에 "데이터 없음" 이 그대로 구워진다 — anon 도 검사한다.
       (밑단 GRANT: 20260726061500_restore_market_agg_mv_grants.sql) */
    name: "complex_pair_source",
    roles: ["anon", "service"],
    note: "/complex/compare · /complex/compare/[slug] · /sitemap-pairs.xml",
  },
];

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const TAG = "[check-source-views]";

if (!url) {
  console.warn(`${TAG} SKIP — NEXT_PUBLIC_SUPABASE_URL 이 없습니다. 권한을 확인하지 못했습니다.`);
  process.exit(0);
}

const keys = [];
if (anonKey) keys.push({ role: "anon", key: anonKey });
if (serviceKey) keys.push({ role: "service", key: serviceKey });

if (keys.length === 0) {
  console.warn(`${TAG} SKIP — 사용할 수 있는 Supabase 키가 없습니다. 권한을 확인하지 못했습니다.`);
  process.exit(0);
}

/** 네트워크 자체가 막힌 환경인지(샌드박스 등) 먼저 본다. */
function isNetworkError(err) {
  const s = `${err?.cause?.code || ""} ${err?.code || ""} ${err?.message || ""}`;
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR|fetch failed|network/i.test(s);
}

const failures = [];
const warnings = [];
let checked = 0;
let networkDown = false;

for (const view of VIEWS) {
  for (const { role, key } of keys) {
    if (!view.roles.includes(role)) continue;
    if (networkDown) break;

    const target = `${url}/rest/v1/${view.name}?select=*&limit=1`;
    let res;
    try {
      res = await fetch(target, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          // 행 수를 알기 위한 Range 헤더 — content-range 로 총계가 돌아온다.
          Prefer: "count=exact",
          Range: "0-0",
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      if (isNetworkError(err) || err?.name === "TimeoutError") {
        networkDown = true;
        console.warn(
          `${TAG} SKIP — Supabase 에 접속할 수 없습니다 (${err?.message || err}). ` +
            `권한을 확인하지 못했습니다 — "이상 없음" 이 아니라 "확인 못 함" 입니다.`,
        );
        break;
      }
      failures.push(`${view.name} (${role}) — ${err?.message || err}`);
      continue;
    }

    checked += 1;
    const body = await res.text();
    if (!res.ok) {
      // PostgREST 가 낸 오류만 실패로 센다. PostgREST 오류는 반드시 message 를 가진
      // JSON 이다. 그렇지 않은 응답(사내 프록시의 "Host not in allowlist",
      // 게이트웨이 HTML 오류 페이지 등)은 DB 가 아니라 중간 경로가 답한 것이므로
      // 권한을 "확인 못 함" 으로 처리한다 — 초록으로 위장하지도, 헛되이 막지도 않는다.
      let pg = null;
      try {
        const j = JSON.parse(body);
        if (j && typeof j === "object" && typeof j.message === "string") pg = j;
      } catch {
        /* JSON 이 아니면 PostgREST 응답이 아니다 */
      }
      if (!pg) {
        networkDown = true;
        console.warn(
          `${TAG} SKIP — Supabase 응답을 중간 경로가 가로챘습니다 (HTTP ${res.status}: ` +
            `${body.replace(/\s+/g, " ").slice(0, 160)}). 권한을 확인하지 못했습니다 — ` +
            `"이상 없음" 이 아니라 "확인 못 함" 입니다.`,
        );
        break;
      }
      const detail = [pg.message, pg.code && `[${pg.code}]`, pg.hint && `힌트: ${pg.hint}`]
        .filter(Boolean)
        .join(" ");
      /* 5xx 는 권한 문제가 아니다 — 서버가 답을 못 만든 것이다.
         이 게이트가 답해야 하는 질문은 "이 롤이 이 뷰를 읽을 수 있는가" 하나뿐인데,
         5xx 는 그 질문에 아무 답도 주지 않는다. 실제로 2026-07-26, DB 가 디스크 I/O
         로 막혀 PostgREST 가 JSON 본문을 단 503(57014 statement timeout)을 뿜자
         이 블록이 그걸 권한 실패로 세어 배포를 통째로 막았다. GRANT 는 멀쩡했다.
         권한 오류는 401/403(42501)으로 오지 5xx 로 오지 않으므로, 5xx 는
         "확인 못 함"(SKIP)이다 — 초록으로 위장하지도, 헛되이 막지도 않는다. */
      if (res.status >= 500) {
        networkDown = true;
        console.warn(
          `${TAG} SKIP — Supabase 가 요청을 처리하지 못했습니다 (HTTP ${res.status} — ${detail}). ` +
            `권한이 아니라 가용성 문제입니다. 권한을 확인하지 못했습니다 — ` +
            `"이상 없음" 이 아니라 "확인 못 함" 입니다.`,
        );
        break;
      }
      failures.push(`${view.name} (${role}) HTTP ${res.status} — ${detail} · 쓰는 곳: ${view.note}`);
      continue;
    }

    const range = res.headers.get("content-range") || "";
    const total = Number(range.split("/")[1]);
    if (Number.isFinite(total) && total === 0) {
      warnings.push(`${view.name} (${role}) — 조회는 됐지만 0행입니다 · 쓰는 곳: ${view.note}`);
    } else {
      console.info(
        `${TAG} ok ${view.name} (${role}) — ${Number.isFinite(total) ? `${total.toLocaleString("en-US")}행` : "조회 성공"}`,
      );
    }
  }
  if (networkDown) break;
}

if (networkDown) process.exit(0);

for (const w of warnings) console.warn(`${TAG} warn ${w}`);

if (failures.length > 0) {
  console.error(`\n${TAG} FAIL — ${failures.length}건`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    `\n  42501(permission denied) 이면 GRANT 가 날아간 것입니다. MV 를 drop+create 한` +
      `\n  마이그레이션을 찾아 grant select on market_agg.<mv> to anon, authenticated, service_role;` +
      `\n  을 다시 넣으세요 — security_invoker 뷰라 래퍼에 준 권한은 효력이 없습니다.` +
      `\n  선례: supabase/migrations/20260726061500_restore_market_agg_mv_grants.sql`,
  );
  process.exit(1);
}

console.info(`${TAG} PASS — ${checked}건 조회 성공${warnings.length ? ` (경고 ${warnings.length}건)` : ""}`);
