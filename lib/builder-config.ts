/**
 * Vite export `platform-src/builder.config.ts` 와 동일한 상수.
 * Next에서는 `import.meta.env.VITE_*` 대신 `NEXT_PUBLIC_*` 를 사용합니다.
 * @see platform-src/BUILDER_IO_SETUP_GUIDE.md (참고용, 번들 미포함 경로)
 */

export const BUILDER_PUBLIC_API_KEY =
  process.env.NEXT_PUBLIC_BUILDER_PUBLIC_API_KEY ?? "";

export const BUILDER_MODELS = {
  page: "page",
  section: "section",
  component: "component",
  data: "data",
} as const;

export const EDITABLE_PAGES = [
  "home",
  "community",
  "experts",
  "inspection",
  "reports",
  "map",
  "my-page",
  "settings",
  "investment-tools",
  "news",
] as const;

export const BRAND_COLORS = {
  primary: {
    from: "#3182F6",
    to: "#1B64DA",
  },
  secondary: {
    light: "#EBF4FF",
    dark: "#0B4A99",
  },
} as const;
