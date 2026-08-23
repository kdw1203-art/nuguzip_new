import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Result as AxeViolation } from "axe-core";

/**
 * G4 — 접근성 자동 검사 (axe-core / WCAG 2.1 A·AA)
 *
 * 게이트 기준: impact 가 serious·critical 인 위반이 하나라도 있으면 실패.
 * minor·moderate 는 리포트만 하고 통과시킨다 — 전부 막으면 게이트가 상시 빨간불이
 * 되고, 상시 빨간불인 게이트는 아무도 안 본다. 심각한 것부터 못 들어오게 막고
 * 나머지는 눈에 보이게 남긴다.
 *
 * axe 로 잡히는 건 자동 검출이 가능한 부분(대비·라벨·랜드마크·이름)뿐이다.
 * 키보드 순서, 스크린리더 낭독 순서, 포커스 트랩은 여전히 수동 확인 대상이다.
 * 이 스위트가 초록이라고 "접근성 됐다"는 뜻이 아니다.
 */

/**
 * 모션을 끄고 검사한다 — 스타일 취향이 아니라 측정 정확도 문제다.
 *
 * 이 사이트는 진입 요소에 `.rise-in-*` 스태거 애니메이션(opacity 0→1)을 건다.
 * 애니메이션 도중에 axe 가 색을 읽으면 배경과 섞인 중간색이 잡힌다. 실제로
 * `--text-3` 를 #656f7c(흰 배경 5.10:1)로 고친 뒤에도 /login 이 한 번 실패했는데,
 * 잡힌 색은 #757e8a on #fefeff (4.07:1) — 코드 어디에도 없는 색이다.
 * 페이드 30% 지점의 합성색이었다. 재시도하면 통과했다.
 *
 * 시간에 따라 결과가 바뀌는 게이트는 신뢰를 잃는다. 그래서 (1) reducedMotion 으로
 * 스태거 지연과 무한 반복(skeleton shimmer)을 없애고, (2) 그래도 남는 유한
 * 애니메이션은 끝날 때까지 기다린 뒤에 읽는다.
 *
 * 부수 효과로 이 스위트는 '모션 최소화' 설정 사용자가 보는 화면을 검사하게 된다.
 * 최종 정지 상태의 색은 두 경로가 같으므로 대비 판정에는 차이가 없다.
 *
 * emulateMedia 는 반드시 goto 앞에 둔다 — 첫 렌더부터 적용돼야 스태거가 안 걸린다.
 */
async function openWithoutMotion(page: import("@playwright/test").Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

/** 로그인 없이 볼 수 있고, 트래픽이 실제로 몰리는 화면들 */
const ROUTES: Array<{ path: string; name: string }> = [
  { path: "/", name: "홈" },
  { path: "/notes", name: "임장노트 목록" },
  { path: "/town", name: "동네이야기" },
  { path: "/search", name: "통합검색" },
  { path: "/subscription", name: "구독" },
  { path: "/login", name: "로그인" },
  { path: "/offline", name: "오프라인 폴백" },
  /* [#90] 4차에서 늘어난 표면 — 새 화면도 같은 게이트를 통과해야 한다 */
  { path: "/analysis/gap", name: "전세가율 스크리너" },
  { path: "/town/prompt/0", name: "글감 스레드" },
  { path: "/apply/calendar", name: "청약 캘린더" },
];

/**
 * 예외 — 고칠 수 없는 것과 안 고친 것을 구분해서 남긴다.
 *
 * 지금 등록된 예외는 하나뿐이다: 네이버 로그인 버튼(#03c75a 위 흰 글씨, 2.25:1).
 * 이건 네이버가 배포하는 로그인 버튼 규격 그대로다. 색을 우리 마음대로 바꾸면
 * 브랜드 가이드에 어긋나고, 이용자가 아는 그 버튼처럼 보이지 않게 된다.
 * (같은 자리의 카카오 버튼 #fee500 위 #191919 는 13.75:1, 구글 버튼도 통과다 —
 *  즉 우리 디자인 문제가 아니라 이 한 브랜드의 규격 문제다.)
 *
 * 예외는 규칙 이름이 아니라 **색 조합**으로 좁게 건다. `color-contrast` 를 통째로
 * 끄면 이 버튼을 핑계로 나머지 위반까지 같이 숨는다. 그리고 통과시키더라도
 * 조용히 넘기지 않고 콘솔에 "예외 적용" 으로 찍는다 — 없는 문제로 만들지 않는다.
 */
const EXEMPT_CONTRAST = [
  { fg: "#ffffff", bg: "#03c75a", why: "네이버 로그인 버튼 브랜드 규격" },
];

type ContrastData = { fgColor?: string; bgColor?: string };

function exemptReason(v: AxeViolation, node: AxeViolation["nodes"][number]): string | null {
  if (v.id !== "color-contrast") return null;
  const data = (node.any?.[0]?.data ?? {}) as ContrastData;
  const fg = String(data.fgColor ?? "").toLowerCase();
  const bg = String(data.bgColor ?? "").toLowerCase();
  return EXEMPT_CONTRAST.find((e) => e.fg === fg && e.bg === bg)?.why ?? null;
}

/**
 * 차단 대상만 골라낸다. 예외에 걸린 노드는 빼되, 뺐다는 사실은 로그로 남긴다.
 * 노드가 전부 예외면 그 위반 자체를 제외한다.
 */
function splitBlocking(violations: AxeViolation[], routeLabel: string): AxeViolation[] {
  const out: AxeViolation[] = [];
  for (const v of violations) {
    if (v.impact !== "serious" && v.impact !== "critical") continue;
    const kept = [];
    for (const n of v.nodes) {
      const why = exemptReason(v, n);
      if (why) console.log(`[a11y/예외] ${routeLabel} ${v.id} — ${why}`);
      else kept.push(n);
    }
    if (kept.length > 0) out.push({ ...v, nodes: kept });
  }
  return out;
}

/** 위반을 사람이 읽을 수 있게 — 어떤 규칙이 어느 요소에서 걸렸는지까지 */
function describe(violations: AxeViolation[]): string {
  return violations
    .map((v) => {
      const nodes = v.nodes ?? [];
      const where = nodes
        .slice(0, 3)
        .map((n) => (Array.isArray(n.target) ? n.target.join(" ") : String(n.target)))
        .join(" | ");
      return `  [${v.impact}] ${v.id}: ${v.help}\n    → ${where}${nodes.length > 3 ? ` (외 ${nodes.length - 3}개)` : ""}`;
    })
    .join("\n");
}

/**
 * 스타일시트가 실제로 적용됐는지 먼저 확인한다.
 *
 * 이 검사를 넣은 이유: 이 스위트를 처음 돌릴 때 전 라우트가 초록으로 나왔는데,
 * 알고 보니 이전 빌드의 `next start` 프로세스가 포트를 잡고 있어서 HTML 이
 * 가리키는 CSS 가 404 였다. 스타일이 하나도 없으면 모든 글자가 흰 배경 위
 * 검정이 되고, 대비 검사는 당연히 전부 통과한다. **색을 고쳐서 통과한 게 아니라
 * 색이 없어서 통과한 것**이었다.
 *
 * globals.css 가 로드되지 않으면 :root 의 커스텀 프로퍼티가 아예 정의되지 않아
 * 빈 문자열이 된다. 그 한 가지만 보면 "CSS 가 붙었는가" 를 확실히 가를 수 있다.
 * 특정 색값을 박지 않는 이유는 토큰을 조정할 때마다 테스트가 깨지지 않게 하려고.
 *
 * 한 번만 읽지 않고 폴링하는 이유: `openWithoutMotion` 은 `domcontentloaded` 에서
 * 멈추는데, App Router 의 스타일시트는 React 가 삽입하므로 그 시점에 아직
 * 적용되지 않았을 수 있다. 실제로 갓 기동한 `next start` 에 8워커가 동시에
 * 붙으면 첫 라운드에서만 /, /notes, 모바일 홈 3건이 이 단언에서 떨어지고
 * 두 번째 실행부터는 57건 전부 통과했다. 서버가 진짜로 낡아서 CSS 가 404 면
 * 폴링해도 끝내 빈 문자열이라 원래 잡으려던 사고는 그대로 잡힌다 —
 * 없앤 것은 검사 능력이 아니라 시간에 따라 결과가 바뀌던 부분이다.
 */
async function assertStylesLoaded(page: import("@playwright/test").Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--text-3").trim(),
        ),
      {
        timeout: 10_000,
        message:
          "globals.css 가 적용되지 않았습니다 — 스타일 없는 페이지는 대비 검사를 무조건 통과하므로 결과가 무의미합니다. " +
          "이전 빌드의 next start 가 포트를 잡고 있지 않은지 확인하세요.",
      },
    )
    .not.toBe("");
}

/**
 * 진행 중인 유한 애니메이션이 모두 끝날 때까지 기다린다.
 * 무한 반복(iterations: Infinity)은 영원히 안 끝나므로 제외한다 — reducedMotion
 * 에서 대부분 꺼지지만, 새로 추가되는 무한 애니메이션에 여기서 매달리지 않도록.
 *
 * **한 번만 기다리면 부족하다** — 실제로 겪은 실패 사례:
 * 모바일 홈(390×844)에서 `color-contrast` 가 간헐적으로 잡혔는데, 걸린 색이
 * `#767f8b on #fefeff (4.02:1)` 로 코드 어디에도 없는 값이었다. 계산해 보면
 * `--text-3`(#606a77)를 흰 배경에 **불투명도 0.86** 으로 얹은 합성색이다.
 * 범인은 `[data-reveal]` — 이건 진입 시 한꺼번에 도는 `.rise-in-*` 스태거와
 * 달리 IntersectionObserver 가 뷰포트에 들어오는 **순간에** 켠다. 접힘선에
 * 걸친 요소는 첫 정산이 끝난 **뒤에** 애니메이션을 시작하므로, 예전 구현처럼
 * 그 시점의 목록만 기다리면 그 요소는 페이드 도중에 측정된다.
 * (reduce 모드에서도 `animation: fadeIn 150ms` 로 짧아질 뿐 사라지지 않는다.)
 *
 * 그래서 "지금 도는 것들을 기다린다"를 **0이 될 때까지 반복**한다. 대비 기준은
 * 정지 상태의 색에 대한 것이므로, 이렇게 기다려도 검사 능력은 줄지 않는다 —
 * 줄어드는 건 시간에 따라 답이 바뀌던 부분뿐이다.
 */
async function settleAnimations(page: import("@playwright/test").Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const runningFinite = () =>
            document.getAnimations().filter((a) => {
              const timing = a.effect?.getTiming();
              if (!timing || timing.iterations === Infinity) return false;
              return a.playState === "running" || a.playState === "paused";
            });
          await Promise.all(runningFinite().map((a) => a.finished.catch(() => undefined)));
          /* 기다리는 사이에 새로 시작된 것이 있으면 0이 아니다 → 폴링이 한 번 더 돈다 */
          return runningFinite().length;
        }),
      {
        timeout: 10_000,
        message:
          "애니메이션이 멎지 않아 색을 정지 상태로 읽을 수 없습니다 — " +
          "무한 반복 애니메이션이 새로 추가됐는지 확인하세요.",
      },
    )
    .toBe(0);
}

async function scan(page: import("@playwright/test").Page) {
  await settleAnimations(page);
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
}

for (const route of ROUTES) {
  test(`a11y: ${route.name} (${route.path}) — serious/critical 위반 없음`, async ({ page }) => {
    await openWithoutMotion(page, route.path);
    await expect(page.locator("main, body").first()).toBeVisible({ timeout: 15000 });
    await assertStylesLoaded(page);

    const results = await scan(page);
    const blocking = splitBlocking(results.violations, route.path);
    const minor = results.violations.filter(
      (v) => v.impact !== "serious" && v.impact !== "critical",
    );

    if (minor.length > 0) {
      console.log(`\n[a11y/참고] ${route.path} — 경미한 위반 ${minor.length}건\n${describe(minor)}`);
    }

    expect(
      blocking,
      blocking.length === 0
        ? ""
        : `\n${route.path} 접근성 위반 ${blocking.length}건:\n${describe(blocking)}\n`,
    ).toEqual([]);
  });
}

test("a11y: 모바일 홈 (390x844) — 하단 탭바 포함 serious/critical 위반 없음", async ({ page }) => {
  /* 하단 탭바는 md:hidden 이라 데스크톱 검사에선 아예 렌더되지 않는다.
     모바일 뷰포트로 한 번 더 봐야 탭바가 검사 대상에 들어온다. */
  await page.setViewportSize({ width: 390, height: 844 });
  /* 모바일6 — 쿠키 결정 전에는 탭바가 접힌다. 이 검사의 대상은 탭바이므로
     동의를 결정된 상태로 시작한다(install-prompt 스위트와 같은 방식). */
  await page.addInitScript(() => {
    localStorage.setItem(
      "nz_cookie_consent",
      JSON.stringify({ analytics: false, decidedAt: new Date().toISOString() }),
    );
  });
  await openWithoutMotion(page, "/");
  await expect(page.getByRole("navigation", { name: "하단 내비게이션" })).toBeVisible({
    timeout: 15000,
  });
  await assertStylesLoaded(page);

  const results = await scan(page);
  const blocking = splitBlocking(results.violations, "/ @390");

  expect(
    blocking,
    blocking.length === 0 ? "" : `\n모바일 홈 접근성 위반:\n${describe(blocking)}\n`,
  ).toEqual([]);
});
