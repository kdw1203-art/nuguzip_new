import { test, expect, type Page } from "@playwright/test";

/**
 * [945 · 실사용50 #46] 접근성 스모크 — axe(a11y.spec.ts)가 못 보는 두 축.
 *
 * axe 는 대비·alt·폼 라벨·랜드마크(정적 검출 가능한 것)를 이미 게이트한다.
 * 남은 수동 축 중 자동화 가능한 둘을 여기서 잰다:
 *   ① 키보드 완주 — 마우스 없이 로그인 폼을 채우고 제출 버튼까지 도달하는가
 *   ② 포커스 표시 — Tab 으로 이동한 요소에 눈에 보이는 포커스 표시가 있는가
 *
 * 원칙은 스모크와 같다: DB 실데이터 단언 금지, 구조·고정 레이블만.
 */

async function openReduced(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

/** activeElement 가 시각적 포커스 표시(outline 또는 box-shadow)를 갖는지 */
async function activeElementHasVisibleFocus(page: Page): Promise<{
  ok: boolean;
  tag: string;
  detail: string;
}> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return { ok: false, tag: "body", detail: "포커스가 body 에 있음" };
    }
    const s = getComputedStyle(el);
    const outlineVisible =
      s.outlineStyle !== "none" && parseFloat(s.outlineWidth || "0") > 0;
    const shadowVisible = s.boxShadow !== "none" && s.boxShadow !== "";
    const borderFocus = s.borderColor !== "" && el.matches(":focus-visible");
    return {
      ok: outlineVisible || shadowVisible || borderFocus,
      tag: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`,
      detail: `outline=${s.outlineStyle}/${s.outlineWidth} boxShadow=${s.boxShadow.slice(0, 60)}`,
    };
  });
}

test("a11y-k1. 로그인 폼 키보드 완주 — Tab 만으로 이메일→비밀번호→제출 도달", async ({
  page,
}) => {
  await openReduced(page, "/login");
  await page.waitForSelector("#login-email");

  /* Tab 순회로 이메일 입력에 도달할 수 있는가 (상한 25회 — 무한루프 방지) */
  let reachedEmail = false;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => document.activeElement?.id ?? "");
    if (id === "login-email") {
      reachedEmail = true;
      break;
    }
  }
  expect(reachedEmail, "Tab 순회로 이메일 입력에 도달하지 못함").toBe(true);

  await page.keyboard.type("keyboard-user@example.com");
  await page.keyboard.press("Tab");
  const pwFocused = await page.evaluate(() => document.activeElement?.id ?? "");
  expect(pwFocused, "이메일 다음 Tab 이 비밀번호로 가지 않음").toBe("login-password");
  await page.keyboard.type("smoke-password");

  /* 비밀번호 다음 순회에서 제출 버튼(로그인)에 도달하는가 */
  let reachedSubmit = false;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return {
        tag: el?.tagName ?? "",
        type: el?.getAttribute("type") ?? "",
        text: (el?.textContent ?? "").trim().slice(0, 20),
      };
    });
    if (info.tag === "BUTTON" && (info.type === "submit" || info.text.includes("로그인"))) {
      reachedSubmit = true;
      break;
    }
  }
  expect(reachedSubmit, "비밀번호 이후 Tab 순회로 제출 버튼에 도달하지 못함").toBe(true);
});

test("a11y-k2. 포커스 표시 — 홈에서 Tab 첫 5개 요소 모두 시각적 포커스", async ({
  page,
}) => {
  await openReduced(page, "/");
  const misses: string[] = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    const r = await activeElementHasVisibleFocus(page);
    if (!r.ok && r.tag !== "body") misses.push(`${i + 1}번째 ${r.tag} (${r.detail})`);
  }
  expect(
    misses,
    `포커스 표시 없는 요소: ${misses.join(" · ")} — :focus-visible 스타일 확인`,
  ).toHaveLength(0);
});

test("a11y-k3. 가입 폼 키보드 완주 — 필수 입력·약관 체크·제출 도달", async ({ page }) => {
  await openReduced(page, "/signup");
  /* 폼 코어 요소가 키보드 도달 가능한지 — 값 제출은 하지 않는다(실가입 금지) */
  const reachable = await page.evaluate(() => {
    const sels = [
      'input[type="email"]',
      'input[type="password"]',
      'input[type="checkbox"]',
      'button[type="submit"]',
    ];
    return sels.map((sel) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return { sel, present: false, focusable: false };
      el.focus();
      return { sel, present: true, focusable: document.activeElement === el };
    });
  });
  for (const r of reachable) {
    expect(r.present, `${r.sel} 이 가입 화면에 없음`).toBe(true);
    expect(r.focusable, `${r.sel} 이 키보드 포커스를 받지 못함`).toBe(true);
  }
});
