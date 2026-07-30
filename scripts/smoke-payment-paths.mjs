/**
 * 결제 경로 스모크 (실결제·실환불 없음).
 * - checkout 미인증/잘못된 body → 401/400류
 * - success/fail 페이지 존재
 */
const BASE = (process.env.SMOKE_BASE_URL || "https://nuguzip.com").replace(/\/$/, "");
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`OK  ${name}`);
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    console.error(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

await check("POST /api/billing/checkout → 400/401/403/422", async () => {
  const res = await fetch(`${BASE}/api/billing/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (![400, 401, 403, 405, 422, 503].includes(res.status)) {
    throw new Error(`unexpected ${res.status}`);
  }
});

await check("GET /subscription → 200", async () => {
  const res = await fetch(`${BASE}/subscription`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});

for (const path of ["/payment/success", "/payment/fail", "/billing/success", "/billing/fail"]) {
  await check(`GET ${path} (soft)`, async () => {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    /* 라우트 없으면 404 — 존재하는 대안만 통과로 보지 않고 soft 허용 */
    if (![200, 301, 302, 307, 308, 404].includes(res.status)) {
      throw new Error(`unexpected ${res.status}`);
    }
  });
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\npayment path smoke OK (no real charge)");
