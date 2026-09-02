import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { readTownPosts } from "@/lib/newui/board-posts";
import { NEWS_TAGS, findNewsTag, postMatchesTag } from "@/lib/news/tags";
import { clusterNews } from "@/lib/news/cluster";
import type { Post } from "@/lib/types/post";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { logger } from "@/lib/log";

/* [#103] 뉴스 태그 허브 — /town/news/tag/[slug]
   자동 수집 뉴스(우리 요약 보유분 중심)를 주제별로 묶은 색인 표면.
   dynamicParams=false: 큐레이션 태그 20개만 존재(빈 허브·soft404 방지).
   같은 사건 접기(#67)를 그대로 적용해 목록이 중복으로 붓지 않는다. */

export const revalidate = 1800;
export const dynamicParams = false;

export function generateStaticParams(): Array<{ tag: string }> {
  return NEWS_TAGS.map((t) => ({ tag: t.slug }));
}

function displayIso(p: Post): string {
  return p.sourcePublishedAt || p.createdAt;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag: slug } = await params;
  const tag = findNewsTag(slug);
  if (!tag) return { title: "뉴스 주제를 찾을 수 없습니다 | 내집나우" };
  const title = `${tag.label} 부동산 뉴스 모음 | 내집나우`;
  const description = `${tag.label} 관련 부동산 뉴스를 매일 자동 수집해 같은 사건은 묶고 요약과 함께 정리합니다. 출처·게시 시각 명시.`;
  return { title, description, alternates: seoAlternates(`/town/news/tag/${slug}`) };
}

export default async function NewsTagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: slug } = await params;
  const tag = findNewsTag(slug);
  if (!tag) notFound();

  let news: Post[] = [];
  let failed = false;
  try {
    const all = await readTownPosts();
    news = all
      .filter((p) => p.isAutomated && postMatchesTag(tag, p))
      .sort((a, b) => Date.parse(displayIso(b)) - Date.parse(displayIso(a)));
  } catch (e) {
    logger.error(`[news-tag] ${slug} 조회 실패`, e);
    failed = true;
  }

  const byId = new Map(news.map((p) => [p.id, p]));
  const clusters = clusterNews(
    news.map((p) => ({ id: p.id, title: p.title, timeMs: Date.parse(displayIso(p)) || 0 })),
  ).slice(0, 40);

  return (
    <PageShell breadcrumb={`뉴스 › ${tag.label}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: "뉴스", url: "/town/news" },
              { name: tag.label, url: `/town/news/tag/${slug}` },
            ]),
          ]),
        }}
      />
      <h1 className="rise-in text-[22px] font-extrabold text-ink">{tag.label} 뉴스</h1>
      <p className="rise-in-1 mt-1 max-w-[640px] text-[13px] leading-[1.7] text-text-2">
        {tag.label} 관련 보도를 매일 자동 수집해 같은 사건은 하나로 묶었습니다. 각 글에는
        출처와 원문 링크가 명시됩니다.
      </p>

      {/* 다른 주제 칩 */}
      <div className="rise-in-1 mt-3 flex flex-wrap gap-1.5">
        {NEWS_TAGS.filter((t) => t.slug !== slug)
          .slice(0, 12)
          .map((t) => (
            <Link
              key={t.slug}
              href={`/town/news/tag/${t.slug}`}
              className="chip border border-line bg-surface px-3 py-1.5 text-[12px] font-bold text-text-2"
            >
              {t.label}
            </Link>
          ))}
        <Link
          href="/town/news"
          className="chip border border-line bg-surface px-3 py-1.5 text-[12px] font-bold text-primary"
        >
          전체 뉴스 ›
        </Link>
      </div>

      {failed ? (
        <div className="card mt-4 rounded-2xl px-5 py-6 text-[13px] text-text-2">
          뉴스를 지금 불러오지 못했어요 — 잠시 후 다시 열어봐 주세요.
        </div>
      ) : clusters.length === 0 ? (
        <div className="card mt-4 rounded-2xl px-5 py-6 text-[13px] leading-[1.7] text-text-2">
          최근 수집분에 {tag.label} 보도가 없어요. 수집은 매일 이어지니 다시 들러 주세요.
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {clusters.map((c) => {
            const p = byId.get(c.primary.id)!;
            return (
              <div key={p.id} className="card overflow-hidden rounded-2xl">
                <Link
                  href={`/town/news/${p.id}`}
                  className="flex flex-col gap-1 px-4 py-3.5 transition-colors hover:bg-bg"
                >
                  <span className="text-[14px] font-bold leading-[1.5] text-ink">{p.title}</span>
                  <span className="text-[11px] text-text-3">
                    {p.sourceName || "뉴스"} ·{" "}
                    {new Date(displayIso(p)).toLocaleDateString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                    })}
                    {c.related.length > 0 && ` · 관련 보도 ${c.related.length}건`}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
