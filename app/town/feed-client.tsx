"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { seedGradient, seedCoverHeight } from "./shared";
import { ExampleBadge } from "../components/ExampleBadge";
import { Icon } from "@/app/components/Icon";
import { CoverImage } from "@/app/components/CoverImage";

/* 동네이야기 통합 피드 — 오늘의집/인스타그램형 사진 우선 카드 그리드(매소너리).
   공개 임장노트(사진 우선) + 커뮤니티 글을 한 피드로 섞어 보여준다.
   서버에서 카드 배열을 만들어 내려주고, 여기선 필터 탭만 클라이언트로 처리. */

export type FeedCard = {
  id: string;
  href: string;
  kind: "note" | "post";
  /** 실제 사진 URL — 없으면 지역/출처 시드 그라디언트 커버 */
  cover: string | null;
  title: string;
  author: string;
  region: string;
  /** 실측 저장(북마크) 수 — 지표가 없으면 undefined 로 두고 표시하지 않는다 */
  saves?: number;
  /** 임장노트 평균 평점(1~5) — 실데이터. 없으면 미표시 */
  rating?: number | null;
  tags: string[];
  visited: boolean;
  createdAt: number;
  isExample: boolean;
};

const FILTERS = [
  { id: "all", label: "추천" },
  { id: "latest", label: "최신" },
  { id: "note", label: "임장노트" },
  { id: "post", label: "이야기" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function Cover({ card }: { card: FeedCard }) {
  const label = card.kind === "note" ? (card.visited ? "✓ 직접 방문" : "임장노트") : "이야기";
  const labelColor = card.kind === "note" ? "text-[#1a7f4e]" : "text-primary";
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ background: seedGradient(card.region || card.id) }}
    >
      {/* 로드 실패 시 그라디언트 배경이 보이도록 spacer 폴백으로 교체 (#18) */}
      <CoverImage
        src={card.cover}
        imgClassName="block w-full object-cover"
        fallback={<div style={{ height: seedCoverHeight(card.id) }} />}
      />
      <span
        className={`absolute left-2 top-2 rounded-[6px] bg-white/90 px-2 py-[2px] text-[10px] font-extrabold ${labelColor}`}
      >
        {label}
      </span>
      {card.isExample && (
        <span className="absolute right-2 top-2 rounded-[5px] bg-white/90 px-[3px] py-[2px]">
          <ExampleBadge />
        </span>
      )}
    </div>
  );
}

function FeedCardView({ card, delay }: { card: FeedCard; delay: number }) {
  return (
    <div className={`mb-3 break-inside-avoid rise-in-${Math.min(delay, 6)}`}>
      <Link href={card.href} className="card card-hover block overflow-hidden rounded-[16px]">
        <Cover card={card} />
        <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5">
          <div className="line-clamp-2 text-[13px] font-extrabold leading-[1.4] text-ink">
            {card.title}
          </div>
          {card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-[#f2f4f8] px-2 py-[1px] text-[10px] font-semibold text-text-2"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] text-text-3">
            <span className="min-w-0 truncate">
              {card.author}
              {card.region ? ` · ${card.region}` : ""}
            </span>
            {typeof card.rating === "number" && card.rating > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                ★ {card.rating.toFixed(1)}
              </span>
            ) : typeof card.saves === "number" ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Icon name="🔖" size={12} />
                {card.saves}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </div>
  );
}

/**
 * 피드 안에 광고를 끼워 넣는 위치.
 * lib/ads/adsense-policy 의 정책은 "커뮤니티는 8번째마다"지만, 지금 슬롯이 내려주는
 * 크리에이티브는 한 개뿐이라 8칸마다 반복하면 같은 배너가 화면에 여러 번 잡힌다.
 * 그래서 첫 지점(8번째 카드 뒤)에서 한 번만 넣는다. 카드가 8개도 안 되면
 * 피드가 짧다는 뜻이므로 그리드 아래에 붙인다.
 */
const AD_AFTER_INDEX = 7;

/**
 * 추천 정렬 점수 — 실데이터(최신성 + 노트 평점 + 글 저장수)만 사용한다.
 * 예전의 "계산식 저장수(평점×40)" 허수를 없애고, 평점 1점 = 신선도 6시간,
 * 저장 1건 = 1시간(최대 20건)만큼 가산해 최신순을 보정한다.
 */
function recommendScore(c: FeedCard): number {
  const ratingBoost = (c.rating ?? 0) * 6 * 3_600_000;
  const savesBoost = Math.min(c.saves ?? 0, 20) * 3_600_000;
  return c.createdAt + ratingBoost + savesBoost;
}

export function TownFeed({
  cards,
  exampleOnly,
  ad = null,
}: {
  cards: FeedCard[];
  exampleOnly: boolean;
  /** 서버에서 렌더한 광고 슬롯(없으면 null) */
  ad?: ReactNode;
}) {
  const [filter, setFilter] = useState<FilterId>("all");

  const visible = useMemo(() => {
    let list = cards;
    if (filter === "note") list = cards.filter((c) => c.kind === "note");
    else if (filter === "post") list = cards.filter((c) => c.kind === "post");
    if (filter === "latest") return [...list].sort((a, b) => b.createdAt - a.createdAt);
    return [...list].sort((a, b) => recommendScore(b) - recommendScore(a));
  }, [cards, filter]);

  return (
    <>
      <div className="rise-in mb-3 flex gap-[6px] overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={filter === f.id ? "chip-active shrink-0" : "chip shrink-0"}
          >
            {f.label}
          </button>
        ))}
      </div>

      {exampleOnly && (
        <div className="rise-in-2 mb-3 flex items-center gap-1.5 rounded-[12px] border border-line bg-surface px-3.5 py-2.5 text-[11px] text-text-3">
          <ExampleBadge />
          <span>
            아직 공개된 임장노트·이야기가 없어 샘플 1건을 보여드려요 — 실데이터가
            쌓이면 자동으로 교체됩니다.
          </span>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rise-in-3 card flex flex-col items-center gap-2 px-5 py-12 text-center">
          <div className="text-[26px]"><Icon name="📍" size={26} /></div>
          <div className="text-[15px] font-extrabold text-ink">
            아직 이 필터에 보여줄 글이 없어요
          </div>
          <div className="text-[12px] text-text-3">
            첫 임장노트나 동네 이야기를 남기면 가장 먼저 노출돼요
          </div>
          <Link href="/town/write" className="btn-primary btn-md mt-2">
            글쓰기
          </Link>
        </div>
      ) : (
        <>
          <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
            {visible.map((card, i) => (
              <Fragment key={card.id}>
                <FeedCardView card={card} delay={(i % 6) + 1} />
                {ad && i === AD_AFTER_INDEX && (
                  <div className="mb-3 break-inside-avoid">{ad}</div>
                )}
              </Fragment>
            ))}
          </div>
          {ad && visible.length <= AD_AFTER_INDEX && <div className="mt-1">{ad}</div>}
        </>
      )}
    </>
  );
}
