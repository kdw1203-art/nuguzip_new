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
  /** 포인트 추천글 부스트 활성 — 정렬 우선 + '추천글' 배지 */
  boosted?: boolean;
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
  const labelColor = card.kind === "note" ? "text-success" : "text-primary";
  return (
    <div
      className="relative w-full overflow-hidden"
      /* CLS 수리(2026-08-16 실측): 이미지가 자연 높이로 렌더돼 로드 순간
         카드가 통째로 자랐다 — /town p75 CLS 0.414 의 주범. 컨테이너가
         높이를 **먼저** 확정하고(카드별 시드 높이 = 기존 매소너리 리듬 유지)
         이미지는 absolute 로 그 안을 채운다. 로드 전후 높이가 같다 = 시프트 0. */
      style={{
        background: seedGradient(card.region || card.id),
        height: seedCoverHeight(card.id),
      }}
    >
      <CoverImage
        src={card.cover}
        imgClassName="absolute inset-0 h-full w-full object-cover"
      />
      <span
        className={`absolute left-2 top-2 rounded-[6px] bg-white/90 chip-pad text-[10px] font-extrabold ${labelColor}`}
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
            {card.boosted && (
              <span className="mr-1.5 inline-block align-middle rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
                추천글
              </span>
            )}
            {card.title}
          </div>
          {card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-bg chip-pad text-[10px] font-semibold text-text-2"
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
  loadFailed = false,
  ad = null,
}: {
  cards: FeedCard[];
  /**
   * 피드 소스 조회가 **실패**했는가. 빈 목록이 "아직 없음"인지 "못 불러옴"인지는
   * 목록만 봐서는 구분이 안 된다 — 둘을 다르게 말하려면 이 플래그가 필요하다.
   */
  loadFailed?: boolean;
  /** 서버에서 렌더한 광고 슬롯(없으면 null) */
  ad?: ReactNode;
}) {
  const [filter, setFilter] = useState<FilterId>("all");

  const visible = useMemo(() => {
    let list = cards;
    if (filter === "note") list = cards.filter((c) => c.kind === "note");
    else if (filter === "post") list = cards.filter((c) => c.kind === "post");
    /* 포인트 추천글은 정렬과 무관하게 맨 앞 — 배지('추천글')로 이유를 밝힌다 */
    const byBoost = (a: FeedCard, b: FeedCard) => Number(b.boosted ?? false) - Number(a.boosted ?? false);
    if (filter === "latest")
      return [...list].sort((a, b) => byBoost(a, b) || b.createdAt - a.createdAt);
    return [...list].sort((a, b) => byBoost(a, b) || recommendScore(b) - recommendScore(a));
  }, [cards, filter]);

  return (
    <>
      {/* 모바일 실측 11 — 우측 페이드로 가로 스크롤 가능함을 암시 (카테고리 카드와 동일 처리) */}
      <div className="rise-in mb-3 flex gap-[6px] overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] md:[mask-image:none]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`min-h-[36px] px-3.5 py-2 shrink-0 ${filter === f.id ? "chip-active" : "chip"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadFailed && (
        // 빨강 글씨 대신 배경으로 신호를 준다. --danger 토큰 자체는 이제 AA 를
        // 넘지만(#c62828, soft 위 4.83), 11px 안내문은 text-ink(14.24:1)가 확실히
        // 읽힌다 — 색은 "실패"라는 신호만 지고, 문장은 검정으로 읽는다.
        <div className="rise-in-2 mb-3 rounded-[12px] border border-line bg-danger-soft px-3.5 py-2.5 text-[11px] leading-[1.6] text-ink">
          일부 글을 불러오지 못했어요 (조회 실패). 글이 없다는 뜻은 아니에요 — 잠시 후
          새로고침해 주세요.
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rise-in-3 card flex flex-col items-center gap-2 px-5 py-12 text-center">
          <div className="text-[26px]"><Icon name="📍" size={26} /></div>
          {/* 조회 실패로 목록이 비었을 때 "글이 없어요"라고 하면 사실이 아니다. */}
          <div className="text-[15px] font-extrabold text-ink">
            {loadFailed ? "글을 불러오지 못했어요" : "아직 이 필터에 보여줄 글이 없어요"}
          </div>
          <div className="text-[12px] text-text-3">
            {loadFailed
              ? "데이터 조회가 실패했습니다. 잠시 후 다시 시도해 주세요."
              : "첫 임장노트나 동네 이야기를 남기면 가장 먼저 노출돼요"}
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
