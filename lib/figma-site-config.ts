/** Vite README — Figma 디자인(Design 파일) */
export {
  FIGMA_DESIGN_FILE_URL,
  PLATFORM_EXPORT_NAME,
} from "@/lib/platform-export";

/**
 * Figma Make **편집기**(원본 프로젝트). Publish 시 생성되는 `*.figma.site` 와는 별개입니다.
 * @see https://www.figma.com/make/YibcTBJRzz3p15Zx9ldAYc/Real-Estate-Community-Platform
 */
export const FIGMA_MAKE_EDITOR_URL =
  process.env.NEXT_PUBLIC_FIGMA_MAKE_EDITOR_URL?.trim() ||
  "https://www.figma.com/make/YibcTBJRzz3p15Zx9ldAYc/Real-Estate-Community-Platform";

/** Figma Make **공개 미리보기** (`Publish to web`). 편집기와 URL이 다를 수 있습니다. */
export const FIGMA_SITE_URL =
  process.env.NEXT_PUBLIC_FIGMA_SITE_URL?.trim() ||
  "https://dill-chroma-95138681.figma.site";
