import { BrandSymbolCompact } from "@/app/components/Logo";

/* [946 리브랜딩 · 홈 프리뷰 ⑤] 슬로건 띠 — 한지 배경 + 세리프 한 줄.
 * 세리프는 layout.tsx 가 슬로건 글자만 서브셋한 Noto Serif KR(수 KB)을 싣는다.
 * 미로드 시 시스템 명조 폴백 — 문장은 같고 격조만 조금 덜하다.
 * 온점(마침표)은 브랜드 주홍 — '지금'을 색으로 찍는 유일한 자리다. */
export function BrandSloganBand({ className = "" }: { className?: string }) {
  return (
    <div className={`brand-slogan-band ${className}`} aria-label="내집나우 — 오래 머물 집을, 지금">
      <BrandSymbolCompact size={16} />
      <span className="slg">
        오래 머물 집을, 지금<i>.</i>
      </span>
    </div>
  );
}
