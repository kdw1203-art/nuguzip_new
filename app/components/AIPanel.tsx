/** AI 결과는 항상 잉크 다크 패널 — 신뢰 시각 언어 */
export function AIPanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`ai-panel flex flex-col gap-2 p-[18px] ${className}`}>
      <div className="flex items-center gap-[7px]">
        <span className="ai-chip h-5 w-5 text-[10px]">AI</span>
        <span className="text-[13px] font-extrabold text-white">{title}</span>
      </div>
      <div className="text-[13px] leading-[1.6] text-ai-text">{children}</div>
    </div>
  );
}
