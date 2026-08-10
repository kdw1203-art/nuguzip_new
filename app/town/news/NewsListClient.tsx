"use client";

/* 뉴스 목록 + 지역 필터 (2026-08-10 ISR 전환)
   서버가 ?region= 을 읽으면 라우트 전체가 동적이 되어 크롤 1회 = 함수 호출
   1회가 된다(비용 실측). 목록 데이터는 어차피 전량을 받아 메모리에서 거르던
   것이라, 거르는 자리만 클라이언트로 옮기면 서버 렌더는 지역과 무관해진다.
   딥링크(?region=서울)는 useSearchParams 로 계속 동작한다 — 페이지는 캐시
   한 벌, 필터는 브라우저에서. 카드 데이터는 서버가 미리 평탄화(DTO)해서
   automation_meta 같은 원본을 클라이언트에 싣지 않는다. */

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/* 칩 전환은 서버 왕복 없는 얕은 URL 갱신으로 한다. Next 14.1+ 는
   window.history.pushState 를 라우터와 동기화해 useSearchParams 가 따라온다.
   Link(?region=) 를 쓰면 같은 ISR payload 를 다시 받아오는 RSC 왕복이 생기고,
   실제 조작 경로를 로컬 프로브에서 재볼 수도 없다(실측으로 확인). */
function setRegionParam(region: string | null) {
  const url = new URL(window.location.href);
  if (region) url.searchParams.set("region", region);
  else url.searchParams.delete("region");
  window.history.pushState(null, "", url);
}
import { Icon } from "@/app/components/Icon";
import { CoverImage } from "@/app/components/CoverImage";
import { seedGradient } from "../shared";

export type NewsCardDto = {
  id: string;
  title: string;
  /** 대표 카드에서만 쓰는 요약 (그리드 카드는 null) */
  body: string | null;
  category: string;
  city: string;
  source: string;
  /** 서버에서 계산한 상대 시각 라벨 — ISR 주기(10분)만큼 낡을 수 있다 */
  timeLabel: string;
  host: string | null;
  image: string | null;
  favicon: string | null;
};

function badgeStyle(category: string): string {
  const c = category ?? "";
  if (["개발", "재건축", "재개발", "분양"].some((k) => c.includes(k)))
    return "bg-[#fdf3e7] text-warning";
  if (["정책", "뉴스"].some((k) => c.includes(k))) return "bg-[#edf2fe] text-primary";
  return "bg-[#f2f4f8] text-text-2";
}

function Thumb({ card, tall = false }: { card: NewsCardDto; tall?: boolean }) {
  return (
    <div
      className={`relative w-full overflow-hidden ${tall ? "h-[200px]" : "h-[128px]"}`}
    >
      <CoverImage
        src={card.image}
        imgClassName="absolute inset-0 h-full w-full object-cover"
        scrim
        fallback={
          <span
            className="absolute inset-0 flex items-center justify-center text-white/70"
            style={{ background: seedGradient(card.source || card.city || card.id) }}
          >
            <Icon name="file-text" size={tall ? 34 : 26} />
          </span>
        }
      />
      <span
        className={`absolute left-2 top-2 rounded-[5px] chip-pad text-[10px] font-extrabold ${badgeStyle(card.category)}`}
      >
        {card.category || "뉴스"}
      </span>
      {card.favicon && (
        <span className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.favicon}
            alt=""
            width={20}
            height={20}
            loading="lazy"
            decoding="async"
            className="h-5 w-5 rounded"
          />
        </span>
      )}
    </div>
  );
}

export function NewsListClient({
  cards,
  regions,
  hiddenCount,
  listCap,
}: {
  cards: NewsCardDto[];
  regions: string[];
  hiddenCount: number;
  listCap: number;
}) {
  const sp = useSearchParams();
  const raw = sp.get("region");
  const active = raw && regions.includes(raw) ? raw : null;

  const list = active ? cards.filter((c) => c.city === active) : cards;
  const featured = list[0];
  const rest = list.slice(1);

  return (
    <>
      {/* 지역 필터 칩 — 얕은 pushState 라 서버 왕복이 없다. 뒤로가기·딥링크는
          useSearchParams 동기화로 동작한다(프로브에서 5개 시나리오 실측). */}
      {regions.length > 0 && (
        <div className="rise-in mb-4 flex flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setRegionParam(null)}
            aria-pressed={!active}
            className={`chip px-3.5 py-2 ${
              active ? "border border-[#e2e7ee] bg-surface text-text-2" : "chip-active"
            }`}
          >
            전체
          </button>
          {regions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegionParam(r)}
              aria-pressed={active === r}
              className={`chip px-3.5 py-2 ${
                active === r
                  ? "chip-active"
                  : "border border-[#e2e7ee] bg-surface text-text-2"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* 대표 뉴스 */}
      {featured && (
        <Link
          href={`/town/news/${featured.id}`}
          className="rise-in card card-hover mb-5 block overflow-hidden rounded-[20px]"
        >
          <Thumb card={featured} tall />
          <div className="flex flex-col gap-2 p-5">
            <h2 className="text-[19px] font-extrabold leading-[1.4] text-ink">
              {featured.title}
            </h2>
            {featured.body && (
              <p className="line-clamp-2 text-sm leading-[1.6] text-text-2">
                {featured.body}
              </p>
            )}
            <div className="flex items-center gap-2 text-xs text-text-3">
              <span className="font-semibold text-text-2">{featured.source}</span>
              <span>· {featured.timeLabel}</span>
              {featured.host && <span className="text-text-3">· {featured.host}</span>}
            </div>
          </div>
        </Link>
      )}

      {/* 뉴스에서 자주 다뤄지는 두 표면으로의 상설 진입 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/redevelopment"
          className="press chip inline-flex items-center gap-1 border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline"
        >
          <Icon name="building2" size={13} />
          정비사업 지도에서 확인
        </Link>
        <Link
          href="/supply"
          className="press chip inline-flex items-center gap-1 border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline"
        >
          <Icon name="calendar" size={13} />
          입주 예정 물량 보기
        </Link>
      </div>

      {/* 뉴스 그리드 */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {rest.map((c, i) => (
            <Link
              key={c.id}
              href={`/town/news/${c.id}`}
              className={`card card-hover rise-in-${Math.min(i + 1, 6)} flex flex-col overflow-hidden rounded-[16px]`}
            >
              <Thumb card={c} />
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="line-clamp-3 text-[13px] font-bold leading-[1.4] text-ink">
                  {c.title}
                </div>
                <div className="mt-auto flex items-center gap-1 text-[11px] text-text-3">
                  <span className="min-w-0 truncate font-semibold text-text-2">
                    {c.source}
                  </span>
                  <span className="shrink-0">· {c.timeLabel}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 표시 상한 안내 — 자른 사실을 숨기지 않는다 (전체 탭에서만 의미 있는 수) */}
      {!active && hiddenCount > 0 && (
        <p className="mt-3 text-center text-[12px] text-text-3">
          최신 {listCap}건을 보여드리고 있어요 — 이전 뉴스 {hiddenCount}건은 주간
          다이제스트와 검색으로 찾을 수 있어요.
        </p>
      )}

      {/* 지역 필터 결과 0건 — 빈 상태 */}
      {list.length === 0 && active && (
        <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
          <div className="text-[26px]">
            <Icon name="🗞" size={26} />
          </div>
          <div className="text-sm font-bold text-text-1">
            {active} 관련 뉴스가 아직 없어요
          </div>
          <button
            type="button"
            onClick={() => setRegionParam(null)}
            className="btn-primary mt-1 rounded-[10px] px-4 py-2 text-xs"
          >
            전체 뉴스 보기
          </button>
        </div>
      )}
    </>
  );
}

export default NewsListClient;
