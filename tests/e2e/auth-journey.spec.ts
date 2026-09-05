import { test, expect } from "@playwright/test";

/**
 * [H003] 인증 여정 스모크 — 로그인이 "실제로 되는가".
 *
 * 기존 스모크 25건은 전부 비로그인 렌더 확인이다. 정작 2026-08-10 실사용자
 * 가입 실패 같은 사고는 인증 경로에서 났는데, 그 경로를 자동으로 밟는 테스트가
 * 없었다. 이 파일이 그 구멍을 메운다: 로그인 → 세션 유지 → 로그인 전용
 * 화면 진입까지.
 *
 * 자격 증명은 코드에 두지 않는다 — CI 시크릿/로컬 환경변수로만 받고,
 * 없으면 전체 스킵한다(실패가 아니라 스킵: 자격 없는 환경에서 빨간불을
 * 만들면 진짜 빨간불이 묻힌다).
 *
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD  (전용 테스트 계정만 — 실계정 금지)
 *
 * 노트 "저장까지" 밟는 여정은 일부러 뺐다: 지금 E2E 대상 서버가 운영 DB 를
 * 보므로, CI 가 돌 때마다 실데이터에 테스트 노트가 쌓인다. 쓰기 여정은
 * 테스트 픽스처 정책(전용 계정의 노트를 주기 삭제하는 크론 등)을 정한 뒤
 * E2E_ALLOW_WRITES=1 가드와 함께 추가한다.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.describe("인증 여정", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_TEST_EMAIL/E2E_TEST_PASSWORD 미설정 — 인증 여정 스킵");

  test("이메일 로그인 → 세션 유지 → 로그인 전용 화면 진입", async ({ page }) => {
    // 1) 로그인
    await page.goto("/login");
    await page.locator("#login-email").fill(EMAIL!);
    await page.locator("#login-password").fill(PASSWORD!);
    await page.getByRole("button", { name: "이메일로 로그인" }).click();

    // 로그인 성공 = /login 을 떠난다 (실패 시 에러 문구와 함께 남는다)
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });

    // 2) 세션이 실제로 서버에 붙었는지 — 로그인 전용 페이지가 튕기지 않아야 한다
    await page.goto("/my");
    await expect(page).not.toHaveURL(/\/login/);

    // 3) 작성 화면 — 로그인 상태에서 컴포저가 열린다
    await page.goto("/notes/new");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText("임시저장", { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });

    // 4) 지도 — 로그인 상태에서도 셸이 뜬다 (타일 로드는 기다리지 않는다)
    await page.goto("/map");
    await expect(page.locator("h1")).toHaveText(/지도/, { timeout: 15_000 });
  });

  test("로그아웃 상태 복원 — 세션 쿠키 없이 /my 는 게스트 안내(로그인 유도)를 그린다", async ({ browser }) => {
    // 새 컨텍스트 = 쿠키 없음. 위 테스트와 격리해 "보호가 실제로 걸려 있는가"를 본다.
    /* [965] /my 는 탭바에서 바로 여는 화면이라 비로그인은 리다이렉트가 아니라
       GuestView(로그인 CTA)를 그린다 — 개인 데이터는 한 줄도 나오지 않아야 한다. */
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/my");
    await expect(page).toHaveURL(/\/my/);
    await expect(
      page.getByText("로그인하고 내 활동을 한곳에서 관리하세요", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await ctx.close();
  });
});
