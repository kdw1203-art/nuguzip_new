/**
 * 임장노트 카드 색상 테마 — "나만의 카드" 색상 10종. **순수 데이터(테스트 가능).**
 *
 * 카드 렌더(app/api/og/note-card)와 빌더 미리보기(HTML)가 같은 이 팔레트를 읽는다
 * — 색을 두 곳에 적으면 언젠가 갈라진다. satori(next/og)는 CSS 변수·oklch 를
 * 못 읽으므로 전부 명시 hex/그라데이션 문자열로 둔다.
 *
 * 각 테마는 어두운 표지(dark:true)와 밝은 표지 두 계열로 섞어 10종을 채운다.
 * 숫자 강조(accent)는 배경 대비가 확실한 색으로 고른다(사실 우선: 값이 안 읽히면
 * 카드가 아니라 장식이다).
 */

export type CardTheme = {
  id: string;
  label: string;
  /** 표지 배경(그라데이션 또는 단색 CSS 문자열) */
  bg: string;
  /** 본문 주요 텍스트 색 */
  ink: string;
  /** 보조 텍스트 색 */
  sub: string;
  /** 숫자·강조 색 */
  accent: string;
  /** 칩·배지 배경 */
  chipBg: string;
  /** 칩·배지 텍스트 */
  chipInk: string;
  /** 카드 안 패널(점수바·통계 상자) 배경 */
  panel: string;
  /** 어두운 계열 여부 — 미리보기 스와치 테두리 판정용 */
  dark: boolean;
};

export const CARD_THEMES: readonly CardTheme[] = [
  {
    id: "forest",
    label: "포레스트",
    bg: "linear-gradient(160deg, #0f2b22 0%, #16352a 100%)",
    ink: "#eaf5ef",
    sub: "#9fc4b4",
    accent: "#4ade80",
    chipBg: "rgba(74,222,128,0.16)",
    chipInk: "#a7f3c8",
    panel: "rgba(255,255,255,0.06)",
    dark: true,
  },
  {
    id: "midnight",
    label: "미드나잇",
    bg: "linear-gradient(160deg, #0b1224 0%, #14213f 100%)",
    ink: "#e8eefc",
    sub: "#9db0d6",
    accent: "#6aa1ff",
    chipBg: "rgba(106,161,255,0.16)",
    chipInk: "#b8cffb",
    panel: "rgba(255,255,255,0.06)",
    dark: true,
  },
  {
    id: "slate",
    label: "슬레이트",
    bg: "linear-gradient(160deg, #1a1d23 0%, #262b33 100%)",
    ink: "#f1f3f6",
    sub: "#a9b1bd",
    accent: "#e2b23c",
    chipBg: "rgba(226,178,60,0.16)",
    chipInk: "#f2d488",
    panel: "rgba(255,255,255,0.06)",
    dark: true,
  },
  {
    id: "plum",
    label: "플럼",
    bg: "linear-gradient(160deg, #241333 0%, #35204a 100%)",
    ink: "#f2e9fb",
    sub: "#c3a9dd",
    accent: "#c084fc",
    chipBg: "rgba(192,132,252,0.18)",
    chipInk: "#e0c8fb",
    panel: "rgba(255,255,255,0.06)",
    dark: true,
  },
  {
    id: "ocean",
    label: "오션",
    bg: "linear-gradient(160deg, #0b2540 0%, #0f3b5f 100%)",
    ink: "#e6f3fb",
    sub: "#9bc2dd",
    accent: "#38bdf8",
    chipBg: "rgba(56,189,248,0.16)",
    chipInk: "#b6e3fb",
    panel: "rgba(255,255,255,0.06)",
    dark: true,
  },
  {
    id: "ember",
    label: "엠버",
    bg: "linear-gradient(160deg, #2a160f 0%, #40211a 100%)",
    ink: "#fdeee7",
    sub: "#dcae9c",
    accent: "#fb923c",
    chipBg: "rgba(251,146,60,0.18)",
    chipInk: "#fcd0ac",
    panel: "rgba(255,255,255,0.06)",
    dark: true,
  },
  {
    id: "paper",
    label: "페이퍼",
    bg: "linear-gradient(160deg, #ffffff 0%, #eef2f8 100%)",
    ink: "#111827",
    sub: "#6b7280",
    accent: "#1d4fd8",
    chipBg: "#eef3ff",
    chipInk: "#1d4fd8",
    panel: "rgba(17,24,39,0.04)",
    dark: false,
  },
  {
    id: "sand",
    label: "샌드",
    bg: "linear-gradient(160deg, #faf6ee 0%, #efe6d5 100%)",
    ink: "#3d3427",
    sub: "#8a7c63",
    accent: "#b4791f",
    chipBg: "rgba(180,121,31,0.12)",
    chipInk: "#8a5e12",
    panel: "rgba(61,52,39,0.05)",
    dark: false,
  },
  {
    id: "mint",
    label: "민트",
    bg: "linear-gradient(160deg, #f0fbf6 0%, #dcf3e8 100%)",
    ink: "#123528",
    sub: "#5b8a76",
    accent: "#0a7d40",
    chipBg: "rgba(10,125,64,0.10)",
    chipInk: "#0a7d40",
    panel: "rgba(18,53,40,0.05)",
    dark: false,
  },
  {
    id: "rose",
    label: "로즈",
    bg: "linear-gradient(160deg, #fdf1f4 0%, #f9dde5 100%)",
    ink: "#3f1d28",
    sub: "#9c6b78",
    accent: "#d6336c",
    chipBg: "rgba(214,51,108,0.10)",
    chipInk: "#b02a58",
    panel: "rgba(63,29,40,0.05)",
    dark: false,
  },
] as const;

export const DEFAULT_THEME_ID = "forest";

export function getCardTheme(id: string | null | undefined): CardTheme {
  return CARD_THEMES.find((t) => t.id === id) ?? CARD_THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
}

export function isValidThemeId(id: string): boolean {
  return CARD_THEMES.some((t) => t.id === id);
}
