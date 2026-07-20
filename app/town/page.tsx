import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { readTownPosts } from "@/lib/newui/board-posts";
import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { maskNoteAuthor } from "./shared";
import { TownFeed, type FeedCard } from "./feed-client";
import type { Post } from "@/lib/types/post";

/* 동네이야기 통합 피드(#5) — 기존 피드 + 발견 피드를 하나로 합친 사진 우선 카드 그리드.
   공개 임장노트(사진 우선) + 커뮤니티 글을 섞어 오늘의집/인스타그램형으로 노출.
   상단엔 동네이야기 하위 영역(뉴스·자료·모임·전문가) + 입주/공매/청약을 카테고리 카드로 통합. */

export const revalidate = 120;

/* 동네이야기 카테고리 통합(#5·입주/공매/청약 편입) — 랜딩 상단 바로가기 카드 */
const TOWN_LINKS: { href: string; label: string; icon: string; desc: string }[] = [
  { href: "/town/news", label: "뉴스", icon: "📰", desc: "부동산 뉴스" },
  { href: "/town/library", label: "자료", icon: "📁", desc: "리포트·노트·다이제스트" },
  { href: "/town/groups", label: "임장 모임", icon: "🧭", desc: "함께 임장" },
  { href: "/town/experts", label: "전문가", icon: "🎓", desc: "검증된 상담" },
  { href: "/supply", label: "입주 물량", icon: "🏗️", desc: "공급 캘린더" },
  { href: "/auctions", label: "공매 물건", icon: "🔨", desc: "온비드 공매" },
  { href: "/apply", label: "청약 센터", icon: "🎟️", desc: "분양·경쟁률" },
  { href: "/digest", label: "다이제스트", icon: "🗞️", desc: "주간 요약" },
];

/* 더미데이터 정책(더미 1개 원칙): 실데이터 0건일 때만 예시 카드 1건 노출 */
const EXAMPLE_CARD: FeedCard = {
  id: "mock-feed-1",
  href: "/town/write",
  kind: "note",
  cover: null,
  title: "채광은 확실, 주차가 관건 — 공작 302동 임장 후기",
  author: "임장러버",
  region: "안양 관양동",
  saves: 214,
  tags: ["임장", "후기"],
  visited: true,
  createdAt: Date.now(),
  isExample: true,
};

function noteToCard(n: InspectionNote): FeedCard {
  const oneLiner = n.summary?.trim() || n.sections.pros?.trim() || n.title;
  const doneCount = n.checklist.filter((c) => c.done).length;
  const tags: string[] = [];
  if (n.aptName?.trim()) tags.push(n.aptName.trim());
  if (n.visitDate) tags.push("직접방문");
  return {
    id: n.id,
    href: `/notes/${n.id}`,
    kind: "note",
    cover: n.photos.find(Boolean) ?? null,
    title: oneLiner.length > 40 ? `${oneLiner.slice(0, 40)}…` : oneLiner,
    author: maskNoteAuthor(n.authorLabel, n.authorEmail),
    region: n.region || "전국",
    saves: Math.round(inspectionAverageScore(n.scores) * 40) + doneCount,
    tags,
    visited: Boolean(n.visitDate),
    createdAt: Date.parse(n.createdAt) || 0,
    isExample: false,
  };
}

function postToCard(p: Post): FeedCard {
  const region = p.city && p.district ? `${p.city} ${p.district}` : p.city || "전국";
  return {
    id: p.id,
    href: `/town/news/${p.id}`,
    kind: "post",
    cover: null,
    title: p.title,
    author: p.authorLabel || "이웃",
    region,
    saves: p.bookmarkCount ?? p.likeCount ?? 0,
    tags: p.tags ?? [],
    visited: false,
    createdAt: Date.parse(p.createdAt) || 0,
    isExample: false,
  };
}

export default async function TownPage() {
  /* 실데이터: 공개 임장노트(사진 우선) + 커뮤니티 글(비자동 posts). 뉴스(자동수집)는 /town/news로 분리. */
  const [notes, posts] = await Promise.all([
    listPublicNotes(40).catch((): InspectionNote[] => []),
    readTownPosts().catch((): Post[] => []),
  ]);

  const noteCards = notes.map(noteToCard);
  const postCards = posts.filter((p) => !p.isAutomated).map(postToCard);

  /* 노트·글을 섞어 최신순 기본 정렬 (클라이언트에서 추천/최신/유형별 재정렬) */
  let cards: FeedCard[] = [...noteCards, ...postCards].sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  const exampleOnly = cards.length === 0;
  if (exampleOnly) cards = [EXAMPLE_CARD];

  return (
    <PageShell wide>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">동네이야기</h1>
        <Link
          href="/town/write"
          className="btn-primary btn-cta hidden px-4 py-[9px] text-[13px] md:block"
        >
          글쓰기
        </Link>
      </div>

      {/* 동네이야기 카테고리 통합 — 뉴스·자료·모임·전문가 + 입주/공매/청약 */}
      <div className="rise-in mb-5 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TOWN_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="card card-hover flex min-w-[118px] shrink-0 flex-col gap-1 rounded-[16px] px-4 py-3.5"
          >
            <span className="text-[20px] leading-none">{l.icon}</span>
            <span className="mt-1 text-[13px] font-extrabold text-ink">{l.label}</span>
            <span className="text-[11px] leading-[1.4] text-text-3">{l.desc}</span>
          </Link>
        ))}
      </div>

      <TownFeed cards={cards} exampleOnly={exampleOnly} />

      {/* 모바일 글쓰기 FAB */}
      <Link
        href="/town/write"
        aria-label="글쓰기"
        className="btn-primary fixed bottom-28 right-[18px] z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full text-[22px] md:hidden"
        style={{ boxShadow: "0 10px 24px rgba(29,79,216,.45)" }}
      >
        ✎
      </Link>
    </PageShell>
  );
}
