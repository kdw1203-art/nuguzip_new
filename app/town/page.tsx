import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { readTownPosts } from "@/lib/newui/board-posts";
import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { maskNoteAuthor } from "./shared";
import { listHiddenPostIds } from "@/lib/moderation/reports-store";
import { TownFeed, type FeedCard } from "./feed-client";
import { AdSlot } from "../components/ads/AdSlot";
import type { Post } from "@/lib/types/post";
import { TownCategoryNav } from "./TownCategoryNav";
import { TownPromptCard } from "./TownPromptCard";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { logger } from "@/lib/log";

export const metadata = buildPageMetadata({
  title: "동네 이야기",
  description:
    "우리 동네 커뮤니티 글과 공개 임장노트를 한 피드에서. 사진으로 먼저 보고 관심 단지로 이어집니다.",
  path: "/town",
  og: { badge: "동네이야기", sub: "동네 글 · 공개 임장노트 피드" },
});

/* 동네이야기 통합 피드(#5) — 기존 피드 + 발견 피드를 하나로 합친 사진 우선 카드 그리드.
   공개 임장노트(사진 우선) + 커뮤니티 글을 섞어 오늘의집/인스타그램형으로 노출.
   상단엔 동네이야기 하위 영역(뉴스·자료·모임·전문가) + 입주/공매/청약을 카테고리 카드로 통합. */

export const revalidate = 120;

/* [#64] 동네 홈 바로가기 — 노트·글이 실제로 있는 지역 위주 8곳 (수동 선정).
   전체 62곳은 각 동네 홈 하단의 "다른 동네" 칩으로 이동한다. */
const TOWN_HOME_SHORTCUTS = [
  { id: "gangnam", name: "강남구" },
  { id: "nowon", name: "노원구" },
  { id: "mapo", name: "마포구" },
  { id: "songpa", name: "송파구" },
  { id: "seongnam-bundang", name: "성남 분당구" },
  { id: "suwon-yeongtong", name: "수원 영통구" },
  { id: "goyang-deogyang", name: "고양 덕양구" },
  { id: "incheon-yeonsu", name: "인천 연수구" },
] as const;

function noteToCard(n: InspectionNote): FeedCard {
  const oneLiner = n.summary?.trim() || n.sections.pros?.trim() || n.title;
  const tags: string[] = [];
  if (n.aptName?.trim()) tags.push(n.aptName.trim());
  if (n.visitDate) tags.push("직접방문");
  if (n.metadata?.visitVerified) tags.push("현장 인증"); // [#71]
  // 허수 제거(#9): 예전의 "저장수 = 평균 평점×40 + 체크 수" 계산식을 없앴다.
  // 노트에는 실측 저장 지표가 없으므로 saves 미표시, 실데이터인 평균 평점만 노출.
  const rating = inspectionAverageScore(n.scores);
  return {
    id: n.id,
    href: `/notes/${n.id}`,
    kind: "note",
    cover: n.photos.find(Boolean) ?? null,
    title: oneLiner.length > 40 ? `${oneLiner.slice(0, 40)}…` : oneLiner,
    author: maskNoteAuthor(n.authorLabel, n.authorEmail),
    region: n.region || "전국",
    rating: rating > 0 ? rating : null,
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
    /* 저장(북마크)만 — 좋아요로 채워 저장 지표를 부풀리지 않는다 */
    saves: typeof p.bookmarkCount === "number" ? p.bookmarkCount : undefined,
    tags: p.tags ?? [],
    visited: false,
    createdAt: Date.parse(p.createdAt) || 0,
    isExample: false,
    /* 포인트 추천글 부스트 — 만료(과거)면 자연 소멸이라 false */
    boosted: Boolean(p.boostUntil && Date.parse(p.boostUntil) > Date.now()),
  };
}

export default async function TownPage() {
  /* 실데이터: 공개 임장노트(사진 우선) + 커뮤니티 글(비자동 posts). 뉴스(자동수집)는 /town/news로 분리.
     이 페이지는 revalidate 가 있어 `next build` 가 프리렌더한다 — 여기서 던지면
     DB 가 잠깐 흔들린 것만으로 배포가 깨진다. 그래서 잡되, **삼키지는 않는다**:
     실패는 loadFailed 로 화면까지 들고 가서 "글이 없어요"와 다르게 말한다. */
  const [notesR, postsR] = await Promise.allSettled([
    listPublicNotes(40),
    readTownPosts(),
  ]);
  if (notesR.status === "rejected") logger.error("[TownPage] 임장노트 조회 실패", notesR.reason);
  if (postsR.status === "rejected") logger.error("[TownPage] 이웃 글 조회 실패", postsR.reason);
  const notes: InspectionNote[] = notesR.status === "fulfilled" ? notesR.value : [];
  const posts: Post[] = postsR.status === "fulfilled" ? postsR.value : [];
  const loadFailed = notesR.status === "rejected" || postsR.status === "rejected";

  const noteCards = notes.map(noteToCard);
  // 신고 누적/처리로 숨김된 글(posts.visibility="hidden")은 피드에서 제외(#7)
  const communityPosts = posts.filter((p) => !p.isAutomated);
  const hiddenIds = await listHiddenPostIds(communityPosts.map((p) => p.id)).catch(
    () => new Set<string>(),
  );
  const postCards = communityPosts.filter((p) => !hiddenIds.has(p.id)).map(postToCard);

  /* 노트·글을 섞어 최신순 기본 정렬 (클라이언트에서 추천/최신/유형별 재정렬) */
  const cards: FeedCard[] = [...noteCards, ...postCards].sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  /* 공작 등 가짜 예시 카드는 쓰지 않는다 — 0건이면 정직한 empty+CTA.
     (예시 배너 분기(exampleOnly)는 상수 false 로 영구 죽은 코드였다 — 제거) */
  return (
    <PageShell wide>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in t-title text-ink">동네이야기</h1>
        <Link
          href="/town/write"
          className="btn-primary btn-cta hidden px-4 py-[9px] t-body md:block"
        >
          글쓰기
        </Link>
      </div>

      {/* 동네이야기 카테고리 — 청약·입주·공매 + 뉴스·자료·모임·전문가 (인터랙티브).
          목록은 lib/town/category-links.ts 단일 소스. 하위 7개 페이지도 같은 것을 쓴다. */}
      <TownCategoryNav />

      {/* [#64] 동네 홈 진입 — ?region= 필터 대신 지역별 정식 페이지로 */}
      <div className="rise-in-1 mb-4 flex flex-wrap items-center gap-1.5">
        <span className="t-sub font-bold text-text-3">우리 동네 홈:</span>
        {TOWN_HOME_SHORTCUTS.map((r) => (
          <Link
            key={r.id}
            href={`/town/${r.id}`}
            className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2"
          >
            {r.name}
          </Link>
        ))}
        <Link
          href="/tx"
          className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-primary"
        >
          전체 지역 보기 ›
        </Link>
      </div>

      {/* [3차] 오늘의 동네 글감 — 유저 글 0의 원인(쓸 이유 없음)에 대한 직접 처방 */}
      <TownPromptCard />

      {/* H3 광고 슬롯 — 서버에서 렌더해 피드 중간(8번째 카드 뒤)에 꽂는다.
          이 페이지도 revalidate=120 공유 캐시라 보는 사람의 플랜을 알 수 없어 plan={null}.
          유료 플랜의 광고 제거는 AdSlot 안의 AdFreeGate 가 클라이언트에서 처리한다(캐시 유지).
          등록 배너도 하우스 광고도 없으면 AdSlot 이 null 을 반환해 자리를 안 만든다. */}
      <TownFeed
        cards={cards}
        loadFailed={loadFailed}
        ad={<AdSlot placement="community_feed" seed={0} plan={null} />}
      />

      {/* 모바일 글쓰기 FAB */}
      <Link
        href="/town/write"
        aria-label="글쓰기"
        className="btn-primary fixed right-[18px] z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full t-title md:hidden"
        style={{
          bottom: "calc(var(--nz-tabbar-offset) + 12px)",
          boxShadow: "0 10px 24px rgba(29,79,216,.45)",
        }}
      >
        ✎
      </Link>
    </PageShell>
  );
}
