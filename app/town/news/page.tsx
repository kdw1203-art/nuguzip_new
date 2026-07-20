import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { ExampleBadge } from "../../components/ExampleBadge";
import { readTownPosts } from "@/lib/newui/board-posts";
import { COMMUNITY_SUBCATEGORIES, matchSubcategory } from "@/lib/subcategories";
import { seedGradient, faviconUrl, hostOf, relativeTime } from "../shared";
import type { Post } from "@/lib/types/post";

/* 뉴스 전용(#6·#7) — 자료(리포트·노트·다이제스트)와 분리한 부동산 뉴스 그리드.
   썸네일(출처 파비콘 + 그라디언트) · 제목 · 출처 · 시간, 지역 필터 지원.
   Post에는 이미지 필드가 없어 커버는 출처 기반 그라디언트 + 파비콘으로 구성한다. */

export const dynamic = "force-dynamic";

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
    return "bg-[#fdf3e7] text-[#c07a3a]";
  if (["정책", "뉴스"].some((k) => c.includes(k))) return "bg-[#edf2fe] text-primary";
  return "bg-[#f2f4f8] text-text-2";
}

function Thumb({ post, tall = false }: { post: Post; tall?: boolean }) {
  const favicon = faviconUrl(post.sourceUrl);
  return (
    <div
      className={`relative w-full overflow-hidden ${tall ? "h-[200px]" : "h-[128px]"}`}
      style={{ background: seedGradient(post.sourceName || post.city || post.id) }}
    >
      <span
        className={`absolute left-2 top-2 rounded-[5px] px-2 py-[3px] text-[10px] font-extrabold ${badgeStyle(post.category)}`}
      >
        {post.category || "뉴스"}
      </span>
      {favicon && (
        <span className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={favicon} alt="" loading="lazy" className="h-5 w-5 rounded" />
        </span>
      )}
    </div>
  );
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

  let news: Post[] = [];
  try {
    const all = await readTownPosts();
    news = all
      .filter(isNewsPost)
      .sort(
        (a, b) =>
          new Date(displayIso(b)).getTime() - new Date(displayIso(a)).getTime(),
      );
  } catch {
    news = [];
  }

  /* 지역 필터 — 실데이터 기반(뉴스 city 상위 목록) */
  const regions = [...new Set(news.map((p) => p.city).filter(Boolean))].slice(0, 8);
  const active = region && regions.includes(region) ? region : null;
  const list = active ? news.filter((p) => p.city === active) : news;

  const featured = list[0];
  const rest = list.slice(1);
  const isMock = list.length === 0 && !active;

  return (
    <PageShell breadcrumb="동네이야기 › 뉴스">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">뉴스</h1>
        <Link href="/town/library" className="text-[13px] font-bold text-primary">
          자료·리포트 ›
        </Link>
      </div>

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
      {list.length === 0 && active && (
        <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
          <div className="text-[26px]">🗞️</div>
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
