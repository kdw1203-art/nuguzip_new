"use client";

/* 뉴스 목록 + 지역 필터 (2026-08-10 ISR 전환)
   서버가 ?region= 을 읽으면 라우트 전체가 동적이 되어 크롤 1회 = 함수 호출
   1회가 된다(비용 실측). 목록 데이터는 어차피 전량을 받아 메모리에서 거르던
   것이라, 거르는 자리만 클라이언트로 옮기면 서버 렌더는 지역과 무관해진다.
   딥링크(?region=서울)는 useSearchParams 로 계속 동작한다 — 페이지는 캐시
   한 벌, 필터는 브라우저에서. 카드 데이터는 서버가 미리 평탄화(DTO)해서
   automation_meta 같은 원본을 클라이언트에 싣지 않는다. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/* 칩 전환은 서버 왕복 없는 얕은 URL 갱신으로 한다. Next 14.1+ 는
   window.history.pushState 를 라우터와 동기화해 useSearchParams 가 따라온다.
   Link(?region=) 를 쓰면 같은 ISR payload 를 다시 받아오는 RSC 왕복이 생기고,
   실제 조작 경로를 로컬 프로브에서 재볼 수도 없다(실측으로 확인). */
function pushParamUrl(key: "region" | "cat", value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
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
  /** [#67] 같은 사건을 다룬 다른 매체 보도 — 카드 안에 접힌 목록 (최대 4건) */
  related?: Array<{ id: string; title: string; source: string; timeLabel: string }>;
};

/* [#67] 관련 보도 접힘 목록 — 카드 하단의 <details>. 링크 카드(<Link>) 안에
   중첩할 수 없어(중첩 앵커), 이 블록을 쓰는 카드는 겉을 div 로 바꾸고 본문만
   Link 로 감싼다. */
function RelatedFold({ related }: { related: NonNullable<NewsCardDto["related"]> }) {
  if (related.length === 0) return null;
  return (
    <details className="border-t border-divider px-3 py-2">
      <summary className="cursor-pointer list-none t-sub font-bold text-primary">
        관련 보도 {related.length}건 ▾
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {related.map((r) => (
          <li key={r.id}>
            <Link href={`/town/news/${r.id}`} className="flex flex-col gap-px">
              <span className="line-clamp-2 t-sub font-bold text-ink">
                {r.title}
              </span>
              <span className="t-caption text-text-3">
                {r.source} · {r.timeLabel}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

function badgeStyle(category: string): string {
  const c = category ?? "";
  if (["개발", "재건축", "재개발", "분양"].some((k) => c.includes(k)))
    return "bg-warning-soft text-warning";
  if (["정책", "뉴스"].some((k) => c.includes(k))) return "bg-primary-soft text-primary";
  return "bg-bg text-text-2";
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
  /* [2026-08-10 정정] 처음엔 useSearchParams 로 읽었다. 그런데 프리렌더 시점엔
     쿼리를 알 수 없어 Suspense 폴백이 HTML 에 박히고, 배포 HTML 실측에서 뉴스
     카드가 0건이었다 — JS 를 안 돌리는 크롤러에게 목록이 통째로 사라진다.
     그래서 SSR 은 항상 전체 목록을 그리고(HTML 에 60건 전부), 필터는 마운트
     후 location.search 에서 읽어 적용한다. 딥링크는 하이드레이션 직후 걸린다. */
  const [active, setActive] = useState<string | null>(null);
  /* 분류 필터(2026-08-22) — 카드가 이미 들고 있던 category 를 거를 수 있게 한다.
     배지로 색만 칠하고 거르지는 못하던 값이었다. 지역과 같은 얕은 URL 방식(?cat=). */
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const categories = useMemo(() => {
    const freq = new Map<string, number>();
    for (const c of cards) {
      const k = c.category?.trim();
      if (k) freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);
  }, [cards]);
  useEffect(() => {
    const read = () => {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get("region");
      setActive(raw && regions.includes(raw) ? raw : null);
      const cat = sp.get("cat");
      setActiveCat(cat && categories.includes(cat) ? cat : null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
    // regions/categories 는 서버 데이터 파생 고정 배열이라 join 값으로만 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions.join("|"), categories.join("|")]);

  const list = cards.filter(
    (c) => (!active || c.city === active) && (!activeCat || c.category === activeCat),
  );
  const featured = list[0];
  const rest = list.slice(1);
  const anyFilter = Boolean(active || activeCat);
  const clearAll = () => {
    pushParamUrl("region", null);
    pushParamUrl("cat", null);
    setActive(null);
    setActiveCat(null);
  };

  return (
    <>
      {/* 지역 필터 칩 — 얕은 pushState 라 서버 왕복이 없다. 뒤로가기·딥링크는
          useSearchParams 동기화로 동작한다(프로브에서 5개 시나리오 실측). */}
      {regions.length > 0 && (
        <div className="rise-in mb-2 flex flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => { pushParamUrl("region", null); setActive(null); }}
            aria-pressed={!active}
            className={`chip px-3.5 py-2 ${
              active ? "border border-line bg-surface text-text-2" : "chip-active"
            }`}
          >
            전체
          </button>
          {regions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { pushParamUrl("region", r); setActive(r); }}
              aria-pressed={active === r}
              className={`chip px-3.5 py-2 ${
                active === r
                  ? "chip-active"
                  : "border border-line bg-surface text-text-2"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* 분류 칩 + 검색 진입 — 배지로만 보이던 category 를 실제 필터로 연다.
          검색은 이미 뉴스를 포함하는 통합검색(/search)으로 잇는다. */}
      {categories.length > 1 && (
        <div className="rise-in mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="t-sub font-bold text-text-3">분류</span>
          {categories.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                const next = activeCat === k ? null : k;
                pushParamUrl("cat", next);
                setActiveCat(next);
              }}
              aria-pressed={activeCat === k}
              className={`chip px-3 py-1.5 ${
                activeCat === k ? "chip-active" : "border border-line bg-surface text-text-2"
              }`}
            >
              {k}
            </button>
          ))}
          <Link
            href="/search"
            className="press chip ml-auto inline-flex items-center gap-1 border border-line bg-surface px-3 py-1.5 text-text-2 no-underline"
          >
            <Icon name="search" size={13} />
            뉴스 검색
          </Link>
        </div>
      )}

      {/* 대표 뉴스 — [#67] 관련 보도가 있으면 카드 하단에 접힘 목록 */}
      {featured && (
        <div className="rise-in card tile mb-5 overflow-hidden rounded-[20px]">
          <Link href={`/town/news/${featured.id}`} className="block">
            <Thumb card={featured} tall />
            <div className="flex flex-col gap-2 p-5">
              <h2 className="t-section text-ink">
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
          {featured.related && featured.related.length > 0 && (
            <RelatedFold related={featured.related} />
          )}
        </div>
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

      {/* 뉴스 그리드 — [#67] 관련 보도는 카드 하단 접힘 (대표 1건 + N건) */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {rest.map((c, i) => (
            <div
              key={c.id}
              className={`card tile rise-in-${Math.min(i + 1, 6)} flex flex-col overflow-hidden rounded-[16px]`}
            >
              <Link href={`/town/news/${c.id}`} className="flex flex-1 flex-col">
                <Thumb card={c} />
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <div className="line-clamp-3 t-body font-bold text-ink">
                    {c.title}
                  </div>
                  <div className="mt-auto flex items-center gap-1 t-sub text-text-3">
                    <span className="min-w-0 truncate font-semibold text-text-2">
                      {c.source}
                    </span>
                    <span className="shrink-0">· {c.timeLabel}</span>
                  </div>
                </div>
              </Link>
              {c.related && c.related.length > 0 && <RelatedFold related={c.related} />}
            </div>
          ))}
        </div>
      )}

      {/* 표시 상한 안내 — 자른 사실을 숨기지 않는다 (전체 탭에서만 의미 있는 수).
          "검색으로 찾을 수 있어요"라면서 검색으로 가는 길이 없었다 — 링크를 건다. */}
      {!anyFilter && hiddenCount > 0 && (
        <p className="mt-3 text-center t-sub text-text-3">
          최신 {listCap}건을 보여드리고 있어요 — 이전 뉴스 {hiddenCount}건은{" "}
          <Link href="/digest" className="font-bold text-primary">주간 다이제스트</Link>와{" "}
          <Link href="/search" className="font-bold text-primary">검색</Link>으로 찾을 수 있어요.
        </p>
      )}

      {/* 필터 결과 0건 — 빈 상태 (지역·분류 어느 쪽이든) */}
      {list.length === 0 && anyFilter && (
        <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
          <div className="t-title">
            <Icon name="🗞" size={26} />
          </div>
          <div className="text-sm font-bold text-text-1">
            {[active, activeCat].filter(Boolean).join(" · ")} 관련 뉴스가 아직 없어요
          </div>
          <button
            type="button"
            onClick={clearAll}
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
