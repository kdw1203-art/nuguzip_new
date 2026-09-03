import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { ExampleBadge } from "../../components/ExampleBadge";
import { readTownPosts } from "@/lib/newui/board-posts";
import { COMMUNITY_SUBCATEGORIES, matchSubcategory } from "@/lib/subcategories";
import { seedGradient, faviconUrl, hostOf, relativeTime, newsImageUrl } from "../shared";
import type { Post } from "@/lib/types/post";
import { Icon } from "@/app/components/Icon";
import { getWeeklyDigest, type WeeklyDigest } from "@/lib/newui/digest";
import { clusterNews } from "@/lib/news/cluster";
import { NEWS_TAGS } from "@/lib/news/tags";
import { TownCategoryNav } from "../TownCategoryNav";
import { NewsListClient } from "./NewsListClient";
import { NewsAlertSubscribe } from "./NewsAlertSubscribe";
import { ErrorState } from "@/app/components/ui";
import { logger } from "@/lib/log";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 뉴스·다이제스트(#6·#7) — 부동산 뉴스 그리드 상단에 주간 다이제스트 요약을 합쳤다.
   · 주간 다이제스트: getWeeklyDigest() 요약 카드(실패·빈 데이터 시 섹션 생략, fail-soft).
   · 썸네일: 자동수집 automation_meta 에 og:image 등이 실려오면 실이미지 커버,
     없으면 출처 기반 그라디언트 + 파비콘 + 아이콘 플레이스홀더로 폴백.
   제목 · 출처 · 시간, 지역 필터 지원. */

/* 비용 실측(2026-08-10): 서버가 ?region= 을 읽는 동안 이 라우트는 영구 동적이라
   크롤 1회 = 함수 호출 1회였다. 지역 필터를 NewsListClient(클라이언트)로 옮겨
   서버 렌더를 지역과 무관하게 만들고 ISR 로 전환한다. 뉴스 적재는 하루 1회라
   10분 재검증이면 충분하다. 상대 시각 라벨도 그만큼 낡을 수 있다. */
export const revalidate = 600;

/* N7 — ?region= 으로 목록만 좁히는 값이라 조합마다 색인되면 안 된다. canonical 고정. */
export const metadata = buildPageMetadata({
  title: "부동산 뉴스 · 주간 다이제스트",
  description:
    "부동산 뉴스와 이번 주 실거래 다이제스트를 한곳에서. 출처와 게시 시각을 함께 표시합니다.",
  path: "/town/news",
  og: { badge: "뉴스", sub: "부동산 뉴스 · 주간 다이제스트 · 키워드 알림" },
});

const NEWS_SUB = COMMUNITY_SUBCATEGORIES.find((s) => s.id === "news");

function isNewsPost(p: Post): boolean {
  if (p.isAutomated) return true;
  if (!NEWS_SUB) return false;
  return matchSubcategory(NEWS_SUB, [p.category, p.title, ...(p.tags ?? [])]);
}

function displayIso(p: Post): string {
  return p.sourcePublishedAt || p.createdAt;
}


/* Thumb 는 NewsListClient 로 이동(2026-08-10 ISR 전환) — newsImageUrl 등
   썸네일 URL 추출은 상세 페이지와 공유하는 ../shared 그대로. */


/* 주간 다이제스트 요약 라인 — 뉴스·시세·커뮤니티 건수(있는 항목만) */
function digestSummaryLine(d: WeeklyDigest): string {
  const parts: string[] = [];
  if (d.news.length > 0) parts.push(`뉴스 ${d.news.length}건`);
  if (d.market.length > 0) parts.push(`주요 지역 시세 ${d.market.length}곳`);
  if (d.community.count > 0) parts.push(`이웃 글 ${d.community.count}건`);
  return parts.length > 0
    ? `이번 주 ${parts.join(" · ")}`
    : "이번 주 요약을 준비 중이에요";
}

/* 다이제스트 티저 — 최신 뉴스 제목(없으면 시장 요약) */
function digestTeaserOf(d: WeeklyDigest): string | null {
  if (d.news.length > 0) return d.news[0].title;
  if (d.market.length > 0) return `${d.market[0].name} 등 주요 지역 시세 요약`;
  return null;
}

/* 더미데이터 정책(더미 1개 원칙): 실 뉴스 0건일 때만 예시 카드 1건 노출 */
const EXAMPLE_NEWS = {
  category: "안내",
  title: "예시 카드 — 실제 정책·공지 뉴스가 아직 없을 때 레이아웃만 보여 줍니다",
  sourceName: "내집나우 예시(공식 출처 아님)",
  time: "예시",
};

export default async function TownNewsPage() {

  /* 주간 다이제스트 요약 (#6: 뉴스·다이제스트 통합) — 실패·빈 데이터 시 섹션 생략(fail-soft) */
  let digest: WeeklyDigest | null = null;
  try {
    digest = await getWeeklyDigest();
  } catch {
    digest = null;
  }
  /* 섹션이 하나라도 조회 실패면 요약 카드를 아예 접는다 — 실패한 섹션을 뺀
     숫자를 "이번 주 요약"이라고 내걸면 축소된 사실을 사실처럼 말하는 셈이다. */
  const digestReadOk =
    digest !== null &&
    !digest.failed.news &&
    !digest.failed.market &&
    !digest.failed.community;
  const digestHasContent =
    digestReadOk &&
    digest !== null &&
    (digest.news.length > 0 ||
      digest.market.length > 0 ||
      digest.community.count > 0);
  const digestTeaser =
    digest && digestHasContent ? digestTeaserOf(digest) : null;

  /* 이 페이지는 revalidate 가 있어 프리렌더 대상이다 — 던지면 배포가 깨지므로
     잡는다. 다만 실패를 빈 목록으로 뭉개지 않는다: newsFailed 로 들고 가서
     "아직 수집된 뉴스가 없어요"(예시 카드)와 다르게 말한다. 예시 카드를 깔면
     못 읽은 상태가 "뉴스가 없는 상태"로 둔갑한다. */
  let news: Post[] = [];
  let newsFailed = false;
  try {
    const all = await readTownPosts();
    news = all
      .filter(isNewsPost)
      .sort(
        (a, b) =>
          new Date(displayIso(b)).getTime() - new Date(displayIso(a)).getTime(),
      );
  } catch (e) {
    logger.error("[TownNewsPage] 뉴스 조회 실패", e);
    news = [];
    newsFailed = true;
  }

  /* 지역 필터 — 실데이터 기반(뉴스 city 상위 목록). 거르는 건 클라이언트. */
  const regions = [...new Set(news.map((p) => p.city).filter(Boolean))].slice(0, 8);

  /* [#67] 동일 사건 클러스터링 — 같은 발표를 다룬 기사들을 대표 1건 + "관련 보도 N건"
     으로 접는다(렌더 계층 처리 — 수집 원본은 전부 보존, 각 기사 상세도 그대로).
     대표는 클러스터 내 최신 기사. */
  const byId = new Map(news.map((p) => [p.id, p]));
  const clusters = clusterNews(
    news.map((p) => ({ id: p.id, title: p.title, timeMs: Date.parse(displayIso(p)) || 0 })),
  );

  /* 최신 60장 상한(전량 299장·1.29MB 실측 후 도입) — 자른 사실은 목록 끝에 명시.
     카드는 평탄화(DTO)해서 원본 메타를 클라이언트 payload 에 싣지 않는다.
     상한은 이제 "클러스터 60개" — 관련 보도는 카드 안에 접혀 있어 payload 부담이 작다. */
  const LIST_CAP = 60;
  const cappedClusters = clusters.slice(0, LIST_CAP);
  const visibleArticles = cappedClusters.reduce((s, c) => s + 1 + c.related.length, 0);
  const hiddenCount = Math.max(news.length - visibleArticles, 0);
  const cards = cappedClusters.map((c, i) => {
    const p = byId.get(c.primary.id)!;
    return {
      id: p.id,
      title: p.title,
      body: i === 0 ? (p.body ?? null) : null,
      category: p.category ?? "",
      city: p.city ?? "",
      source: p.sourceName || p.authorLabel || "",
      timeLabel: relativeTime(displayIso(p)),
      host: hostOf(p.sourceUrl),
      image: newsImageUrl(p),
      favicon: faviconUrl(p.sourceUrl),
      related: c.related.slice(0, 4).map((r) => {
        const rp = byId.get(r.id)!;
        return {
          id: rp.id,
          title: rp.title,
          source: rp.sourceName || rp.authorLabel || "",
          timeLabel: relativeTime(displayIso(rp)),
        };
      }),
    };
  });
  const isMock = news.length === 0 && !newsFailed;

  return (
    <PageShell breadcrumb="동네이야기 › 뉴스">
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in t-title text-ink">뉴스</h1>
        <Link href="/town/library" className="t-body font-bold text-primary">
          자료·리포트 ›
        </Link>
      </div>

      {/* 주간 다이제스트 요약 (#6) — 뉴스·다이제스트 통합. 실패·빈 데이터 시 생략(fail-soft) */}
      {digest && digestHasContent && (
        <Link
          href="/digest"
          className="rise-in ai-panel mb-4 flex items-center justify-between gap-3 rounded-[18px] p-5 no-underline"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5 t-sub font-extrabold text-ai-accent">
              <Icon name="file-text" size={14} />
              주간 다이제스트
              <span className="rounded bg-white/10 px-1.5 py-px t-caption text-ai-text">
                {digest.weekLabel}
              </span>
            </div>
            <div className="t-section text-white">
              {digestSummaryLine(digest)}
            </div>
            {digestTeaser && (
              <div className="truncate text-xs text-ai-text">{digestTeaser}</div>
            )}
          </div>
          <span
            className="shrink-0 rounded-[10px] bg-white/15 px-3.5 py-2 text-xs font-bold text-white"
            style={{ color: "#fff" }}
          >
            전체 보기 ›
          </span>
        </Link>
      )}

      {/* [개선 #13] 키워드 알림 구독 — 뉴스가 매일 쌓이는 이 화면이 구독 전환의 최적 지점 */}
      <NewsAlertSubscribe />

      {/* [#103] 주제 허브 진입 — 클러스터·요약을 재활용하는 색인 표면 20개 */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-1.5">
        <span className="t-sub font-bold text-text-3">주제별</span>
        {NEWS_TAGS.slice(0, 10).map((t) => (
          <Link
            key={t.slug}
            href={`/town/news/tag/${t.slug}`}
            className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2"
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* 뉴스 목록 + 지역 필터 — 클라이언트(NewsListClient). SSR 은 항상 전체
          60건을 HTML 에 그리고, 필터는 마운트 후 location.search 로 적용한다
          (useSearchParams 는 프리렌더에서 Suspense 폴백을 박아 카드 0건 HTML 을
          만들었다 — 배포 실측 후 교체). */}
      {isMock ? (
        <div className="rise-in card mb-5 overflow-hidden rounded-[18px]">
          <div
            className="relative h-[200px] w-full"
            style={{ background: seedGradient("molit") }}
          >
            <span className="absolute left-2 top-2 rounded-md bg-primary-soft chip-pad t-caption font-extrabold text-primary">
              {EXAMPLE_NEWS.category}
            </span>
            <span className="absolute right-2 top-2 rounded-md bg-white/90 px-[3px] py-[2px]">
              <ExampleBadge />
            </span>
          </div>
          <div className="flex flex-col gap-2 p-5">
            <h2 className="t-section text-ink">
              {EXAMPLE_NEWS.title}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-text-3">
              <span className="font-semibold text-text-2">
                {EXAMPLE_NEWS.sourceName}
              </span>
              <ExampleBadge />
            </div>
            <p className="t-sub text-text-3">
              아직 수집된 뉴스가 없어 예시 1건을 보여드려요 — 새 뉴스가 수집되면
              자동으로 교체됩니다.
            </p>
          </div>
        </div>
      ) : newsFailed ? (
        <div className="rise-in mb-5">
          <ErrorState
            title="뉴스를 불러오지 못했어요"
            desc="데이터 조회가 실패했습니다. 수집된 뉴스가 없다는 뜻은 아니에요. 잠시 후 다시 열어봐 주세요."
            action={{ label: "동네 이야기 보기", href: "/town" }}
          />
        </div>
      ) : (
        <NewsListClient
          cards={cards}
          regions={regions}
          hiddenCount={hiddenCount}
          listCap={LIST_CAP}
        />
      )}
    </PageShell>
  );
}
