/** Figma Make / figma.site 공통 브랜드 토큰 — Tailwind arbitrary 값 대신 참조 */

export const FIGMA_COLORS = {
  primary: "#3182F6",
  primaryHover: "#1B64DA",
  primarySoft: "#E8F3FF",
  // 토스 단색 블루로 통일 (보라/인디고 그라데이션 제거)
  gradientFrom: "#3182F6",
  gradientTo: "#1B64DA",
  /** AiInspectionHomeCard dense variant */
  gradientFromAlt: "#3182F6",
  gradientToAlt: "#1B64DA",
  text: "#191F28",
  textSecondary: "#4E5968",
  textMuted: "#8B95A1",
  border: "#E5E8EB",
  surface: "#F9FAFB",
  surfacePage: "#f2f4f6",
  aiViolet: "#3182F6",
  aiHeroFrom: "#3182F6",
  aiHeroVia: "#3182F6",
  aiHeroTo: "#1B64DA",
} as const;

export const FIGMA_RADIUS = {
  card: "1rem", // rounded-2xl
  button: "0.75rem", // rounded-xl
  pill: "9999px",
} as const;

/** globals.css `--text-*` 와 동기화 */
export const FIGMA_TYPO = {
  titleLg: "var(--text-title-lg)",
  title: "var(--text-title)",
  body: "var(--text-body)",
  caption: "var(--text-caption)",
  button: "var(--text-button)",
} as const;

export const FIGMA_GRADIENTS = {
  brand: `linear-gradient(to right, ${FIGMA_COLORS.gradientFrom}, ${FIGMA_COLORS.gradientTo})`,
  brandBr: `linear-gradient(to bottom right, ${FIGMA_COLORS.gradientFromAlt}, ${FIGMA_COLORS.gradientToAlt})`,
  aiHub: `linear-gradient(to bottom right, ${FIGMA_COLORS.aiHeroFrom}, ${FIGMA_COLORS.aiHeroVia}, ${FIGMA_COLORS.aiHeroTo})`,
} as const;
