/** AI 결과는 항상 잉크 다크 패널 — 신뢰 시각 언어
 *  disclaimer: AI 오정보 리스크 대응 — 전 분석 결과에 면책 고지 (실행과제 CRO-3) */
export function AIPanel({
  title,
  children,
  className = "",
  disclaimer = true,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  disclaimer?: boolean;
}) {
  return (
    <div className={`ai-panel flex flex-col gap-2 p-[18px] ${className}`}>
      <div className="flex items-center gap-[7px]">
        <span className="ai-chip h-5 w-5 text-[10px]">AI</span>
        <span className="text-[13px] font-extrabold text-white">{title}</span>
      </div>
      <div className="text-[13px] leading-[1.6] text-ai-text">{children}</div>
      {disclaimer && (
        <div className="text-[9px] leading-[1.5] text-ai-muted">
          본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
        </div>
      )}
    </div>
  );
}
