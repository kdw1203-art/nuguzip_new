/* 홈 리디자인(#408) 시안 A — 상단 시세 티커 밴드 (잉크 네이비).
 *
 * 사실 우선: 항목은 전부 실측값이고, 조회에 실패한 항목은 **빠진다**(가짜
 * 숫자로 채우지 않는다). 항목이 하나도 없으면 밴드 자체를 그리지 않는다.
 *
 * 모션: CSS 마퀴(트랙 2벌 복제 + translateX -50%). prefers-reduced-motion
 * 에서는 애니메이션을 끄고 가로 스크롤로 대체한다(globals.css 8f 등록).
 */

export interface TickerItem {
  label: string;
  value: string;
  /** "up" = 파랑 강조, "down" = 붉은 강조 */
  tone?: "up" | "down" | "flat";
}

export function HomeTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  const row = (dup: boolean) => (
    <div
      aria-hidden={dup || undefined}
      className="flex shrink-0 items-center gap-7 pr-7"
    >
      {items.map((it, i) => (
        <span
          key={`${dup ? "d" : "o"}-${i}`}
          className="flex shrink-0 items-baseline gap-1.5 text-[11px] font-bold"
        >
          <span className="text-white/55">{it.label}</span>
          <span
            className={`tabular-nums ${
              it.tone === "up"
                ? "text-[#8fb3ff]"
                : it.tone === "down"
                  ? "text-[#ff9d9d]"
                  : "text-white/90"
            }`}
          >
            {it.value}
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="ticker-band overflow-hidden rounded-xl bg-ink px-0 py-2">
      <div className="ticker-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
