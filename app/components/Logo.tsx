/* [946 리브랜딩] 내집나우 — 온점 심볼 + Pretendard 워드마크.
 *
 * 브랜드 마스터 v2.1 규정:
 *  - 심볼: 인방(가로획) + 처마(곡선) + 온점. 24px 미만은 축소형(용마루 제거·점 확대).
 *  - 워드마크: Pretendard Bold · 자간 9~10% (사이트가 Pretendard 를 이미 로드한다).
 *  - 색: 라이트 = 네이비 #0B2545 + 주홍 #C8442B ·
 *        다크(반전형) = 한지 #F6F1E7 + 주홍 #E0563A.
 *    테마 전환은 globals.css 의 --brand-symbol-ink / --brand-dot 토큰이 맡는다 —
 *    여기서 색을 하드코딩하면 다크에서 네이비가 배경에 묻는다(금지 규정: 저대비).
 */

/** 온점 심볼 — 기본형(24px 이상). viewBox 120, 실표시 비율 h≈0.92w */
export function BrandSymbol({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.92)}
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <path
        d="M52 28 L68 28"
        fill="none"
        stroke="var(--brand-symbol-ink)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M14 46 C 38 64, 82 64, 106 46"
        fill="none"
        stroke="var(--brand-symbol-ink)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* [961] .njn-logo:hover 에서 온점이 한 번 튄다(480ms pop) — 로고 자체는 규정대로 정지 */}
      <circle className="brand-dot-el" cx="60" cy="86" r="10" fill="var(--brand-dot)" />
    </svg>
  );
}

/** 축소형(24px 미만·인라인 장식) — 용마루 제거·온점 확대 */
export function BrandSymbolCompact({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path
        d="M12 40 C 38 62, 82 62, 108 40"
        fill="none"
        stroke="var(--brand-symbol-ink)"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <circle cx="60" cy="84" r="15" fill="var(--brand-dot)" />
    </svg>
  );
}

/** @deprecated 구 하우스마크 호환 별칭 — 신규 코드는 BrandSymbol 사용 */
export function HouseMark({ size = 21 }: { size?: number }) {
  return <BrandSymbolCompact size={size} />;
}

export function Logo({ size = 21 }: { size?: number }) {
  return (
    <span className="flex items-center gap-[8px] select-none">
      <BrandSymbol size={size + 2} />
      <span
        className="font-bold"
        style={{
          fontSize: size * 0.79,
          letterSpacing: "0.09em",
          color: "var(--brand-wordmark)",
        }}
      >
        내집나우
      </span>
    </span>
  );
}
