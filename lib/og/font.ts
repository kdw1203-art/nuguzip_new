import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * OG 공유 카드용 한글 폰트 로더 (공용).
 * next/og(satori)는 시스템 폰트를 못 써 한글이 □로 깨지므로 Pretendard Bold
 * 서브셋(전체 한글+라틴+기호)을 번들에서 1회 로드해 지정한다.
 * 여러 후보 경로 시도(로컬 소스 트리 + Vercel 트레이싱 경로). 실패 시 null → 시스템 폴백.
 * next.config outputFileTracingIncludes 로 각 og 라우트 번들에 폰트를 포함시킨다.
 */
const PRETENDARD_BOLD: Buffer | null = (() => {
  const candidates: (string | URL)[] = [
    join(process.cwd(), "lib/og/fonts/Pretendard-Bold.subset.ttf"),
    new URL("./fonts/Pretendard-Bold.subset.ttf", import.meta.url),
  ];
  for (const c of candidates) {
    try {
      const buf = readFileSync(c as string);
      if (buf && buf.length > 1000) return buf;
    } catch {
      /* 다음 후보 시도 */
    }
  }
  console.error("[og] Pretendard 폰트 로드 실패 — 시스템 폰트 폴백");
  return null;
})();

/** OG 카드 공통 fontFamily (Pretendard 우선, 실패 시 시스템 폴백) */
export const OG_FONT_FAMILY =
  '"Pretendard", system-ui, -apple-system, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/** `new ImageResponse(el, { ...opts, ...ogFonts() })` 로 spread. 폰트 없으면 {} (시스템 폴백). */
export function ogFonts() {
  if (!PRETENDARD_BOLD) return {} as const;
  return {
    fonts: [
      {
        name: "Pretendard",
        data: PRETENDARD_BOLD,
        weight: 700 as const,
        style: "normal" as const,
      },
    ],
  };
}
