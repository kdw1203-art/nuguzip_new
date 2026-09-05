import { strict as assert } from "node:assert";
import test from "node:test";

import { resolveProfileRow } from "../../lib/auth/profile-rules";
import { mapSignUpRejection } from "../../lib/auth/signup-error";
import { safeInternalPath } from "../../lib/safe-path";

/* [965] 회원가입·로그인 규칙의 회귀 방지 — 전부 순수 함수라 DB 없이 검증한다. */

const NOW = new Date("2026-09-05T03:00:00Z");

test("plan_expires_at 이 지난 유료 플랜은 읽는 시점에 free 다", () => {
  const p = resolveProfileRow(
    { role: "user", plan: "pro", plan_expires_at: "2026-09-05T02:59:59Z" },
    NOW,
  );
  assert.equal(p.plan, "free");
  assert.equal(p.banned, false);
});

test("만료가 미래이거나 없으면 플랜을 유지한다", () => {
  assert.equal(
    resolveProfileRow({ plan: "expert", plan_expires_at: "2026-09-06T00:00:00Z" }, NOW).plan,
    "expert",
  );
  assert.equal(resolveProfileRow({ plan: "enterprise", plan_expires_at: null }, NOW).plan, "enterprise");
});

test("is_banned 는 ban_until 이 없거나 미래일 때만 제재다", () => {
  assert.equal(resolveProfileRow({ is_banned: true }, NOW).banned, true);
  assert.equal(
    resolveProfileRow({ is_banned: true, ban_until: "2026-12-31T00:00:00Z" }, NOW).banned,
    true,
  );
  /* 기한이 지난 제재는 풀린 것 */
  assert.equal(
    resolveProfileRow({ is_banned: true, ban_until: "2026-01-01T00:00:00Z" }, NOW).banned,
    false,
  );
  assert.equal(resolveProfileRow({ is_banned: false }, NOW).banned, false);
});

test("role 은 admin 만 admin, 나머지는 user", () => {
  assert.equal(resolveProfileRow({ role: "admin" }, NOW).role, "admin");
  assert.equal(resolveProfileRow({ role: "staff" }, NOW).role, "user");
  assert.equal(resolveProfileRow({}, NOW).role, "user");
});

test("HIBP 유출 비밀번호 거절(422)은 재시도 안내가 아니라 400 + 바꾸라는 안내", () => {
  const m = mapSignUpRejection({
    status: 422,
    code: "weak_password",
    message: "Password is known to be weak and easy to guess",
  });
  assert.ok(m);
  assert.equal(m.status, 400);
  assert.equal(m.body.code, "weak_password");
});

test("Supabase Auth 5xx 는 매핑하지 않는다(호출부 503 분기)", () => {
  assert.equal(mapSignUpRejection({ status: 502, message: "Bad Gateway" }), null);
  assert.equal(mapSignUpRejection({ status: 0 }), null);
});

test("발송 한도(429·over_*)는 Retry-After 를 붙여 429 로", () => {
  const m = mapSignUpRejection({ status: 429, code: "over_email_send_rate_limit" });
  assert.ok(m);
  assert.equal(m.status, 429);
  assert.equal(m.headers?.["Retry-After"], "120");
});

test("callbackUrl 은 내부 경로만 — 프로토콜 상대·백슬래시·절대 URL 은 기본값으로", () => {
  assert.equal(safeInternalPath("/my/notes", "/"), "/my/notes");
  assert.equal(safeInternalPath("//evil.com", "/"), "/");
  assert.equal(safeInternalPath("/\\evil.com", "/"), "/");
  assert.equal(safeInternalPath("https://evil.com/x", "/"), "/");
  assert.equal(safeInternalPath(null, "/login?verified=1"), "/login?verified=1");
});
