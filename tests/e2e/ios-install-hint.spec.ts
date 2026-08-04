import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * iOS "홈 화면에 추가" 안내 회귀 테스트 (app/components/IosInstallHint.tsx)
 *
 * 왜 별도 스위트인가 — 이 컴포넌트의 노출 조건은 **User-Agent** 다. Playwright 의
 * userAgent 는 컨텍스트 단위 옵션이라 한 테스트 안에서 바꿀 수 없어, UA 별로
 * describe 를 나눈다.
 *
 * 무엇을 지키려는 검사인가:
 *  1) iOS 사파리에서 실제로 뜬다 — 안 뜨면 아이폰 사용자는 주소창·도구막대를
 *     없애는 유일한 경로를 영영 모른다(= 없는 기능과 같다).
 *  2) 카카오톡·네이버 인앱 브라우저와 iOS 크롬에서는 뜨지 않는다 — 거기엔
 *     "홈 화면에 추가" 메뉴가 없거나 위치가 달라, 안내가 곧 틀린 안내가 된다.
 *  3) 안드로이드에서는 뜨지 않는다 — 그쪽은 InstallPrompt(beforeinstallprompt)
 *     담당이라, 둘 다 뜨면 하단이 두 층이 된다.
 *
 * UA 문자열은 실기기 값을 그대로 쓴다. 정규식만 보고 만든 문자열로 테스트하면
 * "내가 만든 정규식이 내가 만든 문자열과 맞는다"만 확인하게 된다.
 */

const HINT = '[role="region"][aria-label="홈 화면에 추가 안내"]';
const TABBAR = 'nav[aria-label="하단 내비게이션"]';
const DISMISS_KEY = "nuguzip:ios-a2hs-dismissed-at";
const VISIT_KEY = "nuguzip:visits";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const KAKAO_IN_APP = `${IOS_SAFARI} KAKAOTALK 10.5.0`;
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const IPHONE = { width: 390, height: 844 };

/**
 * 안내가 뜰 수 있는 상태로 페이지를 연다.
 *
 * - 쿠키 동의: 미결정이면 동의 배너와 겹치므로 컴포넌트가 스스로 물러난다.
 *   `analytics` 는 boolean 이어야 "결정됨" 이다(lib/client/pwa-install.ts 의
 *   cookieConsentDecided 가 use-cookie-consent 와 같은 기준을 쓴다).
 *   여기서 형식을 대충 넣으면 "왜 안 뜨지" 로 몇 시간을 태운다 — 실제로 그랬다.
 * - 베타 공지: 아직 안 닫혔으면 안내는 순서를 양보한다(깜빡임 방지).
 * - 방문 수: 첫 화면부터 가리지 않으려고 2회차부터 뜬다. 그래서 두 번 연다.
 */
async function openIos(page: Page, path = "/", { loads = 2 } = {}) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem(
      "nz_cookie_consent",
      JSON.stringify({ analytics: false, decidedAt: new Date().toISOString() }),
    );
    localStorage.setItem("nuguzip:beta-notice-v1", new Date().toISOString());
  });
  for (let i = 0; i < loads; i++) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.waitForTimeout(1000);
  }
}

test.describe("iOS 사파리", () => {
  test.use({ userAgent: IOS_SAFARI, viewport: IPHONE, isMobile: true, hasTouch: true });

  test("첫 방문에는 뜨지 않고, 두 번째 방문부터 탭바 위에 뜬다", async ({ page }) => {
    test.slow(); // 문서 로드 2~3회
    await openIos(page, "/", { loads: 1 });
    await expect(page.locator(HINT), "첫 화면부터 안내로 가리면 안 됩니다").toHaveCount(0);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await expect(page.locator(HINT)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(TABBAR)).toBeVisible();

    /* 안내가 "떴다 사라지는" 회귀(베타 모달과 겹쳐 900ms 에 제거되던 문제)를
       잡으려면 뜬 직후가 아니라 잠시 뒤에도 남아 있는지를 봐야 한다. */
    await page.waitForTimeout(2500);
    await expect(page.locator(HINT), "안내가 떴다가 사라졌습니다(모달과의 순서 확인)").toBeVisible();

    const geom = await page.evaluate(
      ([hintSel, tabbarSel]) => {
        const h = document.querySelector(hintSel)!.getBoundingClientRect();
        const t = document.querySelector(tabbarSel)!.getBoundingClientRect();
        return { top: h.top, bottom: h.bottom, left: h.left, right: h.right, tabTop: t.top, vw: window.innerWidth };
      },
      [HINT, TABBAR] as const,
    );
    expect(geom.bottom, "안내가 하단 탭바를 덮고 있습니다").toBeLessThanOrEqual(geom.tabTop);
    expect(geom.tabTop - geom.bottom).toBeGreaterThanOrEqual(8);
    expect(geom.top).toBeGreaterThan(0);
    /* 가로 중앙 — InstallPrompt 와 같은 이유(transform 쓰는 애니메이션 클래스 금지) */
    expect(Math.abs(geom.left - (geom.vw - geom.right))).toBeLessThanOrEqual(1);
  });

  test("설치되는 척하는 버튼이 없다 — 안내와 닫기뿐", async ({ page }) => {
    test.slow();
    await openIos(page);
    const hint = page.locator(HINT);
    await expect(hint).toBeVisible({ timeout: 5000 });

    /* iOS 는 공유 시트를 코드로 열 수 없다. "설치/추가하기" 버튼을 두면 눌러도
       아무 일이 없는 거짓 약속이 된다 — 버튼은 닫기 하나여야 한다. */
    const buttons = hint.locator("button");
    await expect(buttons).toHaveCount(1);
    await expect(buttons.first()).toHaveText("닫기");
    expect(
      (await buttons.first().boundingBox())!.height,
      "터치 타깃 44px 미만",
    ).toBeGreaterThanOrEqual(44);

    /* 안내문에는 실제로 찾아야 할 메뉴 이름이 그대로 들어 있어야 한다 */
    await expect(hint).toContainText("공유");
    await expect(hint).toContainText("홈 화면에 추가");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .include(HINT)
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      blocking,
      blocking.length === 0
        ? ""
        : `\niOS 안내 접근성 위반:\n${blocking.map((v) => `  [${v.impact}] ${v.id}: ${v.help}`).join("\n")}\n`,
    ).toEqual([]);
  });

  test("닫으면 30일간 다시 뜨지 않고, 만료되면 다시 뜬다", async ({ page }) => {
    test.slow();
    await openIos(page);
    await expect(page.locator(HINT)).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.locator(HINT)).toHaveCount(0);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.waitForTimeout(1200);
    await expect(page.locator(HINT), "닫았는데 다시 떴습니다").toHaveCount(0);

    await page.evaluate(
      ([k, ms]) => localStorage.setItem(k as string, String(Date.now() - (ms as number))),
      [DISMISS_KEY, 31 * 24 * 60 * 60 * 1000] as const,
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await expect(page.locator(HINT)).toBeVisible({ timeout: 5000 });
  });

  test("쿠키 동의가 미결정이면 뜨지 않는다(하단 두 층 방지)", async ({ page }) => {
    test.slow();
    /* 동의 키를 심지 않는다 — 베타 공지만 닫은 상태 */
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("nuguzip:beta-notice-v1", new Date().toISOString());
    });
    for (let i = 0; i < 3; i++) {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");
      await page.waitForTimeout(900);
    }
    await expect(page.locator(HINT)).toHaveCount(0);
    /* 방문 수는 그동안에도 세어 둬야 한다 — 안 세면 동의 직후에 또 2회를
       채워야 해서 사실상 안 뜬다(구현 순서 회귀 방지). */
    expect(Number(await page.evaluate((k) => localStorage.getItem(k), VISIT_KEY))).toBeGreaterThanOrEqual(2);
  });

  test("베타 공지가 아직 안 닫혔으면 순서를 양보한다", async ({ page }) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem(
        "nz_cookie_consent",
        JSON.stringify({ analytics: false, decidedAt: new Date().toISOString() }),
      );
    });
    for (let i = 0; i < 3; i++) {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(1500);
    await expect(page.locator(HINT)).toHaveCount(0);
  });

  test("이미 앱으로 실행 중이면(standalone) 뜨지 않는다", async ({ page }) => {
    test.slow();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { get: () => true, configurable: true });
    });
    await openIos(page);
    await expect(page.locator(HINT)).toHaveCount(0);
  });
});

test.describe("카카오톡 인앱 브라우저(홈 화면 추가 메뉴 없음)", () => {
  test.use({ userAgent: KAKAO_IN_APP, viewport: IPHONE, isMobile: true, hasTouch: true });

  test("뜨지 않는다 — 없는 메뉴를 찾게 만들면 안 하느니만 못하다", async ({ page }) => {
    test.slow();
    await openIos(page);
    await expect(page.locator(HINT)).toHaveCount(0);
  });
});

test.describe("iOS 크롬", () => {
  test.use({ userAgent: CHROME_IOS, viewport: IPHONE, isMobile: true, hasTouch: true });

  test("뜨지 않는다 — 공유 시트 구성이 사파리와 달라 같은 안내를 쓸 수 없다", async ({ page }) => {
    test.slow();
    await openIos(page);
    await expect(page.locator(HINT)).toHaveCount(0);
  });
});

test.describe("안드로이드 크롬", () => {
  test.use({ userAgent: ANDROID_CHROME, viewport: IPHONE, isMobile: true, hasTouch: true });

  test("뜨지 않는다 — 그쪽은 InstallPrompt 담당이라 겹치면 하단이 두 층이 된다", async ({
    page,
  }) => {
    test.slow();
    await openIos(page);
    await expect(page.locator(HINT)).toHaveCount(0);
  });
});
