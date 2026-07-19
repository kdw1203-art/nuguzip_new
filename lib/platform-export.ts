/**
 * `Real Estate Community Platform` Vite 번들(다운로드) 메타.
 * 상세 가이드·ADMIN·Supabase 스토리지 등 원문은 `platform-src/*.md` 에 있습니다
 * (TypeScript 제외 대상 — 참고·검색용).
 * Builder.io 상수는 `lib/builder-config.ts` 를 사용하세요.
 */
export const FIGMA_DESIGN_FILE_URL =
  "https://www.figma.com/design/YibcTBJRzz3p15Zx9ldAYc/Real-Estate-Community-Platform";

export const PLATFORM_EXPORT_NAME = "Real Estate Community Platform";

/** Vite `vercel.json` 의 `@supabase_url` 등 — Vercel에서는 동일 이름으로 환경변수 연결 */
export const VERCEL_ENV_HINTS = {
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabaseAnon: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  builderPublicKey: "NEXT_PUBLIC_BUILDER_PUBLIC_API_KEY",
} as const;

/**
 * 다운로드 Vite `src` 미러(참고 전용). `tsconfig` 에서 제외 — Next 번들에 import 하지 않습니다.
 * 동기화: `npm run sync:platform -- "<...>/Real Estate Community Platform (1)/src"`
 * (`scripts/sync-platform-src.mjs` 의 SUBDIRS 와 동일 목록)
 */
export const PLATFORM_SRC = {
  root: "platform-src",
  assets: "platform-src/assets",
  components: "platform-src/components",
  contexts: "platform-src/contexts",
  data: "platform-src/data",
  docs: "platform-src/docs",
  guidelines: "platform-src/guidelines/Guidelines.md",
  hooks: "platform-src/hooks",
  lib: "platform-src/lib",
  pages: "platform-src/pages",
  pagesAdmin: "platform-src/pages/admin",
  pagesCalculator: "platform-src/pages/calculator",
  pagesDesktop: "platform-src/pages/desktop",
  pagesMobile: "platform-src/pages/mobile",
  public: "platform-src/public",
  scripts: "platform-src/scripts",
  nestedSrc: "platform-src/src",
  styles: "platform-src/styles",
  supabase: "platform-src/supabase",
  types: "platform-src/types",
  utils: "platform-src/utils",
} as const;
