import { test, expect } from "@playwright/test";

/**
 * 스모크 스위트 (#92) — 35개 케이스 (신규 IA/기능 5종 추가).
 * 원칙: DB 실데이터에 의존하는 단언 금지 — 구조 요소·HTTP 상태·코드베이스의
 * 고정 한국어 레이블만 검증한다. (로컬/CI 모두 supabase·naver 미접속 상태에서
 * 페이지의 graceful fallback 렌더링을 전제로 한다)
 */

// ---------- 홈 / 전역 내비게이션 ----------

test("1. home renders with GNB labels 임장노트·지도·AI 분석·동네이야기", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("header nav");
  await expect(nav.getByRole("link", { name: "임장노트", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "지도", exact: true })).toBeVisible();
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
  /* GNB 드롭다운을 보는 테스트이므로 헤더 안으로 범위를 좁힌다.
     예전에는 페이지 전체에서 "임장 모임" 링크를 찾았는데, 홈 본문에도
     "임장 모임 보기 ›"(예정된 모임이 0건일 때만 렌더)가 있어서 이름이
     부분 일치로 두 개 잡혔다 — strict mode 위반으로 실패했다.
     즉 모임 데이터 유무에 따라 붙었다 떨어졌다 하는 테스트였다. */
  await expect(
    page.locator("header nav").getByRole("link", { name: "임장 모임", exact: true }),
  ).toBeVisible();
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

test("7. /notes/compare renders honestly in both states", async ({ page }) => {
  /* 2026-07-30 목업 제거 이후 이 페이지는 비로그인에게 예시 표를 그리지 않는다
     (없는 데이터를 보여주지 않는 것이 맞다). 그래서 상태가 둘로 갈린다:
       · 비로그인(E2E 기본) — "로그인이 필요해요" 안내
       · 로그인 + 2회 이상 기록 — 비교 표 + AI 면책 문구
     예전 단언(면책 문구 무조건)은 첫 상태에서 항상 깨졌다. 두 상태 모두
     정직한 화면인지 확인한다. */
  await page.goto("/notes/compare");
  await expect(page.getByRole("heading", { level: 1, name: /노트 다회차 비교/ })).toBeVisible();
  const loginGate = page.getByText("로그인이 필요해요").first();
  const disclaimer = page.getByText("참고용이며 투자 판단의 책임은 이용자에게").first();
  await expect(loginGate.or(disclaimer)).toBeVisible();
});

test("8. /discover redirects into the merged 동네이야기 feed", async ({ page }) => {
  // 대통합 IA: 발견 피드가 /town 통합 피드로 합쳐짐
  await page.goto("/discover");
  await page.waitForURL(/\/town$/);
  await expect(page.getByRole("heading", { level: 1, name: /동네이야기/ })).toBeVisible();
});

// ---------- 지도 / 검색 ----------

test("9. /map renders map shell (title + zoom controls, no tile wait)", async ({ page }) => {
  await page.goto("/map");
  /* 제목은 카피 개편으로 "지도 탐색" → "지도에서 비교"가 됐다(2026-08-02 확인).
     특정 카피를 단정하면 카피 수정마다 스위트가 죽는다 — "지도"가 포함된
     제목이면 지도 셸이 맞다(줌 컨트롤 단언이 실체를 검증한다). */
  await expect(page).toHaveTitle(/지도/);
  await expect(page.getByRole("button", { name: "확대" })).toBeVisible();
  await expect(page.getByRole("button", { name: "축소" })).toBeVisible();
});

test("10. /search renders with search input", async ({ page }) => {
  await page.goto("/search");
  await expect(
    page.getByPlaceholder("단지·매물·임장노트·뉴스 통합 검색"),
  ).toBeVisible();
});

// ---------- AI 분석 ----------

test("11. /analysis renders AI 분석 hub", async ({ page }) => {
  await page.goto("/analysis", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("AI 분석 도구").first()).toBeVisible({ timeout: 15000 });
});

test("12. /analysis/compare renders", async ({ page }) => {
  await page.goto("/analysis/compare", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("body")).toContainText("비교", { timeout: 15000 });
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
  await expect(page.getByRole("heading", { level: 1, name: /뉴스/ })).toBeVisible();
});

// ---------- 구독 / 결제 ----------

/* /subscription 은 서버가 결제 개통 상태를 판정해 두 상태 중 하나를 그린다
   (감사 항목 33):
   - 결제 준비됨: "플러스 시작하기"·"전문가로 시작" 결제 버튼
   - 미개통(사업자 고지 미완·PSP 미설정 — CI 는 env 가 없어 항상 이 상태):
     "오픈 알림 받기" 사전 등록 버튼
   테스트는 서버와 같은 사실을 본다 — 어느 한 상태를 단정하면 env 에 따라
   거짓 빨강이 된다(2026-08-02 run 30725419638 이 그렇게 죽었다). */
test("16. /subscription renders plan CTAs (결제 개통 여부에 맞는 상태)", async ({ page }) => {
  await page.goto("/subscription");
  await expect(
    page.getByRole("heading", { level: 1, name: /기록은 무료, 판단은 더 깊게/ }),
  ).toBeVisible();
  const checkout = page.getByRole("button", { name: "플러스 시작하기" });
  const preorder = page.getByRole("button", { name: "오픈 알림 받기" });
  await expect(checkout.or(preorder).first()).toBeVisible();
  if ((await checkout.count()) > 0) {
    // 결제 개통 상태 — 두 유료 티어 버튼이 모두 있어야 한다
    await expect(page.getByRole("button", { name: "전문가로 시작" })).toBeVisible();
  } else {
    // 미개통 상태 — 사전 등록 버튼(PRO·EXPERT 카드 각 1개) + 사실 고지 문구
    expect(await preorder.count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByText("아직 결제가 열리지 않았습니다").first()).toBeVisible();
  }
});

test("17. clicking a plan button while logged out leads to /login", async ({ page }) => {
  await page.goto("/subscription");
  const checkout = page.getByRole("button", { name: "플러스 시작하기" });
  if ((await checkout.count()) === 0) {
    /* 결제 미개통 상태 — 결제 버튼 자체가 없으므로 로그인 리다이렉트 흐름이
       존재하지 않는다. 대신 사전 등록 버튼이 눌리는지(죽은 컨트롤 아님)만
       확인한다. 등록 결과 문구는 DB 유무에 따라 다르므로 단정하지 않는다. */
    const preorder = page.getByRole("button", { name: "오픈 알림 받기" }).first();
    await expect(preorder).toBeVisible();
    await preorder.click();
    return;
  }
  await checkout.click();
  // 8908947: window.confirm 대신 버튼 자리에서 확인받는 2단계 — "계속"을 눌러야 진행된다.
  await page.getByRole("button", { name: "계속" }).click();
  // PlanCheckoutButton: 비로그인 → /login?callbackUrl=/subscription 이동
  await page.waitForURL(/\/login/);
  expect(page.url()).toContain("/login");
});

// ---------- 인증 ----------

/**
 * 소셜 버튼은 **설정된 provider 와 정확히 일치**해야 한다.
 *
 * 예전 이 테스트는 카카오·네이버·구글 버튼이 항상 보인다고 단정했다. 그래서
 * 운영에서 `/api/auth/providers` 가 password 하나만 돌려주는데도 버튼 셋이 다
 * 떠 있고, 누르면 `/api/auth/error?error=Configuration` 으로 가는 상태를
 * 이 스위트가 초록으로 통과시켰다. 기준을 env 실제값(=providers 응답)으로 바꾼다.
 */
test("18. /login shows exactly the configured social buttons + 비밀번호 찾기 link", async ({
  page,
  request,
}) => {
  const providers = (await (await request.get("/api/auth/providers")).json()) as Record<
    string,
    { id?: string }
  >;
  const ids = new Set(Object.keys(providers ?? {}));
  /* 제품 정책: 소셜 로그인은 Google만. 카카오/네이버 로그인 버튼은 없어야 한다. */
  const LABELS: Record<string, string> = {
    google: "Google로 시작",
  };
  const RETIRED_LABELS = ["카카오로 3초 만에 시작", "네이버로 시작"];

  await page.goto("/login");
  for (const [id, label] of Object.entries(LABELS)) {
    const button = page.getByRole("button", { name: label });
    if (ids.has(id)) await expect(button).toBeVisible();
    else await expect(button).toHaveCount(0);
  }
  for (const label of RETIRED_LABELS) {
    await expect(page.getByRole("button", { name: label })).toHaveCount(0);
  }

  // 이메일 로그인은 provider 구성과 무관하게 항상 있어야 하는 경로
  await expect(page.getByRole("button", { name: /이메일로 로그인|로그인 중/ })).toBeVisible();
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
  /* 한 케이스가 페이지를 셋이나 연다. goto 는 기본적으로 "load"(광고·분석 스크립트
     포함 전부)를 기다리므로, 외부 스크립트가 느린 환경에서는 세 번의 합이 기본
     예산 30초를 넘긴다 — 실제로 /digest 진입에서 타임아웃이 재현됐다(서버 응답
     자체는 7ms). 설치 프롬프트 스위트와 같은 원인이라 같은 처방을 쓴다. */
  test.slow();
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
  /* 모바일6(2026-08-03) — 쿠키 결정 전에는 탭바를 접어 하단을 배너 한 층으로
     유지한다. 첫 방문 흐름 그대로 검증: 결정 전 미노출 → 결정 즉시 복원. */
  const consent = page.getByRole("region", { name: "쿠키 사용 동의" });
  await expect(consent).toBeVisible();
  await expect(tabBar).toHaveCount(0);
  await page.getByRole("button", { name: "필수만 허용" }).click();
  await expect(tabBar).toBeVisible();
  // 탭 레이블은 아이콘 문자와 같은 링크 요소 안에 있어 exact 텍스트 매칭 불가
  await expect(tabBar).toContainText("홈");
  await expect(tabBar).toContainText("지도");
});

// ---------- 개발물건 중개 (B2B 디벨로퍼 매칭) ----------

test("31. /dev-deals renders 개발물건 중개 hub with CTAs", async ({ page }) => {
  await page.goto("/dev-deals");
  await expect(
    page.getByRole("heading", { level: 1, name: /개발물건 중개/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "개발물건 등록" }).first()).toBeVisible();
});

test("32. /dev-deals/fees renders tiered commission schedule", async ({ page }) => {
  await page.goto("/dev-deals/fees");
  await expect(
    page.getByRole("heading", { level: 1, name: /중개 수수료 안내/ }),
  ).toBeVisible();
  await expect(page.getByText("사업규모별 기준 수수료").first()).toBeVisible();
});

test("33. /dev-deals/partners renders partner directory", async ({ page }) => {
  await page.goto("/dev-deals/partners", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("협력업체").first()).toBeVisible({ timeout: 15000 });
});

// ---------- 법원경매 소스 토글 ----------

test("34. /auctions?source=court 는 온비드 목록으로 정직하게 수렴한다", async ({ page }) => {
  /* [개선 W1] 법원경매 탭 제거 — 실데이터 1건(스텁)뿐인 탭은 화면에서 뺐다.
     옛 링크(?source=court)로 들어와도 빈 탭이 아니라 온비드 공매 목록이 보여야 한다. */
  await page.goto("/auctions?source=court");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText(/공매|온비드/).first()).toBeVisible();
});

// ---------- 친구 추천 초대 랜딩 ----------

test("35. /invite/[code] renders invite landing", async ({ page }) => {
  await page.goto("/invite/TESTCODE");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText(/초대|가입/).first()).toBeVisible();
});

// ---------- 웨이브 3: 노트 템플릿 · 단지 Q&A · 저장 검색 ----------

test("36. /notes/templates renders template marketplace (공식 템플릿)", async ({ page }) => {
  await page.goto("/notes/templates", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/임장 노트 템플릿/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/체크리스트/).first()).toBeVisible({ timeout: 15000 });
});

test("37. template detail links to /notes/new?tpl", async ({ page }) => {
  await page.goto("/notes/templates/official-basic", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("link", { name: /이 템플릿으로 노트 쓰기/ }),
  ).toBeVisible({ timeout: 15000 });
});

test("38. /qna renders 단지 Q&A list", async ({ page }) => {
  await page.goto("/qna", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("heading", { name: /단지 Q&A/ }).first(),
  ).toBeVisible({ timeout: 15000 });
});

test("39. /my/saved-searches renders (login prompt when logged out)", async ({ page }) => {
  await page.goto("/my/saved-searches", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/저장 검색/).first()).toBeVisible({ timeout: 15000 });
});

// ---------- 정비사업 지도 (재개발·재건축 사업장) ----------

test("40. /redevelopment renders 정비사업 지도 with 사업종류 filter + 데이터 출처", async ({
  page,
}) => {
  await page.goto("/redevelopment", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("heading", { name: /정비사업 지도/ }).first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/사업종류/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/데이터 출처/).first()).toBeVisible({ timeout: 15000 });
});

test("41. /api/redevelopment/projects returns filtered items", async ({ request }) => {
  const res = await request.get("/api/redevelopment/projects?types=redev&stages=mgmt_approved");
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(Array.isArray(json.items)).toBeTruthy();
  expect(json.items.length).toBeGreaterThan(0);
  for (const it of json.items) {
    expect(it.typeKey).toBe("redev");
    expect(it.stageKey).toBe("mgmt_approved");
  }
});

// ---------- 임장노트 위치(단지·주소) 검색 연동 ----------

test("42. /notes/new prefills 단지 from query and shows location search", async ({ page }) => {
  await page.goto("/notes/new?apt=" + encodeURIComponent("은마아파트") + "&region=" + encodeURIComponent("서울 강남구"), {
    waitUntil: "domcontentloaded",
  });
  // 프리필된 단지명이 위치 카드에 반영(클라이언트 하이드레이션 후)
  await expect(page.getByText("은마아파트").first()).toBeVisible({ timeout: 15000 });
  // 위치 카드 클릭 → 검색 입력 노출
  await page.getByText(/눌러서 변경/).first().click();
  await expect(page.getByPlaceholder(/단지명 또는 주소/)).toBeVisible({ timeout: 10000 });
});

// ---------- 미설정 기능의 UI 입구 ----------

/**
 * 웹 푸시 입구는 **서버가 실제로 보낼 수 있을 때만** 그려져야 한다.
 *
 * 2026-07-28: /my/settings 에 푸시 토글이 8개 있었는데 운영에는 VAPID 키가 없었다.
 * 토글은 저장까지 정상으로 되고 알림만 영영 오지 않는다 — 로그인 화면의 소셜 버튼과
 * 같은 부류지만, 눌러도 에러가 안 나서 **사용자가 틀렸다는 걸 알 방법이 없었다.**
 * 기준은 서버가 스스로 보고하는 값(GET /api/push/subscribe)이다.
 */
test("43. 웹 푸시 입구는 서버가 활성일 때만 노출된다", async ({ page, request }) => {
  const res = await request.get("/api/push/subscribe");
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { enabled?: boolean; publicKey?: string | null };
  const enabled = Boolean(body.enabled && body.publicKey);

  await page.goto("/my/settings", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "알림" }).first().click();
  /* 탭이 실제로 열렸는지부터 확인한다. 이게 없으면 아래 "없어야 한다" 단언들이
     빈 화면에서도 통과해 버린다 — 아무것도 검사하지 않는 테스트가 된다. */
  await expect(page.getByText("관심 지역 · 급매 알림 구독")).toBeVisible({ timeout: 15000 });

  const entry = page.getByRole("button", { name: /알림 켜기/ });
  if (enabled) {
    // 켜져 있으면 입구가 있어야 한다(브라우저 권한 요청은 클릭 시에만 — 여기서 누르지 않는다)
    await expect(entry).toBeVisible({ timeout: 15000 });
  } else {
    await expect(entry).toHaveCount(0);
    // 보낼 수 없는 채널의 설정 줄도 그리지 않는다
    await expect(page.getByText("푸시 알림", { exact: true })).toHaveCount(0);
  }
});

// ---------- 고도화 41 — 신규 표면 회귀 방지 (가이드 2종 · llms.txt) ----------

test("44. /guides/contract renders 5단계 + HowTo JSON-LD", async ({ page }) => {
  await page.goto("/guides/contract");
  await expect(
    page.getByRole("heading", { level: 1, name: /계약 전 체크리스트/ }),
  ).toBeVisible();
  await expect(page.getByText("계약 단계별 확인사항").first()).toBeVisible();
  const jsonld = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  expect(jsonld.join(" ")).toContain('"HowTo"');
});

test("45. /guides/regulations renders 규제 개념 섹션", async ({ page }) => {
  await page.goto("/guides/regulations");
  await expect(
    page.getByRole("heading", { level: 1, name: /부동산 규제·의무 안내/ }),
  ).toBeVisible();
  await expect(page.getByText("투기과열지구").first()).toBeVisible();
});

test("46. /llms.txt 는 실데이터 라우트로 응답한다", async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.ok()).toBeTruthy();
  const body = await res.text();
  expect(body).toContain("# 내집나우 (nuguzip.com)");
  /* 커버리지 숫자는 환경(DB 유무)에 따라 있거나 생략된다 — 어느 쪽이든
     문서 골격과 핵심 링크는 있어야 한다. 숫자 유무를 단언하지 않는 이유:
     CI 일회용 서버에는 DB 가 없어 정직하게 생략되는 것이 맞는 동작이다. */
  expect(body).toContain("https://nuguzip.com/tx");
  expect(body).toContain("sitemap-complexes.xml");
});

test("47. /subscription/checkout 은 키 미설정 환경에서 정직한 실패를 그린다", async ({ page }) => {
  /* CI 일회용 서버에는 토스 키가 없다. 이때 빈 화면·가짜 결제 UI 가 아니라
     "시작하지 못했다"는 사실과 되돌아갈 길을 보여줘야 한다. 키가 설정된
     환경에서는 로그인 게이트가 먼저 뜬다 — 두 상태 모두 정직한 상태다. */
  await page.goto("/subscription/checkout?tier=pro&billing=monthly");
  const honest = page
    .getByText("결제를 시작하지 못했어요")
    .or(page.getByText("결제하려면 로그인이 필요해요"))
    .or(page.getByText("주문 준비 중"));
  await expect(honest.first()).toBeVisible({ timeout: 10_000 });
});

test("48. 토스 웹훅은 모르는 이벤트에도 200 을 준다 (재시도 폭주 방지)", async ({ request }) => {
  const res = await request.post("/api/payments/toss/webhook", {
    data: { eventType: "SOMETHING_ELSE" },
  });
  expect(res.status()).toBe(200);
});

test("49. 관리자 결제 취소 API 는 비관리자를 403 으로 거절한다", async ({ request }) => {
  const res = await request.post("/api/admin/payments/cancel", {
    data: { orderId: "SMOKE-TEST-NOT-REAL" },
  });
  expect(res.status()).toBe(403);
});

// ---------- 웨이브 2026-08-22: 계산기 확장 · 청약 캘린더 · 키워드 알림 ----------

test("50. /calculator/brokerage renders 중개보수 계산기 (요율표 포함)", async ({ page }) => {
  await page.goto("/calculator/brokerage");
  await expect(
    page.getByRole("heading", { name: /중개보수 계산기/ }).first(),
  ).toBeVisible();
  /* 법정 상한요율 안내가 화면에 있어야 한다 — 협의·상한 고지는 이 화면의 핵심 정직성 */
  await expect(page.getByText(/상한요율/).first()).toBeVisible();
});

test("51. /apply/calendar renders 청약 캘린더 (데이터 유무와 무관한 껍데기)", async ({ page }) => {
  await page.goto("/apply/calendar");
  await expect(
    page.getByRole("heading", { name: /청약 캘린더/ }).first(),
  ).toBeVisible();
});

test("52. /town/news shows 키워드 알림 구독 스트립 (#13)", async ({ page }) => {
  await page.goto("/town/news");
  await expect(page.getByText("키워드 알림").first()).toBeVisible();
  await expect(page.getByLabel("알림 받을 키워드")).toBeVisible();
});

test("53. [#51] 단지 한글 슬러그 — 구 base64 URL 은 308, 표준 슬러그는 그대로", async ({ request }) => {
  /* 이름이 id 안에 인코딩돼 있어 DB 없이도 미들웨어가 정규화한다 — CI 환경 안전 */
  const SEP = String.fromCharCode(1);
  const id = Buffer.from(`서울 노원구${SEP}상계주공7`, "utf8").toString("base64url");
  const decorated = `${encodeURIComponent("서울-노원구-상계주공7")}.${id}`;

  const legacy = await request.get(`/complex/${id}`, { maxRedirects: 0 });
  expect(legacy.status()).toBe(308);
  expect(legacy.headers()["location"] ?? "").toContain(`.${id}`);

  const canonical = await request.get(`/complex/${decorated}`, { maxRedirects: 0 });
  expect(canonical.status()).not.toBe(308); // 표준형은 다시 보내지 않는다(루프 금지)

  const stale = await request.get(`/complex/${encodeURIComponent("옛-슬러그")}.${id}`, {
    maxRedirects: 0,
  });
  expect(stale.status()).toBe(308);

  const kapt = await request.get(`/complex/kapt.A10027336`, { maxRedirects: 0 });
  expect(kapt.status()).not.toBe(308); // kapt 는 미들웨어가 손대지 않는다
});
