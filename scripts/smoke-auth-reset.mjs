/**
 * 비밀번호 재설정 경로 스모크 (실메일 발송·토큰 완주 아님).
 * - forgot-password: 유효/무효 이메일 → 200 opaque 또는 429
 * - reset-password GET/POST: 잘못된 토큰 → 400
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

await check("GET /forgot-password → 200", async () => {
  const res = await fetch(`${BASE}/forgot-password`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});

await check("GET /reset-password → 200", async () => {
  const res = await fetch(`${BASE}/reset-password`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});

await check("POST /api/auth/forgot-password opaque 200/429", async () => {
  const res = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "smoke-nonexistent@example.com" }),
  });
  if (![200, 429].includes(res.status)) throw new Error(`unexpected ${res.status}`);
  if (res.status === 200) {
    const data = await res.json().catch(() => ({}));
    if (data?.ok === false) throw new Error("expected opaque success envelope");
  }
});

await check("GET /api/auth/reset-password?token=bad → 400/valid:false", async () => {
  const res = await fetch(`${BASE}/api/auth/reset-password?token=smoke-invalid-token`);
  if (![200, 400].includes(res.status)) throw new Error(`unexpected ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (data.valid === true) throw new Error("invalid token must not be valid");
});

await check("POST /api/auth/reset-password bad token → 400", async () => {
  const res = await fetch(`${BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "smoke-invalid", password: "longenough1" }),
  });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nauth-reset path smoke OK");
