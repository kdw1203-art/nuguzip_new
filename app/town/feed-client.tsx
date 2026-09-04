"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getHomePersonal } from "@/lib/client/home-personal";
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
  /** [959] 내집나우 Lab(데이터 분석 카드) 노트 — "직접 방문"이 아니라 "Lab 데이터"로 표기한다 */
  lab?: boolean;
  /** 사진 없는 커버에 크게 적을 이름(단지명 등) */
  aptName?: string | null;
};

/* [B19] 유형(무엇을 보나)과 정렬(어떤 순서로 보나)은 서로 다른 축인데
   한 세그먼트에 4칸으로 섞여 있었다. 그래서 "임장노트를 최신순으로" 가
   **표현 불가능**했고(둘 다 같은 칸을 차지한다), "추천 20 · 최신 20" 처럼
   같은 수가 두 번 적혀 고장난 것처럼 보였다. 두 줄로 가른다. */
const KINDS = [
  { id: "all", label: "전체" },
  { id: "note", label: "임장노트" },
  { id: "post", label: "이야기" },
] as const;
type KindId = (typeof KINDS)[number]["id"];

const SORTS = [
  { id: "reco", label: "추천순" },
  { id: "latest", label: "최신순" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

/* [959] 사진이 없는 카드의 커버 — 예전엔 연한 그라디언트 빈 상자였다(23장 중 절반이
   빈 상자라 피드가 "아무것도 없는 곳"처럼 보였다). 이제 **그 카드가 말하는 것**을 커버로
   그린다: 단지명(또는 제목)을 크게, 지역을 작게, 노트는 네이비 위 한지 글자, 이야기는 한지
   위 남색 글자. 사진처럼 꾸미지 않고 "데이터 카드"임을 드러낸다(가짜 사진 금지). */
function GeneratedCover({ card }: { card: FeedCard }) {
  const dark = card.kind === "note";
  const big = (card.aptName?.trim() || card.title).slice(0, 28);
  return (
    <div
      className={`absolute inset-0 flex flex-col justify-end p-3 ${
        dark ? "bg-brand-navy text-on-dark" : "bg-brand-hanji text-brand-hanji-ink"
      }`}
      aria-hidden="true"
    >
      <span
        className={`pointer-events-none absolute -right-3 -top-4 h-16 w-16 rounded-full ${
          dark ? "bg-brand-red-dark/25" : "bg-brand-red/15"
        }`}
      />
      <span className={`t-caption font-extrabold tracking-wider ${dark ? "text-on-dark-muted" : "opacity-70"}`}>
        {card.region}
      </span>
      <span className="clamp-2 t-section leading-snug">{big}</span>
      {typeof card.rating === "number" && card.rating > 0 && (
        <span className={`mt-1 t-caption font-bold ${dark ? "text-brand-red-dark" : "text-brand-red"}`}>
          ★ {card.rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function Cover({ card }: { card: FeedCard }) {
  /* [959] Lab 노트는 현장 방문 기록이 아니라 데이터 분석 카드다 — "✓ 직접 방문" 대신 "Lab 데이터".
     사람이 다녀온 노트만 방문 배지를 단다. */
  const label =
    card.kind === "note"
      ? card.lab
        ? "Lab 데이터"
        : card.visited
          ? "✓ 직접 방문"
          : "임장노트"
      : "이야기";
  const labelColor =
    card.kind === "note" ? (card.lab ? "text-brand-navy" : "text-success") : "text-primary";
  const hasPhoto = Boolean(card.cover);
  return (
    <div
      className="relative w-full overflow-hidden"
      /* CLS 수리(2026-08-16 실측): 이미지가 자연 높이로 렌더돼 로드 순간
         카드가 통째로 자랐다 — /town p75 CLS 0.414 의 주범. 컨테이너가
         높이를 **먼저** 확정하고(카드별 시드 높이 = 기존 매소너리 리듬 유지)
         이미지는 absolute 로 그 안을 채운다. 로드 전후 높이가 같다 = 시프트 0. */
      style={{
        background: hasPhoto ? seedGradient(card.region || card.id) : undefined,
        height: seedCoverHeight(card.id),
      }}
    >
      {hasPhoto ? (
        <CoverImage
          src={card.cover}
          alt={`${card.title} 커버 사진`}
          imgClassName="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <GeneratedCover card={card} />
      )}
      {/* 위쪽 배지가 밝은 이미지 위에 올라가면 읽히지 않는다 — 아주 옅은 스크림 */}
      {hasPhoto && <span className="cover-scrim" aria-hidden="true" />}
      {/* [961] 글래스 — 사진 위에서만 블러 + 한지 알약이 떠오른다(데스크톱 호버 전용, CSS 가 판정) */}
      {hasPhoto && (
        <span className="njn-glass" aria-hidden="true">
          <span>{card.kind === "note" ? "노트 읽기" : "글 읽기"}</span>
        </span>
      )}
      <span
        className={`absolute left-2 top-2 z-10 rounded-md bg-surface/90 chip-pad t-caption font-extrabold ${labelColor} ${
          card.kind === "note" && !card.lab && card.visited ? "njn-stamp njn-stamp--flat" : ""
        }`}
      >
        {card.kind === "note" && !card.lab && card.visited ? "직접 방문" : label}
      </span>
      {/* [945-G] 24시간 내 새 글 — "지금 살아 있는 피드"의 실측 신호.
          점멸은 reduced-motion 에서 정지(badge-new 등록). */}
      {Date.now() - card.createdAt < 24 * 3600_000 && !card.isExample && (
        <span className="badge-new absolute right-2 top-2 z-10 t-caption">NEW</span>
      )}
      {card.isExample && (
        <span className="absolute right-2 top-2 rounded-md bg-white/90 px-[3px] py-[2px]">
          <ExampleBadge />
        </span>
      )}
    </div>
  );
}

function FeedCardView({ card, delay }: { card: FeedCard; delay: number }) {
  return (
    <div className={`mb-3 break-inside-avoid rise-in-${Math.min(delay, 6)}`}>
      <Link
        href={card.href}
        className="card tile card-zoom group block overflow-hidden rounded-[14px] no-underline"
      >
        <Cover card={card} />
        {/* [961] 호버 — 커버 아래 주홍 밑줄이 왼쪽에서 차오른다(인터랙션 라이브러리 04) */}
        <span className="njn-card-bar" aria-hidden="true" />
        <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5">
          <div className="line-clamp-2 t-body font-extrabold text-ink">
            {card.boosted && (
              <span className="mr-1.5 inline-block align-middle rounded-md bg-primary-soft px-1.5 py-0.5 t-caption font-extrabold text-primary">
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
                  className="rounded-full bg-bg chip-pad t-caption font-semibold text-text-2"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
          {/* 지역을 작성자 뒤 메타 텍스트에서 **배지**로 올린다. (B20)
              동네이야기의 축은 지역인데, 목록에서 어느 동네 글인지 훑어지지 않았다.
              "홍길동 · 관양동" 처럼 이름 뒤에 붙어 있으면 눈이 그걸 찾지 않는다. */}
          {card.region && (
            <span className="w-fit rounded-md bg-primary-soft px-1.5 py-px t-caption font-extrabold text-primary">
              {card.region}
            </span>
          )}
          <div className="flex items-center justify-between t-sub text-text-3">
            <span className="min-w-0 truncate">{card.author}</span>
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
  const [kind, setKind] = useState<KindId>("all");
  const [sort, setSort] = useState<SortId>("reco");
  /* 내 관심지역 — 로그인 사용자만. 홈에서 정한 지역이 여기서 초기화되던 문제(B21).
     null = 아직 모름 / [] = 설정 안 함 → 칩을 그리지 않는다. */
  const [myRegions, setMyRegions] = useState<string[] | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => {
    let dead = false;
    getHomePersonal<{ primaryRegion: string | null; regions: string[] | null }>()
      .then((p) => {
        if (dead || !p) return;
        const list = [p.primaryRegion, ...(p.regions ?? [])]
          .map((r) => String(r ?? "").trim())
          .filter(Boolean);
        setMyRegions([...new Set(list)]);
      })
      .catch(() => {
        /* 개인화 실패 — 칩을 안 그린다. 빈 결과를 "내 지역 글이 없다"로 오인시키지 않는다. */
      });
    return () => {
      dead = true;
    };
  }, []);

  /* 카드의 region 표기("서울 강남구")와 관심지역 표기("강남구")가 다를 수 있어
     한쪽이 다른 쪽을 포함하면 같은 지역으로 본다. */
  const matchesMine = useCallback(
    (c: FeedCard) => {
      const list = myRegions ?? [];
      if (list.length === 0) return true;
      const r = (c.region ?? "").replace(/\s+/g, "");
      if (!r) return false;
      return list.some((m) => {
        const n = m.replace(/\s+/g, "");
        return n.length > 1 && (r.includes(n) || n.includes(r));
      });
    },
    [myRegions],
  );

  /* 각 칸의 실제 개수 — 눌러 보기 전에 결과 크기를 알 수 있게 한다.
     개수는 **유형**에만 붙인다(정렬은 같은 목록을 다시 세우는 것이라 수가 같다). */
  const counts = useMemo<Record<KindId, number>>(
    () => ({
      all: cards.length,
      note: cards.filter((c) => c.kind === "note").length,
      post: cards.filter((c) => c.kind === "post").length,
    }),
    [cards],
  );

  const mineCount = useMemo(
    () => (myRegions && myRegions.length > 0 ? cards.filter(matchesMine).length : 0),
    [cards, myRegions, matchesMine],
  );

  const visible = useMemo(() => {
    let list = onlyMine ? cards.filter(matchesMine) : cards;
    if (kind !== "all") list = list.filter((c) => c.kind === kind);
    /* 포인트 추천글은 정렬과 무관하게 맨 앞 — 배지('추천글')로 이유를 밝힌다 */
    const byBoost = (a: FeedCard, b: FeedCard) => Number(b.boosted ?? false) - Number(a.boosted ?? false);
    if (sort === "latest")
      return [...list].sort((a, b) => byBoost(a, b) || b.createdAt - a.createdAt);
    return [...list].sort((a, b) => byBoost(a, b) || recommendScore(b) - recommendScore(a));
  }, [cards, kind, sort, onlyMine, matchesMine]);

  return (
    <>
      {/* 유형(무엇) · 정렬(순서)를 두 줄로 가른다 — 한 줄에 섞여 있으면
          "임장노트를 최신순으로" 를 표현할 수 없다(B19). */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="seg" role="group" aria-label="글 유형">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
            >
              {k.label}
              <span className="t-num ml-1 opacity-70">{counts[k.id]}</span>
            </button>
          ))}
        </div>
        {/* 홈에서 정한 관심지역을 여기서도 쓴다 (B21) — 없으면 그리지 않는다.
            "0개"가 나오는 칩을 만들어 두면 눌러 보고 실망하게 된다. */}
        {myRegions && myRegions.length > 0 && mineCount > 0 && (
          <button
            type="button"
            aria-pressed={onlyMine}
            onClick={() => setOnlyMine((v) => !v)}
            className={`chip px-3 py-1.5 t-sub font-bold ${
              onlyMine ? "chip-active" : "border border-line bg-surface text-text-2"
            }`}
          >
            내 관심지역
            <span className="t-num ml-1 opacity-70">{mineCount}</span>
          </button>
        )}
        {/* 관심지역이 있으면 그 동네로 바로 글쓰기 (B22) — 매번 지역부터
            다시 고르게 하지 않는다. */}
        {myRegions && myRegions.length > 0 && (
          <Link
            href={`/town/write?region=${encodeURIComponent(myRegions[0])}`}
            className="ml-auto t-sub font-bold text-primary no-underline"
          >
            {myRegions[0]}에 글쓰기 ›
          </Link>
        )}
      </div>

      <div className="mb-3 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="seg" role="group" aria-label="정렬">
            {SORTS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={sort === o.id}
                onClick={() => setSort(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="t-sub text-text-3">
            {visible.length.toLocaleString("ko-KR")}개 표시 중
          </span>
        </div>
        {/* [B24] 추천의 **기준**을 적는다. 무엇이 위로 올라오는지 모르는 순위는
            "누가 밀어준 글"로 읽힌다 — 실제로는 위 recommendScore 가 전부다.
            좁은 화면에서 세그먼트 옆에 붙이면 잘리므로 제 줄을 준다. */}
        <span className="t-sub text-text-3">
          {sort === "reco"
            ? "최신 글이 먼저, 노트 평점·저장수만큼 위로 올라와요"
            : "올린 시각이 빠른 순서예요"}
        </span>
      </div>

      {loadFailed && (
        // 빨강 글씨 대신 배경으로 신호를 준다. --danger 토큰 자체는 이제 AA 를
        // 넘지만(#c62828, soft 위 4.83), 11px 안내문은 text-ink(14.24:1)가 확실히
        // 읽힌다 — 색은 "실패"라는 신호만 지고, 문장은 검정으로 읽는다.
        <div className="rise-in-2 mb-3 rounded-[10px] border border-line bg-danger-soft px-3.5 py-2.5 t-sub text-ink">
          일부 글을 불러오지 못했어요 (조회 실패). 글이 없다는 뜻은 아니에요 — 잠시 후
          새로고침해 주세요.
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rise-in-3 card flex flex-col items-center gap-2 px-5 py-12 text-center">
          <div className="t-title"><Icon name="📍" size={26} /></div>
          {/* 조회 실패로 목록이 비었을 때 "글이 없어요"라고 하면 사실이 아니다. */}
          <div className="t-section text-ink">
            {loadFailed
              ? "글을 불러오지 못했어요"
              : onlyMine
                ? "내 관심지역 글이 아직 없어요 — 첫 글을 남겨 보세요"
                : "이 조건의 글이 아직 없어요 — 첫 글을 남겨 보세요"}
          </div>
          <div className="t-sub text-text-3">
            {loadFailed
              ? "데이터 조회가 실패했습니다. 잠시 후 다시 시도해 주세요."
              : "첫 임장노트나 동네이야기를 남기면 가장 먼저 노출돼요"}
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
