import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { ExampleBadge } from "../../components/ExampleBadge";
import { readTownPosts } from "@/lib/newui/board-posts";
import { COMMUNITY_SUBCATEGORIES, matchSubcategory } from "@/lib/subcategories";
import { seedGradient, faviconUrl, hostOf, relativeTime, newsImageUrl } from "../shared";
import type { Post } from "@/lib/types/post";
import { Icon } from "@/app/components/Icon";
import { CoverImage } from "@/app/components/CoverImage";
import { getWeeklyDigest, type WeeklyDigest } from "@/lib/newui/digest";
import { TownCategoryNav } from "../TownCategoryNav";
import { ErrorState } from "@/app/components/ui";
import { logger } from "@/lib/log";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 뉴스·다이제스트(#6·#7) — 부동산 뉴스 그리드 상단에 주간 다이제스트 요약을 합쳤다.
   · 주간 다이제스트: getWeeklyDigest() 요약 카드(실패·빈 데이터 시 섹션 생략, fail-soft).
   · 썸네일: 자동수집 automation_meta 에 og:image 등이 실려오면 실이미지 커버,
     없으면 출처 기반 그라디언트 + 파비콘 + 아이콘 플레이스홀더로 폴백.
   제목 · 출처 · 시간, 지역 필터 지원. */

export const dynamic = "force-dynamic";

/* N7 — ?region= 으로 목록만 좁히는 값이라 조합마다 색인되면 안 된다. canonical 고정. */
export const metadata = buildPageMetadata({
  title: "부동산 뉴스 · 주간 다이제스트",
  description:
    "부동산 뉴스와 이번 주 실거래 다이제스트를 한곳에서. 출처와 게시 시각을 함께 표시합니다.",
  path: "/town/news",
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

function badgeStyle(category: string): string {
  const c = category ?? "";
  if (["개발", "재건축", "재개발", "분양"].some((k) => c.includes(k)))
    return "bg-[#fdf3e7] text-warning";
  if (["정책", "뉴스"].some((k) => c.includes(k))) return "bg-[#edf2fe] text-primary";
  return "bg-[#f2f4f8] text-text-2";
}

/* 썸네일 URL 추출(newsImageUrl)은 상세 페이지와 공유하려고 ../shared 로 올렸다. */

function Thumb({ post, tall = false }: { post: Post; tall?: boolean }) {
  const image = newsImageUrl(post);
  const favicon = faviconUrl(post.sourceUrl);
  return (
    <div
      className={`relative w-full overflow-hidden ${tall ? "h-[200px]" : "h-[128px]"}`}
    >
      {/* 이미지 없음/로드 실패 모두 그라디언트+아이콘 폴백으로 통일 (#18) */}
      <CoverImage
        src={image}
        imgClassName="absolute inset-0 h-full w-full object-cover"
        scrim
        fallback={
          <span
            className="absolute inset-0 flex items-center justify-center text-white/70"
            style={{
              background: seedGradient(post.sourceName || post.city || post.id),
            }}
          >
            <Icon name="file-text" size={tall ? 34 : 26} />
          </span>
        }
      />
      <span
        className={`absolute left-2 top-2 rounded-[5px] px-2 py-[3px] text-[10px] font-extrabold ${badgeStyle(post.category)}`}
      >
        {post.category || "뉴스"}
      </span>
      {favicon && (
        <span className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 shadow-sm">
          {/* G7 — next/image 를 쓰지 않는 이유: 언론사 도메인의 favicon 은
              출처가 임의라 next.config 의 remotePatterns 로 허용 목록을 만들 수
              없다(뉴스 소스가 늘 때마다 배포가 필요해진다). 대신 최적화가 필요한
              이미지도 아니다 — 20px 아이콘이다.
              width/height 는 CSS 가 적용되기 전 브라우저가 자리를 잡도록 명시.
              alt="" 는 의도적: 옆의 언론사 이름이 이미 같은 정보를 준다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={favicon}
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
  category: "정책",
  title: "월세 세액공제 최대 30% 상향 개정안 발의 — 무주택 세입자 주거안정",
  sourceName: "국토교통부",
  time: "예시",
};

export default async function TownNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;

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

  /* 지역 필터 — 실데이터 기반(뉴스 city 상위 목록) */
  const regions = [...new Set(news.map((p) => p.city).filter(Boolean))].slice(0, 8);
  const active = region && regions.includes(region) ? region : null;
  const list = active ? news.filter((p) => p.city === active) : news;

  const featured = list[0];
  const rest = list.slice(1);
  const isMock = list.length === 0 && !active && !newsFailed;

  return (
    <PageShell breadcrumb="동네이야기 › 뉴스">
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">뉴스</h1>
        <Link href="/town/library" className="text-[13px] font-bold text-primary">
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
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#7ea2ff]">
              <Icon name="file-text" size={14} />
              주간 다이제스트
              <span className="rounded bg-white/10 px-1.5 py-px text-[10px] text-ai-text">
                {digest.weekLabel}
              </span>
            </div>
            <div className="text-[15px] font-extrabold text-white">
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

      {/* 지역 필터 칩 (실데이터 기반) */}
      {regions.length > 0 && (
        <div className="rise-in mb-4 flex flex-wrap gap-1.5 text-xs">
          <Link
            href="/town/news"
            className={`chip px-3.5 py-[7px] ${
              active ? "border border-[#e2e7ee] bg-surface text-text-2" : "chip-active"
            }`}
          >
            전체
          </Link>
          {regions.map((r) => (
            <Link
              key={r}
              href={`/town/news?region=${encodeURIComponent(r)}`}
              className={`chip px-3.5 py-[7px] ${
                active === r
                  ? "chip-active"
                  : "border border-[#e2e7ee] bg-surface text-text-2"
              }`}
            >
              {r}
            </Link>
          ))}
        </div>
      )}

      {/* 대표 뉴스 */}
      {featured ? (
        <Link
          href={`/town/news/${featured.id}`}
          className="rise-in card card-hover mb-5 block overflow-hidden rounded-[20px]"
        >
          <Thumb post={featured} tall />
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
              <span className="font-semibold text-text-2">
                {featured.sourceName || featured.authorLabel}
              </span>
              <span>· {relativeTime(displayIso(featured))}</span>
              {hostOf(featured.sourceUrl) && (
                <span className="text-text-3">· {hostOf(featured.sourceUrl)}</span>
              )}
            </div>
          </div>
        </Link>
      ) : isMock ? (
        <div className="rise-in card mb-5 overflow-hidden rounded-[20px]">
          <div
            className="relative h-[200px] w-full"
            style={{ background: seedGradient("molit") }}
          >
            <span className="absolute left-2 top-2 rounded-[5px] bg-[#edf2fe] px-2 py-[3px] text-[10px] font-extrabold text-primary">
              {EXAMPLE_NEWS.category}
            </span>
            <span className="absolute right-2 top-2 rounded-[5px] bg-white/90 px-[3px] py-[2px]">
              <ExampleBadge />
            </span>
          </div>
          <div className="flex flex-col gap-2 p-5">
            <h2 className="text-[19px] font-extrabold leading-[1.4] text-ink">
              {EXAMPLE_NEWS.title}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-text-3">
              <span className="font-semibold text-text-2">
                {EXAMPLE_NEWS.sourceName}
              </span>
              <ExampleBadge />
            </div>
            <p className="text-[11px] leading-[1.6] text-text-3">
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
      ) : null}

      {/* 뉴스 그리드 */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {rest.map((p, i) => (
            <Link
              key={p.id}
              href={`/town/news/${p.id}`}
              className={`card card-hover rise-in-${Math.min(i + 1, 6)} flex flex-col overflow-hidden rounded-[16px]`}
            >
              <Thumb post={p} />
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="line-clamp-3 text-[13px] font-bold leading-[1.4] text-ink">
                  {p.title}
                </div>
                <div className="mt-auto flex items-center gap-1 text-[11px] text-text-3">
                  <span className="min-w-0 truncate font-semibold text-text-2">
                    {p.sourceName || p.authorLabel}
                  </span>
                  <span className="shrink-0">· {relativeTime(displayIso(p))}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 지역 필터 결과 0건 — 빈 상태 */}
      {list.length === 0 && active && !newsFailed && (
        <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
          <div className="text-[26px]"><Icon name="🗞" size={26} /></div>
          <div className="text-sm font-bold text-text-1">
            {active} 관련 뉴스가 아직 없어요
          </div>
          <Link href="/town/news" className="btn-primary mt-1 rounded-[10px] px-4 py-2 text-xs">
            전체 뉴스 보기
          </Link>
        </div>
      )}
    </PageShell>
  );
}
