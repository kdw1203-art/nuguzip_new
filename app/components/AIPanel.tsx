import Link from "next/link";

/** AI 결과는 항상 잉크 다크 패널 — 신뢰 시각 언어
 *  disclaimer: AI 오정보 리스크 대응 — 전 분석 결과에 면책 고지 (실행과제 CRO-3) */
export function AIPanel({
  title,
  children,
  className = "",
  disclaimer = true,
  cta,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  disclaimer?: boolean;
  /** 시작 행동 — 시장 브리핑만 두고 끝내지 않을 때 */
  cta?: { href: string; label: string };
}) {
  return (
    <div className={`ai-panel flex flex-col gap-2 p-[18px] ${className}`}>
      <div className="flex items-center gap-[7px]">
        <span className="ai-chip h-5 w-5 text-[9px]">AI</span>
        <span className="text-[13px] font-extrabold text-white">{title}</span>
      </div>
      <div className="text-[13px] leading-[1.6] text-ai-text">{children}</div>
      {cta && (
        <Link
          href={cta.href}
          className="press mt-0.5 inline-flex w-fit items-center rounded-lg bg-white/10 px-3 py-2 t-body font-extrabold text-ai-accent no-underline"
        >
          {cta.label} ›
        </Link>
      )}
      {disclaimer && (
        <div className="text-[9px] leading-[1.5] text-ai-muted">
          본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
        </div>
      )}
    </div>
  );
}
