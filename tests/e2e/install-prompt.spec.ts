import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * G9 — PWA 설치 프롬프트 회귀 테스트
 *
 * 이 배너는 실제 브라우저가 `beforeinstallprompt` 를 보낼 때만 뜬다. 그런데 그 이벤트는
 * 헤드리스 크로미움에서 **절대 발생하지 않는다** — 브라우저 자체 참여도 기준을 통과해야
 * 하기 때문이다. 즉 아무것도 안 하면 이 컴포넌트는 CI 에서 영원히 검사되지 않는다.
 * (실제로 a11y 스위트도 이 배너를 한 번도 본 적이 없다.)
 *
 * 그래서 같은 모양의 이벤트를 직접 만들어 넣는다. 컴포넌트가 의존하는 계약은
 * preventDefault() · prompt() · userChoice 세 개뿐이라, 이 셋을 갖춘 가짜 이벤트면
 * 분기·상태·배치가 전부 실제와 같은 경로를 탄다. 검증 못 하는 건 브라우저가 이벤트를
 * 보낼지 말지 판단하는 부분인데, 그건 애초에 우리 코드가 아니다.
 */

const BANNER = '[role="region"][aria-label="앱 설치 안내"]';
const TABBAR = 'nav[aria-label="하단 내비게이션"]';
const DISMISS_KEY = "nuguzip:pwa-install-dismissed-at";

/** 가짜 beforeinstallprompt 를 쏜다. outcome 은 브라우저 설치 다이얼로그의 응답. */
function fireInstallPrompt(page: Page, outcome: "accepted" | "dismissed" = "accepted") {
  return page.evaluate((choice) => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string; platform: string }>;
    };
    const w = window as unknown as { __prompted?: boolean; __prevented?: boolean };
    w.__prompted = false;
    w.__prevented = false;
    const originalPreventDefault = e.preventDefault.bind(e);
    e.preventDefault = () => {
      w.__prevented = true;
      originalPreventDefault();
    };
    e.prompt = async () => {
      w.__prompted = true;
    };
    e.userChoice = Promise.resolve({ outcome: choice, platform: "web" });
    window.dispatchEvent(e);
  }, outcome);
}

/**
 * 하이드레이션이 끝나기 전에 이벤트를 쏘면 리스너가 아직 없어 조용히 사라진다.
 * 이걸 안 기다려서 한 번 통째로 타임아웃 났었다 — 컴포넌트 잘못이 아니라 순서 문제였다.
 */
async function open(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(1200);
}

/** 진행 중인 유한 애니메이션이 끝난 뒤에 좌표를 읽는다 */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const running = document.getAnimations().filter((a) => {
      const t = a.effect?.getTiming();
      return t ? t.iterations !== Infinity : false;
    });
    await Promise.all(running.map((a) => a.finished.catch(() => undefined)));
  });
}

test.use({ viewport: { width: 390, height: 844 } });

test("설치 프롬프트: 브라우저 신호가 없으면 아무것도 렌더하지 않는다", async ({ page }) => {
  await open(page, "/");
  await expect(page.locator(BANNER)).toHaveCount(0);
});

test("설치 프롬프트: 이벤트 수신 시 노출 · 기본 인포바 차단 · 탭바 위 배치", async ({ page }) => {
  await open(page, "/");
  await expect(page.locator(TABBAR)).toBeVisible();
  await fireInstallPrompt(page);
  await expect(page.locator(BANNER)).toBeVisible({ timeout: 5000 });
  await settle(page);

  /* preventDefault 를 안 하면 브라우저 기본 미니 인포바와 우리 배너가 같이 뜬다 */
  expect(await page.evaluate(() => (window as unknown as { __prevented?: boolean }).__prevented)).toBe(
    true,
  );

  const geom = await page.evaluate(
    ([bannerSel, tabbarSel]) => {
      const b = document.querySelector(bannerSel)!.getBoundingClientRect();
      const t = document.querySelector(tabbarSel)!.getBoundingClientRect();
      return {
        left: b.left,
        right: b.right,
        bottom: b.bottom,
        top: b.top,
        tabTop: t.top,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    },
    [BANNER, TABBAR] as const,
  );

  /* 세로: 탭바를 가리지 않는다 (겹치면 둘 다 못 쓴다) */
  expect(geom.bottom, "배너가 하단 탭바를 덮고 있습니다").toBeLessThanOrEqual(geom.tabTop);
  expect(geom.tabTop - geom.bottom).toBeGreaterThanOrEqual(8);
  expect(geom.top).toBeGreaterThan(0);

  /* 가로: 중앙 정렬.
     이 검사는 실제 회귀에서 나왔다 — 배너에 `.rise-in` 을 붙였더니 keyframes 의
     transform(fill-mode: both)이 Tailwind 의 -translate-x-1/2 을 끝까지 덮어써서
     배너 왼쪽 끝이 화면 정중앙에 박혔다. 세로 겹침(18px)과 한 몸의 버그였다. */
  expect(
    Math.abs(geom.left - (geom.vw - geom.right)),
    "배너가 가로 중앙에 있지 않습니다 — transform 을 쓰는 애니메이션 클래스가 붙지 않았는지 확인하세요",
  ).toBeLessThanOrEqual(1);
  expect(geom.left).toBeGreaterThan(0);

  /* 터치 타깃 — 두 버튼 모두 44px 이상 */
  const heights = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} button`)].map((b) => b.getBoundingClientRect().height),
    BANNER,
  );
  expect(heights).toHaveLength(2);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);

  /* 배너가 떠 있는 상태에서의 접근성 — a11y 스위트는 이 상태를 절대 못 본다 */
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .include(BANNER)
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    blocking,
    blocking.length === 0
      ? ""
      : `\n설치 배너 접근성 위반:\n${blocking.map((v) => `  [${v.impact}] ${v.id}: ${v.help}`).join("\n")}\n`,
  ).toEqual([]);
});

test("설치 프롬프트: 추가하기 → prompt() 호출 · 배너 종료 · 재노출 차단 기록 없음", async ({
  page,
}) => {
  await open(page, "/");
  await fireInstallPrompt(page, "accepted");
  await expect(page.locator(BANNER)).toBeVisible();

  await page.getByRole("button", { name: "추가하기" }).click();
  await expect(page.locator(BANNER)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(
    true,
  );

  /* 설치를 수락한 사람에게 "30일간 숨김" 을 기록할 이유가 없다 —
     설치가 끝나면 standalone 판정으로 어차피 안 뜬다 */
  expect(await page.evaluate((k) => localStorage.getItem(k), DISMISS_KEY)).toBeNull();
});

test("설치 프롬프트: 브라우저 다이얼로그에서 취소하면 닫기와 같이 취급한다", async ({ page }) => {
  await open(page, "/");
  await fireInstallPrompt(page, "dismissed");
  await expect(page.locator(BANNER)).toBeVisible();

  await page.getByRole("button", { name: "추가하기" }).click();
  await expect(page.locator(BANNER)).toHaveCount(0);
  await expect
    .poll(async () => page.evaluate((k) => localStorage.getItem(k), DISMISS_KEY))
    .not.toBeNull();
});

test("설치 프롬프트: 나중에 → 30일간 재노출 안 함, 만료되면 다시 노출", async ({ page }) => {
  await open(page, "/");
  await fireInstallPrompt(page);
  await expect(page.locator(BANNER)).toBeVisible();

  await page.getByRole("button", { name: "나중에" }).click();
  await expect(page.locator(BANNER)).toHaveCount(0);

  /* 이벤트는 페이지를 열 때마다 다시 온다. 기억하지 않으면 닫아도 매번 뜬다. */
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(1200);
  await fireInstallPrompt(page);
  await page.waitForTimeout(600);
  await expect(page.locator(BANNER)).toHaveCount(0);

  await page.evaluate(
    ([k, ms]) => localStorage.setItem(k as string, String(Date.now() - (ms as number))),
    [DISMISS_KEY, 31 * 24 * 60 * 60 * 1000] as const,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(1200);
  await fireInstallPrompt(page);
  await expect(page.locator(BANNER)).toBeVisible({ timeout: 5000 });
});

test("설치 프롬프트: 이미 앱으로 실행 중이면(standalone) 노출하지 않는다", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = ((q: string) =>
      q.includes("display-mode: standalone")
        ? {
            matches: true,
            media: q,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent: () => false,
          }
        : original(q)) as typeof window.matchMedia;
  });
  await open(page, "/");
  await fireInstallPrompt(page);
  await page.waitForTimeout(600);
  await expect(page.locator(BANNER)).toHaveCount(0);
});

test("설치 프롬프트: 탭바가 없는 화면에서도 뷰포트 안에 배치된다", async ({ page }) => {
  /* 탭바는 PageShell 을 쓰는 화면에만 있다. /login 에는 없다 —
     탭바 높이를 상수로 박았다면 여기서 허공에 뜬다. */
  await open(page, "/login");
  await fireInstallPrompt(page);
  await expect(page.locator(BANNER)).toBeVisible({ timeout: 5000 });
  await settle(page);

  const g = await page.evaluate((sel) => {
    const b = document.querySelector(sel)!.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, vh: window.innerHeight };
  }, BANNER);
  expect(g.top).toBeGreaterThan(0);
  expect(g.bottom).toBeLessThanOrEqual(g.vh);
  expect(g.vh - g.bottom).toBeLessThanOrEqual(32);
});
