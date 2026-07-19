#!/usr/bin/env node
/**
 * 공공데이터·임장 API 스모크 테스트
 * 실행: npm run smoke:public-data
 * 환경: BASE_URL (기본 http://localhost:3000)
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ ${name}: ${msg}`);
    return false;
  }
}

const FETCH_TIMEOUT_MS = Number(process.env.SMOKE_FETCH_TIMEOUT_MS ?? 15000);

function fetchWithTimeout(url, init = {}) {
  const signal =
    init.signal ??
    (typeof AbortSignal !== "undefined" && AbortSignal.timeout
      ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
      : undefined);
  return fetch(url, { ...init, signal });
}

async function getJson(path, init) {
  let res;
  try {
    res = await fetchWithTimeout(`${BASE}${path}`, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort|timeout/i.test(msg)) {
      throw new Error(
        `fetch timeout (${FETCH_TIMEOUT_MS}ms) — dev 서버가 ${BASE} 에서 떠 있는지 확인하세요. 포트가 다르면 BASE_URL=http://localhost:3004 npm run smoke:public-data`,
      );
    }
    throw new Error(`fetch failed — dev 서버(${BASE}) 미기동 또는 포트 불일치`);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${res.status} non-JSON: ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`${res.status} ${json.error ?? text.slice(0, 80)}`);
  return json;
}

async function main() {
  console.log(`\nSmoke: public-data @ ${BASE}\n`);
  let ok = 0;
  let total = 0;

  const run = async (name, fn) => {
    total += 1;
    if (await check(name, fn)) ok += 1;
  };

  await run("GET /api/health", async () => {
    const j = await getJson("/api/health");
    if (!j || typeof j !== "object") throw new Error("empty body");
  });

  await run("GET /api/public-data/status", async () => {
    const j = await getJson("/api/public-data/status");
    if (!Array.isArray(j.sources)) throw new Error("sources missing");
  });

  await run("GET /api/public-data/status?source=mot-transactions", async () => {
    const j = await getJson("/api/public-data/status?source=mot-transactions");
    if (typeof j.live !== "boolean" || !j.label) throw new Error("source probe shape");
  });

  await run("GET /api/public-data/national/batch?intent=실거주&district=강남구", async () => {
    const j = await getJson(
      "/api/public-data/national/batch?intent=실거주&district=강남구",
    );
    if (!Array.isArray(j.items)) throw new Error("batch items missing");
  });

  await run("GET /api/inspection/public-data-context", async () => {
    const j = await getJson(
      "/api/inspection/public-data-context?district=강남구&intent=실거주",
    );
    if (!j.district && !j.plans) throw new Error("unexpected shape");
  });

  await run("POST /api/ai/inspection-note", async () => {
    const j = await getJson("/api/ai/inspection-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region: "강남구",
        intent: "투자",
        memo: "역세권·학군 확인 필요",
      }),
    });
    if (!j.summary && !j.pros) throw new Error("no summary/pros");
  });

  console.log(`\n${ok}/${total} passed\n`);
  process.exit(ok === total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
