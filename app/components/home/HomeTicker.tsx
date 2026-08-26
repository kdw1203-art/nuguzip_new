import Link from "next/link";

/* 홈 리디자인(#408) 시안 A — 시세 티커 밴드 (잉크 네이비).
 *
 * 사실 우선: 항목은 전부 실측값이고, 조회에 실패한 항목은 **빠진다**(가짜
 * 숫자로 채우지 않는다). 항목이 하나도 없으면 밴드 자체를 그리지 않는다.
 *
 * 2026-08-17 개선(홈 비판 대응):
 * - 항목 링크화 — 숫자에 "그래서 뭐?"가 없다는 지적. 기준금리→시나리오,
 *   온도→온도 기록처럼 해석 페이지로 잇는다(href 없는 항목은 그대로 텍스트).
 * - 가독성 — 11px/55% 라벨이 저시력·고령 사용자에게 부담: 12px/70%로.
 *
 * 모션: CSS 마퀴(트랙 2벌 복제 + translateX -50%). prefers-reduced-motion
 * 에서는 애니메이션을 끄고 가로 스크롤로 대체한다(globals.css 8f 등록).
 */

export interface TickerItem {
  label: string;
  value: string;
  /** "up" = 파랑 강조, "down" = 붉은 강조 */
  tone?: "up" | "down" | "flat";
  /** 해석 페이지 — 있으면 항목 전체가 링크가 된다 */
  href?: string;
  /** 위계. (A15)
   *  region = 지역 시세(이 티커의 주인공) · macro = 기준금리·지수 같은 배경 지표.
   *  예전에는 전부 같은 밝기·굵기로 흘러서, 무엇이 내 이야기이고 무엇이
   *  배경인지 구분이 없었다 — 여덟 항목이 같은 무게로 지나가면 아무것도 안 읽힌다. */
  kind?: "region" | "macro";
}

function ItemBody({ it }: { it: TickerItem }) {
  const macro = it.kind === "macro";
  return (
    <>
      <span className={macro ? "text-white/45" : "text-white/70"}>{it.label}</span>
      <span
        className={`tabular-nums ${
          it.tone === "up"
            ? "text-[#8fb3ff]"
            : it.tone === "down"
              ? "text-[#ff9d9d]"
              : macro
                ? "text-white/60"
                : "text-white/95"
        }`}
      >
        {it.value}
      </span>
    </>
  );
}

function Item({ it, linkable = true }: { it: TickerItem; linkable?: boolean }) {
  const cls = `flex shrink-0 items-baseline gap-1.5 t-sub ${it.kind === "macro" ? "font-semibold" : "font-bold"}`;
  /* 마퀴 복제 트랙(aria-hidden)의 링크는 포커스 함정이 된다 — 복제분은 스팬으로 */
  if (it.href && linkable) {
    return (
      <Link prefetch={false} href={it.href} className={`${cls} no-underline`}>
        <ItemBody it={it} />
      </Link>
    );
  }
  return (
    <span className={cls}>
      <ItemBody it={it} />
    </span>
  );
}

export function HomeTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  /* 항목이 적으면(빌드 직후 ISR 재생성 전 등) 마퀴가 짧은 내용을 뱅글뱅글
     돌려 어색하다 — 4개 미만은 정적 가운데 정렬로 그린다(#409). */
  if (items.length < 4) {
    return (
      <div className="overflow-x-auto rounded-xl bg-ink px-4 py-2">
        <div className="flex items-center justify-center gap-7">
          {items.map((it, i) => (
            <Item key={i} it={it} />
          ))}
        </div>
      </div>
    );
  }

  const row = (dup: boolean) => (
    <div
      aria-hidden={dup || undefined}
      className="flex shrink-0 items-center gap-7 pr-7"
    >
      {items.map((it, i) => (
        <Item key={`${dup ? "d" : "o"}-${i}`} it={it} linkable={!dup} />
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
