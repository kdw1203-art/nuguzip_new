import { test, expect } from "@playwright/test";

/**
 * [H004 · 939] 쓰기 여정 — "노트가 실제로 저장·조회·삭제되는가".
 *
 * auth-journey(H003)가 일부러 비워 둔 구멍이다: E2E 대상 서버가 운영 DB 를
 * 보므로, 가드 없이 돌리면 CI 마다 실데이터에 테스트 노트가 쌓인다.
 * 그래서 이 스펙은 3중 가드 뒤에서만 돈다.
 *
 *   ① E2E_TEST_EMAIL / E2E_TEST_PASSWORD — 전용 테스트 계정 (실계정 금지)
 *   ② E2E_ALLOW_WRITES=1 — 쓰기 명시 허용 (기본 스킵)
 *   ③ 자가 청소 — 만든 노트를 같은 테스트 안에서 삭제하고, 삭제 확인까지가
 *      테스트의 일부다. 청소가 실패하면 테스트도 실패한다(흔적을 못 남긴다).
 *
 * 오염 최소화 설계: 노트는 **비공개**로 만든다 — 공개 피드·홈 재검증·공개
 * 적립(100P) 경로를 건드리지 않는다. 제목에 [E2E] 마커를 박아, 만에 하나
 * 청소가 실패해도 사람이 한눈에 골라낼 수 있게 한다.
 *
 * UI 폼 대신 세션 쿠키를 문 API 로 쓰는 이유: 작성 폼의 끝 버튼은
 * "기록 완료 → AI 정리 받기"라 저장이 곧 AI 실행이다 — 테스트마다 AI 쿼터를
 * 태우고 실패 축이 둘(저장·AI)로 늘어난다. 서버 쓰기 경로(인증·검증·DB)는
 * API 가 그대로 밟고, 화면 검증은 저장된 노트의 상세 페이지 렌더로 한다.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const ALLOW_WRITES = process.env.E2E_ALLOW_WRITES === "1";

test.describe("쓰기 여정 (가드: E2E_ALLOW_WRITES=1)", () => {
  test.skip(
    !EMAIL || !PASSWORD || !ALLOW_WRITES,
    "E2E_TEST_EMAIL/E2E_TEST_PASSWORD/E2E_ALLOW_WRITES 미설정 — 쓰기 여정 스킵",
  );

  test("로그인 → 비공개 노트 생성 → 상세 렌더 → 삭제 → 삭제 확인", async ({ page }) => {
    // 1) UI 로그인 — 세션 쿠키가 page.request 에도 같이 실린다
    await page.goto("/login");
    await page.locator("#login-email").fill(EMAIL!);
    await page.locator("#login-password").fill(PASSWORD!);
    await page.getByRole("button", { name: "이메일로 로그인" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });

    // 2) 생성 (비공개 · [E2E] 마커)
    const title = `[E2E] 쓰기 여정 자동검증 ${new Date().toISOString()}`;
    const created = await page.request.post("/api/inspection/notes", {
      data: {
        title,
        region: "서울 강남구",
        summary: "E2E 쓰기 여정 자동 생성 — 곧 같은 테스트가 삭제합니다.",
        isPublic: false,
      },
    });
    expect(created.ok(), `노트 생성 실패: ${created.status()}`).toBeTruthy();
    const noteId: string | undefined = (await created.json())?.note?.id;
    expect(noteId, "생성 응답에 note.id 가 없습니다").toBeTruthy();

    try {
      // 3) 상세 페이지가 실제로 렌더되는가 (소유자 세션이므로 비공개도 보인다)
      await page.goto(`/notes/${encodeURIComponent(noteId!)}`);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByText("[E2E] 쓰기 여정 자동검증", { exact: false }).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      // 4) 자가 청소 — 렌더 검증이 실패해도 반드시 지운다
      const deleted = await page.request.delete(
        `/api/inspection/notes/${encodeURIComponent(noteId!)}`,
      );
      expect(deleted.ok(), `노트 삭제 실패: ${deleted.status()} — 운영 DB 에 [E2E] 노트가 남았을 수 있습니다`).toBeTruthy();
    }

    // 5) 삭제 확인 — 같은 id 재삭제는 404 (존재하지 않음)
    const again = await page.request.delete(
      `/api/inspection/notes/${encodeURIComponent(noteId!)}`,
    );
    expect(again.status()).toBe(404);
  });
});
