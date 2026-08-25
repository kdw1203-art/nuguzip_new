/* 스켈레톤 — 최종 레이아웃과 **같은 모양**으로 자리를 잡는다.
   빈 화면 → 통째 등장은 레이아웃 점프를 만들고, 그 점프가 "느리다"는 인상의
   대부분이다. 값이 아니라 자리를 먼저 그린다. */
export function SkLine({ w = "100%", h = 12, className }: { w?: string | number; h?: number; className?: string }) {
  return <span className={`sk block ${className ?? ""}`} style={{ width: w, height: h }} />;
}

export function SkBlock({ h = 120, className }: { h?: number; className?: string }) {
  return <div className={`sk w-full ${className ?? ""}`} style={{ height: h }} />;
}

/** 카드 한 장 모양 — 아이콘 · 제목 · 두 줄 · 숫자 */
export function SkCard({ className }: { className?: string }) {
  return (
    <div className={`card flex flex-col gap-2 rounded-[14px] p-4 ${className ?? ""}`}>
      <span className="sk h-9 w-9 rounded-[11px]" />
      <SkLine w="62%" h={14} />
      <SkLine w="90%" h={10} />
      <SkLine w="45%" h={18} className="mt-1" />
    </div>
  );
}

/** 표 한 판 모양 — 머리 1줄 + 본문 n줄 */
export function SkTable({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <SkLine w="100%" h={14} />
      {Array.from({ length: rows }, (_, i) => (
        <SkLine key={i} w={`${92 - (i % 3) * 8}%`} h={11} />
      ))}
    </div>
  );
}
