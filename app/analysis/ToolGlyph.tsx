/**
 * 분석 도구 글리프 (958) — 카드·워크벤치 머리에 쓰는 48px 선형 일러스트.
 *
 * 왜 이모지·사진이 아니라 SVG 인가: 도구는 "무엇을 계산하는가"가 정체성이라
 * 결과물의 **모양**(레이더·추세선·동선·게이지…)을 그대로 그린다. 숫자는 넣지
 * 않는다 — 장식 도형에 숫자가 들어가면 데이터처럼 읽힌다(정직 원칙).
 * 선은 currentColor(계열 색), 신호 한 점만 주홍(--brand-red) — 브랜드 규칙
 * "신호 = 주홍" 그대로. 어두운 면에서는 --brand-red-on-dark 로 자동 전환되도록
 * CSS 변수를 쓴다.
 */
import type { ReactNode } from "react";

export type ToolGlyphId =
  | "radar"
  | "forecast"
  | "route"
  | "signal"
  | "shield"
  | "scale"
  | "checklist"
  | "donut"
  | "calculator"
  | "gap"
  | "indicators"
  | "clause"
  | "bars"
  | "trend"
  | "thermo"
  | "ranking"
  | "notebook"
  | "table"
  | "rate"
  | "agent"
  | "cycle"
  | "switch";

const RED = "var(--glyph-accent, var(--brand-red))";

const GLYPHS: Record<ToolGlyphId, ReactNode> = {
  radar: (
    <>
      <polygon points="24,6 40,16 36,36 12,36 8,16" />
      <polygon points="24,14 33,19 31,31 17,31 15,19" strokeOpacity=".45" />
      <polygon points="24,11 36,17 33,33 15,33 12,19" fill={RED} fillOpacity=".18" stroke={RED} />
      <circle cx="24" cy="24" r="1.6" fill={RED} stroke="none" />
    </>
  ),
  forecast: (
    <>
      <path d="M6 38h36" strokeOpacity=".4" />
      <path d="M8 32c5-2 8-8 12-10s7 2 10-2 5-8 12-10" />
      <path d="M30 20c4 0 7 4 12 8" stroke={RED} strokeDasharray="3 3" />
      <circle cx="30" cy="20" r="2.2" fill={RED} stroke="none" />
    </>
  ),
  route: (
    <>
      <circle cx="11" cy="36" r="4" />
      <circle cx="37" cy="12" r="4" />
      <path d="M14 33c6-6 3-14 10-16s8 4 10-2" />
      <circle cx="24" cy="18" r="2.2" fill={RED} stroke="none" />
      <path d="M37 12v-2M37 16v2M33 12h-2M41 12h2" strokeOpacity=".4" />
    </>
  ),
  signal: (
    <>
      <circle cx="24" cy="26" r="15" />
      <path d="M24 26V14" />
      <path d="M24 26l8 5" stroke={RED} />
      <circle cx="24" cy="26" r="1.8" fill={RED} stroke="none" />
      <path d="M11 26h3M34 26h3" strokeOpacity=".4" />
    </>
  ),
  shield: (
    <>
      <path d="M24 6l14 5v12c0 9-6 15-14 19C16 38 10 32 10 23V11z" />
      <path d="M17 24l5 5 9-11" stroke={RED} />
    </>
  ),
  scale: (
    <>
      <path d="M24 8v32M12 40h24" />
      <path d="M24 12l-12 4M24 12l12 4" />
      <path d="M6 26l6-10 6 10a6 4 0 0 1-12 0zM30 26l6-10 6 10a6 4 0 0 1-12 0z" />
      <circle cx="36" cy="18" r="1.8" fill={RED} stroke="none" />
    </>
  ),
  checklist: (
    <>
      <rect x="9" y="7" width="30" height="34" rx="4" />
      <path d="M15 17h6M15 25h6M15 33h6" />
      <path d="M25 17h9M25 25h9M25 33h9" strokeOpacity=".45" />
      <path d="M14 15l2 2 3-4" stroke={RED} />
    </>
  ),
  donut: (
    <>
      <circle cx="24" cy="24" r="15" strokeOpacity=".35" />
      <path d="M24 9a15 15 0 0 1 14.5 11" />
      <path d="M38.5 20A15 15 0 0 1 30 37" stroke={RED} />
      <circle cx="24" cy="24" r="6" strokeOpacity=".45" />
    </>
  ),
  calculator: (
    <>
      <rect x="11" y="6" width="26" height="36" rx="4" />
      <rect x="16" y="11" width="16" height="7" rx="1.5" />
      <path d="M17 25h3M23 25h3M29 25h3M17 32h3M23 32h3" />
      <path d="M29 32h3" stroke={RED} />
    </>
  ),
  gap: (
    <>
      <path d="M8 38V16M8 38h32" strokeOpacity=".4" />
      <rect x="14" y="14" width="8" height="24" rx="1.5" />
      <rect x="28" y="22" width="8" height="16" rx="1.5" />
      <path d="M22 18h6" stroke={RED} strokeDasharray="2 2" />
      <path d="M25 14v10" stroke={RED} />
    </>
  ),
  indicators: (
    <>
      <rect x="6" y="10" width="17" height="10" rx="3" />
      <rect x="25" y="10" width="17" height="10" rx="3" />
      <rect x="6" y="28" width="17" height="10" rx="3" />
      <rect x="25" y="28" width="17" height="10" rx="3" stroke={RED} />
      <circle cx="33.5" cy="33" r="1.8" fill={RED} stroke="none" />
    </>
  ),
  clause: (
    <>
      <path d="M12 6h16l8 8v28H12z" />
      <path d="M28 6v8h8" />
      <path d="M17 22h14M17 28h14M17 34h8" strokeOpacity=".5" />
      <circle cx="33" cy="33" r="5" stroke={RED} />
      <path d="M37 37l4 4" stroke={RED} />
    </>
  ),
  bars: (
    <>
      <path d="M8 40h32" strokeOpacity=".4" />
      <rect x="11" y="24" width="6" height="16" rx="1.5" />
      <rect x="21" y="14" width="6" height="26" rx="1.5" />
      <rect x="31" y="20" width="6" height="20" rx="1.5" />
      <path d="M8 18c8-2 16-8 32-6" stroke={RED} strokeDasharray="3 3" />
    </>
  ),
  trend: (
    <>
      <path d="M6 40h36" strokeOpacity=".4" />
      <path d="M8 34l8-6 7 4 8-12 11 2" />
      <circle cx="31" cy="20" r="2.2" fill={RED} stroke="none" />
      <path d="M8 22h4M8 14h4" strokeOpacity=".3" />
    </>
  ),
  thermo: (
    <>
      <rect x="19" y="6" width="10" height="26" rx="5" />
      <circle cx="24" cy="36" r="6" />
      <path d="M24 30V18" stroke={RED} strokeWidth="3" />
      <circle cx="24" cy="36" r="2.5" fill={RED} stroke="none" />
      <path d="M33 12h4M33 18h4M33 24h4" strokeOpacity=".4" />
    </>
  ),
  ranking: (
    <>
      <rect x="8" y="9" width="32" height="8" rx="2" stroke={RED} />
      <rect x="8" y="20" width="24" height="8" rx="2" />
      <rect x="8" y="31" width="16" height="8" rx="2" strokeOpacity=".6" />
      <circle cx="13" cy="13" r="1.6" fill={RED} stroke="none" />
    </>
  ),
  notebook: (
    <>
      <rect x="11" y="6" width="26" height="36" rx="3" />
      <path d="M11 14h26" strokeOpacity=".4" />
      <path d="M17 22h14M17 28h10" />
      <path d="M17 34h6" stroke={RED} />
      <path d="M8 12h3M8 20h3M8 28h3M8 36h3" strokeOpacity=".5" />
    </>
  ),
  table: (
    <>
      <rect x="7" y="9" width="34" height="30" rx="3" />
      <path d="M7 19h34M7 29h34M19 9v30M30 9v30" strokeOpacity=".45" />
      <rect x="19" y="19" width="11" height="10" fill={RED} fillOpacity=".18" stroke="none" />
    </>
  ),
  rate: (
    <>
      <path d="M8 40V10" strokeOpacity=".4" />
      <path d="M8 40h32" strokeOpacity=".4" />
      <path d="M10 22h8l4-8 4 14 4-9 4 6h6" />
      <path d="M12 12a3 3 0 1 0 0 .01M30 30a3 3 0 1 0 0 .01" strokeOpacity=".5" />
      <path d="M14 28l14-14" stroke={RED} strokeOpacity=".8" />
    </>
  ),
  agent: (
    <>
      <rect x="9" y="14" width="30" height="22" rx="6" />
      <path d="M24 6v8M17 6h14" />
      <circle cx="18" cy="25" r="2" fill="currentColor" stroke="none" />
      <circle cx="30" cy="25" r="2" fill={RED} stroke="none" />
      <path d="M18 31h12" strokeOpacity=".6" />
      <path d="M9 22H5M39 22h4" strokeOpacity=".4" />
    </>
  ),
  cycle: (
    <>
      <circle cx="24" cy="24" r="15" strokeOpacity=".35" />
      <path d="M24 9a15 15 0 0 1 15 15" />
      <path d="M39 24a15 15 0 0 1-15 15" stroke={RED} />
      <path d="M36 21l3 3 3-3" stroke={RED} />
      <path d="M12 27l-3-3-3 3" />
    </>
  ),
  switch: (
    <>
      <rect x="6" y="12" width="14" height="12" rx="2" />
      <rect x="28" y="24" width="14" height="12" rx="2" stroke={RED} />
      <path d="M20 18h6a4 4 0 0 1 4 4v2" />
      <path d="M27 21l3 3 3-3" stroke={RED} />
    </>
  ),
};

export function ToolGlyph({
  id,
  size = 48,
  className = "",
  title,
}: {
  id: ToolGlyphId;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {GLYPHS[id]}
    </svg>
  );
}

/** 워크벤치 12종 → 글리프 */
export const WORKBENCH_GLYPH: Record<string, ToolGlyphId> = {
  "ai-diagnosis": "radar",
  "ai-prediction": "forecast",
  "ai-inspection": "route",
  "ai-timing": "signal",
  "ai-risk": "shield",
  "ai-compare": "scale",
  "my-checklist": "checklist",
  "ai-portfolio": "donut",
  "ai-simulator": "calculator",
  "ai-gap": "gap",
  "ai-economy": "indicators",
  "contract-risk": "clause",
};

/** 지역·기록 도구(href) → 글리프 */
export const HUB_GLYPH: Record<string, ToolGlyphId> = {
  "/analysis/price": "bars",
  "/analysis/timing": "trend",
  "/analysis/temperature": "thermo",
  "/analysis/gap": "ranking",
  "/notes": "notebook",
  "/analysis/compare": "table",
  "/analysis/scenario": "rate",
  "/analysis/portfolio": "donut",
  "/analysis/cycle": "cycle",
  "/analysis/switch": "switch",
};
