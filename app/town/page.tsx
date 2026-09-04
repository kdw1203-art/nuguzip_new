import Link from "next/link";
import { CountUp } from "@/app/components/motion/CountUp";
import { BrandWatermark } from "@/app/components/BrandWatermark";
import { PageShell } from "../components/PageShell";
import { readTownPosts } from "@/lib/newui/board-posts";
import {
  listPublicNotes,
  inspectionAverageScore,
  isLabNoteLabel,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { maskNoteAuthor } from "./shared";
import { listHiddenPostIds } from "@/lib/moderation/reports-store";
import { TownFeed, type FeedCard } from "./feed-client";
import { AdZone } from "../components/ads/AdZone";
import type { Post } from "@/lib/types/post";
import { TownCategoryNav } from "./TownCategoryNav";
import { TownPromptCard } from "./TownPromptCard";
import { Icon } from "@/app/components/Icon";
import { TownExpertBand } from "./TownExpertBand";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { logger } from "@/lib/log";
import { postAttachments } from "@/lib/community/attachments";

export const metadata = buildPageMetadata({
  title: "동네이야기",
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

/* [B25] 동네별 활동량 — 8개 칩이 전부 같은 모양이라 "어디에 사람이 있는지"가
   안 보였다. 눌러 봐야 빈 동네인 걸 알게 되는 순서가 반복된다.
   여기서 세는 모수는 **이 피드에 실린 글**(공개 노트 40건 + 커뮤니티 글)이지
   그 동네의 전체 글이 아니다 — 그래서 화면에도 "최근 글 기준"이라고 적는다.
   숫자를 정확히 부르지 못할 바엔 무엇을 센 건지 밝히는 편이 낫다. */
function shortcutActivity(cards: FeedCard[], name: string): number {
  /* "성남 분당구" 처럼 두 토막인 이름은 두 토막이 **모두** 들어가야 그 동네다
     ("분당구"만 보면 다른 시의 동명 구가 섞이고, "성남"만 보면 수정구도 걸린다). */
  const parts = name.split(/\s+/).filter(Boolean);
  return cards.filter((c) => {
    const r = (c.region ?? "").replace(/\s+/g, "");
    return r.length > 0 && parts.every((p) => r.includes(p));
  }).length;
}

function noteToCard(n: InspectionNote): FeedCard {
  const oneLiner = n.summary?.trim() || n.sections.pros?.trim() || n.title;
  const lab = isLabNoteLabel(n.authorLabel);
  const tags: string[] = [];
  if (n.aptName?.trim()) tags.push(n.aptName.trim());
  /* [959] Lab 노트는 현장 방문이 아니라 데이터 카드 — "직접방문" 태그를 달지 않는다 */
  if (n.visitDate && !lab) tags.push("직접방문");
  if (lab) tags.push("데이터 분석");
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
    visited: Boolean(n.visitDate) && !lab,
    createdAt: Date.parse(n.createdAt) || 0,
    isExample: false,
    lab,
    aptName: n.aptName?.trim() || null,
  };
}

function postToCard(p: Post): FeedCard {
  const region = p.city && p.district ? `${p.city} ${p.district}` : p.city || "전국";
  return {
    id: p.id,
    href: `/town/news/${p.id}`,
    kind: "post",
    /* [B31] 첨부 사진의 첫 장이 커버다. 예전엔 무조건 null 이라 사진 우선
       격자에서 이야기 글만 늘 그라디언트 상자였다 — 저장은 되는데 읽는 코드가
       한 줄도 없던 값이다(lib/community/attachments.ts 주석 참고). */
    cover: postAttachments(p)[0] ?? null,
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

  /* [B25] 활동이 있는 동네를 앞으로. 같은 수면 원래 순서를 지킨다(임의 재배열 금지). */
  const shortcuts = TOWN_HOME_SHORTCUTS.map((r, i) => ({
    ...r,
    count: shortcutActivity(cards, r.name),
    order: i,
  })).sort((a, b) => b.count - a.count || a.order - b.order);

  /* 공작 등 가짜 예시 카드는 쓰지 않는다 — 0건이면 정직한 empty+CTA.
     (예시 배너 분기(exampleOnly)는 상수 false 로 영구 죽은 코드였다 — 제거) */
  /* [945-G] 히어로 실측 스탯 — 이 피드에 실린 카드 기준(전수 아님 — 라벨에 명시).
     지어내는 수치 없이 "지금 살아 있는 곳"이라는 감각만 만든다. */
  const now = Date.now();
  const todayCount = cards.filter((c) => now - c.createdAt < 24 * 3600_000).length;
  const weekCount = cards.filter((c) => now - c.createdAt < 7 * 24 * 3600_000).length;
  const hottest = shortcuts[0]?.count > 0 ? shortcuts[0] : null;

  return (
    <PageShell wide>
      {/* [959] 동네이야기 히어로 — 브랜드 네이비 면(전문가·AI 분석 허브와 같은 규칙).
          정적 제목 한 줄이 아니라 오늘의 활기(실측 카드 기준)와 글쓰기 출발점이 먼저 읽힌다. */}
      <section className="brand-navy-card rise-in mb-4 rounded-[18px] px-5 py-5 md:px-6">
        <BrandWatermark />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-[560px]">
            <span className="t-caption font-extrabold tracking-wider text-on-dark-muted">동네이야기</span>
            <h1 className="mt-1 t-display text-on-dark">
              다녀온 사람의 기록이 <span className="text-brand-red-dark">지금</span> 동네를 말합니다
            </h1>
            <p className="mt-1.5 t-body text-on-dark-muted">
              공개 임장노트와 이웃 글, 뉴스 요약·청약·공매·입주 물량까지 — 동네 단위로 모아 봅니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/town/write" className="btn-primary btn-cta rounded-xl px-4 py-2.5 t-body no-underline">
              글쓰기
            </Link>
            <Link href="/notes/new" className="brand-photo-chip rounded-xl px-4 py-2.5 t-body font-bold no-underline">
              임장노트 쓰기
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-on-dark-faint pt-3">
          <span className="t-sub text-on-dark-muted">
            오늘 새 글 <b className="t-num text-on-dark"><CountUp value={todayCount} /></b>
          </span>
          <span className="t-sub text-on-dark-muted">
            이번 주 <b className="t-num text-on-dark"><CountUp value={weekCount} /></b>
          </span>
          <span className="t-sub text-on-dark-muted">
            이 피드 <b className="t-num text-on-dark"><CountUp value={cards.length} /></b>건
          </span>
          {hottest && (
            <Link href={`/town/${hottest.id}`} className="t-sub text-on-dark-muted no-underline">
              가장 활발한 동네 <b className="text-brand-red-dark">{hottest.name} ›</b>
            </Link>
          )}
          <span className="t-caption text-on-dark-faint">지금 이 피드에 실린 글 기준</span>
        </div>
      </section>

      {/* 동네이야기 카테고리 — 청약·입주·공매 + 뉴스·자료·모임·전문가 (인터랙티브).
          목록은 lib/town/category-links.ts 단일 소스. 하위 7개 페이지도 같은 것을 쓴다. */}
      <TownCategoryNav />

      {/* [#64] 동네 홈 진입 — ?region= 필터 대신 지역별 정식 페이지로 */}
      {/* 지역 칩 — 줄바꿈으로 두 줄이 되면 카테고리 격자와 붙어 경계가 흐려진다.
          한 줄 가로 레일(스냅)로 고정한다. */}
      <div className="mb-4 flex items-center gap-2" data-reveal="">
        <span className="shrink-0">
          <span className="t-sub font-bold text-text-3">우리 동네 홈</span>
          <span className="ml-1 t-caption text-text-3">최근 글 기준</span>
        </span>
        <div className="rail-x -mx-1 px-1 py-0.5">
          {shortcuts.map((r, i) => (
            <Link
              key={r.id}
              href={`/town/${r.id}`}
              className={`chip tile border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline ${
                i === 0 && r.count > 0 ? "chip-heat" : ""
              }`}
            >
              {r.name}
              {r.count > 0 && (
                <span className="t-num ml-1 font-extrabold text-primary">{r.count}</span>
              )}
            </Link>
          ))}
          <Link
            href="/tx"
            className="chip tile border border-line bg-surface px-3 py-1.5 t-sub font-bold text-primary no-underline"
          >
            전체 지역 ›
          </Link>
        </div>
      </div>

      {/* [3차] 오늘의 동네 글감 — 유저 글 0의 원인(쓸 이유 없음)에 대한 직접 처방 */}
      <TownPromptCard />

      {/* [959] 전문가 모집·상담 띠 — 사람이 채우는 칸을 정직하게 "모집 중"으로 알린다 */}
      <TownExpertBand />

      {/* H3 광고 슬롯 — 서버에서 렌더해 피드 중간(8번째 카드 뒤)에 꽂는다.
          이 페이지도 revalidate=120 공유 캐시라 보는 사람의 플랜을 알 수 없어 plan={null}.
          유료 플랜의 광고 제거는 AdSlot 안의 AdFreeGate 가 클라이언트에서 처리한다(캐시 유지).
          등록 배너도 하우스 광고도 없으면 AdSlot 이 null 을 반환해 자리를 안 만든다. */}
      <TownFeed
        cards={cards}
        loadFailed={loadFailed}
        ad={<AdZone placement="community_feed" seed={0} plan={null} />}
      />

      {/* 모바일 글쓰기 FAB — [961] 네이비 원 + 주홍 파문(2.6초마다 조용히 "지금 쓸 수 있다") */}
      <Link
        href="/town/write"
        aria-label="글쓰기"
        className="njn-fab fixed right-[18px] z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full no-underline md:hidden"
        style={{ bottom: "calc(var(--nz-tabbar-offset) + 12px)" }}
      >
        <Icon name="notebook-pen" size={22} />
      </Link>
    </PageShell>
  );
}
