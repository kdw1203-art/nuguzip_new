"use client";

/* 시세·타이밍 지역 선택 — ISR 전환(13차) 후에는 서버 재렌더 대신 부모
   (TimingClient)가 pushState + CDN 캐시 API 페치로 갈아끼운다. 이 컴포넌트는
   값과 콜백만 받는 순수 셀렉트다 (예전에는 router.replace 로 ?region= 이동). */
export function TimingRegionSelect({
  options,
  value,
  disabled,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label="분석 지역 선택"
      className="rounded-[10px] border border-line bg-surface px-2.5 py-2 text-xs font-bold text-ink disabled:opacity-60"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
