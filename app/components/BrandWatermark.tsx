/**
 * [962] 네이비 면 워터마크 — 처마 + 온점(한지색 10%). brand-navy-card / hub-hero 안에서
 * 오른쪽 위에 앉는다(장식, 콘텐츠 아님). 홈 시안 "딥 네이비 단색 + 심볼 워터마크" 그대로.
 */
export function BrandWatermark({ size = 150 }: { size?: number }) {
  return (
    <svg
      className="brand-wm"
      width={size}
      height={Math.round(size * 0.93)}
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <path d="M14 46 C 38 64, 82 64, 106 46" fill="none" stroke="#F6F1E7" strokeWidth="7" strokeLinecap="round" />
      <circle cx="60" cy="86" r="8.5" fill="#F6F1E7" />
    </svg>
  );
}

export default BrandWatermark;
