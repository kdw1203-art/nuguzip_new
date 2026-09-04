import { BrandSymbol } from "@/app/components/Logo";

/**
 * [961] 시그니처 무대 — 브랜드 마스터 v2.1 §01.
 * 한지 판면 + 네 모서리 크롭 마크 + 온점 심볼 + 워드마크(자간 10%, 같은 값의 padding-left)
 * + NAEJIP NOW(자간 44%·모래색) + 세리프 슬로건(마침표는 주홍 온점).
 * 소개 페이지처럼 "브랜드가 스스로를 말하는 자리"에만 쓴다 — 아무 데나 두면 장식이 된다.
 */
export function BrandSignature({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative flex flex-col items-center gap-4 rounded-[18px] bg-brand-hanji px-6 py-12 text-center ${className}`}
      aria-label="내집나우 브랜드 시그니처"
      role="img"
    >
      {[
        "left-3.5 top-3.5",
        "right-3.5 top-3.5 -scale-x-100",
        "bottom-3.5 left-3.5 -scale-y-100",
        "bottom-3.5 right-3.5 -scale-100",
      ].map((pos) => (
        <span key={pos} className={`absolute h-3 w-3 ${pos}`} aria-hidden="true">
          <span className="absolute left-0 top-0 h-px w-3 bg-brand-hanji-ink opacity-30" />
          <span className="absolute left-0 top-0 h-3 w-px bg-brand-hanji-ink opacity-30" />
        </span>
      ))}
      <BrandSymbol size={96} />
      <div className="flex flex-col items-center gap-1.5">
        <div
          className="font-bold leading-none text-brand-hanji-ink"
          style={{ fontSize: 28, letterSpacing: "0.1em", paddingLeft: "0.1em" }}
        >
          내집나우
        </div>
        <div
          className="t-caption font-semibold text-brand-hanji-ink opacity-60"
          style={{ letterSpacing: "0.44em", paddingLeft: "0.44em" }}
        >
          NAEJIP NOW
        </div>
      </div>
      <div className="brand-slogan-band bg-transparent p-0">
        <span className="slg">
          오래 머물 집을, 지금<i>.</i>
        </span>
      </div>
    </div>
  );
}

export default BrandSignature;
