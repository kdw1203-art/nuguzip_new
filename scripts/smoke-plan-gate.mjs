/**
 * Free/Pro 권한·결제 경로 스모크 (실결제 없음).
 * - 미인증 AI → 401
 * - 구독/결제 라우트 존재·응답 형태
 * 실패 시 process.exit(1)
 */
const BASE = (process.env.SMOKE_BASE_URL || "https://naezipnow.com").replace(/\/$/, "");

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

await check("POST /api/inspection/ai → 401 unauthenticated", async () => {
  const res = await fetch(`${BASE}/api/inspection/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ noteId: "smoke-missing" }),
  });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

await check("GET /subscription → 200", async () => {
  const res = await fetch(`${BASE}/subscription`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});

await check("GET /api/subscriptions → auth or ok envelope", async () => {
  const res = await fetch(`${BASE}/api/subscriptions`);
  if (![200, 401, 403].includes(res.status)) {
    throw new Error(`unexpected ${res.status}`);
  }
});

await check("billing checkout route exists (401/405/400 ok)", async () => {
  const res = await fetch(`${BASE}/api/billing/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (![400, 401, 403, 405, 422].includes(res.status)) {
    throw new Error(`unexpected ${res.status}`);
  }
});

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nplan-gate / payment path smoke OK");
