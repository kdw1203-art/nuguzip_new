import { test, expect } from "@playwright/test";

/**
 * 스모크 스위트 (#92) — 정확히 30개 케이스.
 * 원칙: DB 실데이터에 의존하는 단언 금지 — 구조 요소·HTTP 상태·코드베이스의
 * 고정 한국어 레이블만 검증한다. (로컬/CI 모두 supabase·naver 미접속 상태에서
 * 페이지의 graceful fallback 렌더링을 전제로 한다)
 */

// ---------- 홈 / 전역 내비게이션 ----------

test("1. home renders with GNB labels 임장노트·지도·AI 분석·동네이야기", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("header nav");
  await expect(nav.getByRole("link", { name: "임장노트", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "지도·시세", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "AI 분석", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "동네이야기", exact: true })).toBeVisible();
});

test("2. home header has 노트 쓰기 CTA linking to /notes/new", async ({ page }) => {
  await page.goto("/");
  const cta = page.locator("header a.btn-cta", { hasText: "노트 쓰기" });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/notes/new");
});

test("3. GNB hover dropdown shows child links (동네이야기 → 임장 모임)", async ({ page }) => {
  await page.goto("/");
  const parent = page
    .locator("header nav")
    .getByRole("link", { name: "동네이야기", exact: true });
  await parent.hover();
  await expect(page.getByRole("link", { name: "임장 모임" })).toBeVisible();
});

test("4. home footer shows 사업자 정보 (사업자등록번호)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("footer")).toContainText("사업자등록번호");
});

// ---------- 임장노트 / 발견 ----------

test("5. /notes renders with h1 and main", async ({ page }) => {
  await page.goto("/notes");
  await expect(page.getByRole("heading", { level: 1, name: /공개 임장노트/ })).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
});

test("6. /notes/new renders note composer (임시저장 control)", async ({ page }) => {
  await page.goto("/notes/new");
  await expect(page.getByText("임시저장", { exact: true }).first()).toBeVisible();
});

test("7. /notes/compare renders with AI disclaimer", async ({ page }) => {
  await page.goto("/notes/compare");
  await expect(page.getByRole("heading", { level: 1, name: /노트 다회차 비교/ })).toBeVisible();
  await expect(
    page.getByText("참고용이며 투자 판단의 책임은 이용자에게").first(),
  ).toBeVisible();
});

test("8. /discover renders with h1", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.getByRole("heading", { level: 1, name: /오늘의 임장/ })).toBeVisible();
});

// ---------- 지도 / 검색 ----------

test("9. /map renders map shell (title + zoom controls, no tile wait)", async ({ page }) => {
  await page.goto("/map");
  await expect(page).toHaveTitle(/지도 탐색/);
  await expect(page.getByRole("button", { name: "확대" })).toBeVisible();
  await expect(page.getByRole("button", { name: "축소" })).toBeVisible();
});

test("10. /search renders with search input", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByPlaceholder("단지명·동 이름으로 검색")).toBeVisible();
});

// ---------- AI 분석 ----------

test("11. /analysis renders AI 분석 hub", async ({ page }) => {
  await page.goto("/analysis");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText("AI 분석 도구").first()).toBeVisible();
});

test("12. /analysis/compare renders", async ({ page }) => {
  await page.goto("/analysis/compare");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("body")).toContainText("비교");
});

// ---------- 동네이야기 ----------

test("13. /town renders with h1 동네이야기", async ({ page }) => {
  await page.goto("/town");
  await expect(page.getByRole("heading", { level: 1, name: /동네이야기/ })).toBeVisible();
});

test("14. /town?page=2 renders (pagination shell)", async ({ page }) => {
  await page.goto("/town?page=2");
  await expect(page.getByRole("heading", { level: 1, name: /동네이야기/ })).toBeVisible();
});

test("15. /town/news renders with h1 뉴스 · 자료", async ({ page }) => {
  await page.goto("/town/news");
  await expect(page.getByRole("heading", { level: 1, name: /뉴스 · 자료/ })).toBeVisible();
});

// ---------- 구독 / 결제 ----------

test("16. /subscription renders with plan buttons", async ({ page }) => {
  await page.goto("/subscription");
  await expect(
    page.getByRole("heading", { level: 1, name: /기록은 무료, 판단은 더 깊게/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "14일 무료 체험" })).toBeVisible();
  await expect(page.getByRole("button", { name: "전문가 인증 신청" })).toBeVisible();
});

test("17. clicking a plan button while logged out leads to /login", async ({ page }) => {
  await page.goto("/subscription");
  await page.getByRole("button", { name: "14일 무료 체험" }).click();
  // PlanCheckoutButton: 비로그인 → /login?callbackUrl=/subscription 이동
  await page.waitForURL(/\/login/);
  expect(page.url()).toContain("/login");
});

// ---------- 인증 ----------

test("18. /login renders social login buttons and 비밀번호 찾기 link", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("카카오로 3초 만에 시작")).toBeVisible();
  await expect(page.getByText("네이버로 시작")).toBeVisible();
  await expect(page.getByText("Google로 시작")).toBeVisible();
  const forgot = page.getByRole("link", { name: "비밀번호를 잊으셨나요?" });
  await expect(forgot).toBeVisible();
  await expect(forgot).toHaveAttribute("href", "/forgot-password");
});

test("19. /signup renders with h1", async ({ page }) => {
  await page.goto("/signup");
  await expect(
    page.getByRole("heading", { level: 1, name: /어떤 집을 찾고 계세요\?/ }),
  ).toBeVisible();
});

test("20. /forgot-password form renders", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { level: 1, name: /비밀번호 찾기/ })).toBeVisible();
  await expect(page.locator("input").first()).toBeVisible();
});

test("21. /reset-password renders", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { level: 1, name: /새 비밀번호 설정/ })).toBeVisible();
});

// ---------- 결제 결과 ----------

test("22. /payment/fail renders", async ({ page }) => {
  await page.goto("/payment/fail");
  await expect(
    page.getByRole("heading", { level: 1, name: /결제가 완료되지 않았습니다/ }),
  ).toBeVisible();
});

test("23. /billing/success redirects to /payment/success?provider=stripe (query 보존)", async ({
  request,
}) => {
  const res = await request.get("/billing/success?session_id=cs_test_123", {
    maxRedirects: 0,
  });
  expect([301, 302, 307, 308]).toContain(res.status());
  const location = res.headers()["location"] ?? "";
  expect(location).toContain("/payment/success");
  expect(location).toContain("provider=stripe");
  expect(location).toContain("session_id=cs_test_123");
});

// ---------- 지원 / 도구 페이지 ----------

test("24. /support and /safety render", async ({ page }) => {
  await page.goto("/support");
  await expect(page.getByRole("heading", { level: 1, name: /고객지원 허브/ })).toBeVisible();
  await page.goto("/safety");
  await expect(page.getByRole("button", { name: "안전 진단" })).toBeVisible();
});

test("25. /calculator, /apply, /digest render", async ({ page }) => {
  await page.goto("/calculator");
  await expect(
    page.getByRole("heading", { level: 1, name: /대출·수익률 계산기/ }),
  ).toBeVisible();
  await page.goto("/apply");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("body")).toContainText("청약");
  await page.goto("/digest");
  await expect(
    page.getByRole("heading", { level: 1, name: /주간 다이제스트/ }),
  ).toBeVisible();
});

// ---------- 미들웨어 리다이렉트 ----------

test("26. middleware redirects /auth/forgot-password → /forgot-password", async ({ request }) => {
  const res = await request.get("/auth/forgot-password", { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toContain("/forgot-password");
});

test("27. middleware redirects /pricing → /subscription", async ({ request }) => {
  const res = await request.get("/pricing", { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toContain("/subscription");
});

// ---------- 404 ----------

test("28. unknown route shows 404 page (이 집은 이사 갔어요)", async ({ page }) => {
  const response = await page.goto("/no-such-page-xyz");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("404").first()).toBeVisible();
  await expect(page.getByText("이 집은 이사 갔어요")).toBeVisible();
});

// ---------- API / 정적 엔드포인트 ----------

test("29. API endpoints: /api/health JSON, robots.txt, sitemap.xml, OG image", async ({
  request,
}) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const body = (await health.json()) as {
    status?: string;
    checks?: { db?: { ok?: boolean } };
  };
  expect(typeof body.status).toBe("string");
  expect(typeof body.checks?.db?.ok).toBe("boolean");

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);

  const og = await request.get("/api/og/complex?name=%ED%85%8C%EC%8A%A4%ED%8A%B8");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
});

// ---------- 모바일 뷰포트 ----------

test("30. mobile viewport shows bottom tab bar with 홈·지도 labels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tabBar = page.getByRole("navigation", { name: "하단 내비게이션" });
  await expect(tabBar).toBeVisible();
  // 탭 레이블은 아이콘 문자와 같은 링크 요소 안에 있어 exact 텍스트 매칭 불가
  await expect(tabBar).toContainText("홈");
  await expect(tabBar).toContainText("지도");
});
