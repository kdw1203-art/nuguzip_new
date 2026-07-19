import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 스모크 테스트 설정 (#92)
 * - 대상 서버: E2E_BASE_URL (기본 http://localhost:3345 — `next start -p 3345`)
 * - 로컬: PLAYWRIGHT_BROWSERS_PATH 의 사전 설치 크로미움 사용
 * - CI: .github/workflows/e2e.yml 에서 `playwright install --with-deps chromium` 후 실행
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: 1,
  reporter: "line",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3345",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
