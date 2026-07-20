"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { ExampleBadge } from "../components/ExampleBadge";

/* 시안 22a — 발견 피드 클라이언트: 필터 칩 + 2열 매소너리 + 6번째마다 시세 데이터 카드 */

export type DiscoverCard = {
  id: string;
  title: string;
  aptName: string | null;
  region: string;
  author: string;
  saves: number;
  visited: boolean;
  size: "tall" | "short" | "mid";
  ratings: { icon: string; grade: "상" | "중" | "하" }[];
  createdAt: number;
  isReal: boolean;
  /** 단지 허브(/complex/[id]) 링크 — 실 id를 못 찾으면 null → 링크 숨김 */
  complexHref?: string | null;
};

const FILTERS = ["추천", "팔로잉", "최신", "📍 관양동"] as const;
type Filter = (typeof FILTERS)[number];

/* 22a #7 — 피드에 삽입되는 시세 데이터 카드 (콘텐츠↔시세 교차, 광고 아님)
   더미 1개 원칙: 시세 실데이터 미연결 — 예시 샘플 1건만 1회 삽입 */
const MARKET_CARD = {
  label: "관양동 전세",
  delta: "-0.3%",
  meta: "실거래 12건",
  down: true,
};

const COVER_H: Record<DiscoverCard["size"], string> = {
  tall: "h-[150px]",
  mid: "h-[110px]",
  short: "h-[72px]",
};

const GRADE_CLASS: Record<"상" | "중" | "하", string> = {
  상: "text-[#1a7f4e] font-bold",
  중: "text-text-3",
  하: "text-danger font-bold",
};

function NoteCard({ card, delay }: { card: DiscoverCard; delay: number }) {
  return (
    <div
      className={`card card-hover mb-3 break-inside-avoid overflow-hidden rise-in-${Math.min(delay, 6)}`}
    >
      <Link href={`/notes/${card.id}`} className="block">
        <div
          className={`relative w-full bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef] ${COVER_H[card.size]}`}
        >
          <span className="absolute left-2 top-2 rounded-[5px] bg-white/90 px-[7px] py-[2px] text-[10px] font-extrabold text-[#1a7f4e]">
            {card.visited ? "✓ 직접 방문" : "자료 정리"}
          </span>
          {/* 더미데이터 정책: 목업 카드에만 작은 "예시" 배지 */}
          {!card.isReal && (
            <span className="absolute right-2 top-2 rounded-[5px] bg-white/90 px-[3px] py-[2px]">
              <ExampleBadge />
            </span>
          )}
        </div>
        <div className="flex flex-col gap-[5px] px-3 pb-2 pt-[10px]">
          <div className="text-[12px] font-extrabold leading-[1.4] text-ink">
            {card.title}
          </div>
          <div className="flex gap-[5px] text-[10px]">
            {card.ratings.map((r) => (
              <span key={r.icon} className={GRADE_CLASS[r.grade]}>
                {r.icon}
                {r.grade}
              </span>
            ))}
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between px-3 pb-[10px] text-[10px] text-text-3">
        {/* 예시 카드(mock-*)의 작성자는 실프로필이 없어 404 — 실데이터만 링크 */}
        {card.id.startsWith("mock-") ? (
          <span className="font-semibold">{card.author}</span>
        ) : (
          <Link
            href={`/u/${encodeURIComponent(card.author)}`}
            className="font-semibold hover:text-primary"
          >
            {card.author}
          </Link>
        )}
        <span>🔖 {card.saves}</span>
      </div>
      {card.aptName && card.complexHref && (
        <Link
          href={card.complexHref}
          className="block border-t border-line px-3 py-[7px] text-[10px] font-bold text-primary"
        >
          🏢 {card.aptName} 단지 허브 ›
        </Link>
      )}
    </div>
  );
}

function MarketCard() {
  const m = MARKET_CARD;
  return (
    <div className="mb-3 break-inside-avoid rounded-[16px] bg-ink/[0.96] p-[13px]">
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-[#7ea2ff]">
        이 동네 시세
        {/* 시세 실데이터 미연결 — 예시 수치 (허위 수치 오인 방지) */}
        <span className="inline-flex items-center rounded border border-white/20 px-1 py-px text-[9px] font-semibold text-[#9aa6b8]">
          예시
        </span>
      </div>
      <div className="mt-1 text-[13px] font-extrabold text-white">
        {m.label}{" "}
        <span className={m.down ? "text-[#7ea2ff]" : "text-[#ff8f8f]"}>
          {m.delta}
        </span>
      </div>
      <Link
        href="/town/market"
        className="mt-1 block text-[10px] text-[#9aa6b8] hover:text-white"
      >
        {m.meta} · 자세히 ›
      </Link>
    </div>
  );
}

export function DiscoverClient({ cards }: { cards: DiscoverCard[] }) {
  const [filter, setFilter] = useState<Filter>("추천");
  // 더미 1개 원칙: 실데이터 0건일 때 서버가 예시 샘플 1건만 내려보냄
  const exampleOnly = cards.length > 0 && cards.every((c) => !c.isReal);

  const visible = useMemo(() => {
    if (filter === "최신")
      return [...cards].sort((a, b) => b.createdAt - a.createdAt);
    if (filter === "📍 관양동")
      return cards.filter((c) => c.region.includes("관양"));
    // 추천: 인기 가중 (저장 수)
    return [...cards].sort((a, b) => b.saves - a.saves);
  }, [cards, filter]);

  // 시세 데이터 카드는 5번째 카드 뒤 1회만 삽입 (예시 수치 반복 노출 방지)
  const feed: React.ReactNode[] = [];
  visible.forEach((card, i) => {
    feed.push(<NoteCard key={card.id} card={card} delay={(i % 6) + 1} />);
    if (i === 4) {
      feed.push(<MarketCard key="market-0" />);
    }
  });

  return (
    <PageShell title="오늘의 임장" wide>
      {/* 22a #6 — 비로그인 열람 허용 + 데이터 훅 바 */}
      <div className="rise-in mb-3 flex items-center justify-between rounded-[12px] border border-line bg-primary-soft px-4 py-[10px]">
        <span className="text-[12px] font-bold text-primary">
          로그인 없이 둘러보는 중 — 저장·팔로우는 가입 후 이어져요
        </span>
        <Link href="/login" className="text-[12px] font-extrabold text-primary">
          시작하기 ›
        </Link>
      </div>

      {/* 필터 칩: 추천 / 팔로잉 / 최신 / 📍지역 */}
      <div className="rise-in-2 mb-3 flex gap-[6px] overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={filter === f ? "chip-active shrink-0" : "chip shrink-0"}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 22a #10 — 주간 베스트 10 고정 컬렉션 배너 */}
      <Link
        href="/notes"
        className="rise-in-3 mb-3 flex items-center justify-between rounded-[14px] border border-line bg-surface px-[13px] py-[11px]"
      >
        <span className="text-[13px] font-extrabold text-ink">
          🏆 이번 주 베스트 노트 10
        </span>
        <span className="text-[12px] font-bold text-primary">모두 보기 ›</span>
      </Link>

      {filter === "팔로잉" ? (
        /* 팔로잉 탭 — 팔로우 미연결 시 빈 상태 + 대안 행동 */
        <div className="rise-in-4 card flex flex-col items-center gap-2 px-5 py-10 text-center">
          <div className="text-[26px]">✦</div>
          <div className="text-[15px] font-extrabold text-ink">
            팔로잉 피드는 로그인 후 채워져요
          </div>
          <div className="text-[12px] text-text-3">
            마음에 드는 임장러를 팔로우하면 새 노트가 여기에 모여요
          </div>
          <Link href="/login" className="btn-primary btn-md mt-2">
            로그인하고 팔로우 시작
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="rise-in-4 card flex flex-col items-center gap-2 px-5 py-10 text-center">
          <div className="text-[26px]">📍</div>
          <div className="text-[15px] font-extrabold text-ink">
            이 지역 공개 노트가 아직 없어요
          </div>
          <div className="text-[12px] text-text-3">
            첫 임장노트를 남기면 24시간 노출 부스트를 받아요
          </div>
          <Link href="/notes/new" className="btn-primary btn-md mt-2">
            첫 노트 쓰기
          </Link>
        </div>
      ) : (
        <>
          {exampleOnly && (
            <div className="rise-in-4 mb-3 flex items-center gap-1.5 rounded-[12px] border border-line bg-surface px-3.5 py-2.5 text-[11px] text-text-3">
              <ExampleBadge />
              <span>
                아직 공개된 임장노트가 없어 샘플 1건을 보여드려요 — 실데이터가
                쌓이면 자동으로 교체됩니다.
              </span>
            </div>
          )}
          {/* 2열 매소너리 — 데스크탑 4열 */}
          <div className="columns-2 gap-3 md:columns-4">{feed}</div>
        </>
      )}
    </PageShell>
  );
}
