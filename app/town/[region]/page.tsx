import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import {
  REGION_CATALOG,
  findCatalogRegionById,
  normalizeRegionKey,
} from "@/lib/region/catalog";
import { readTownPosts } from "@/lib/newui/board-posts";
import { listPublicNoteCards, type PublicNoteCard } from "@/lib/inspection/store-db";
import { getRegionSnapshot } from "@/lib/market/store";
import type { RegionMarketSnapshot } from "@/lib/market/types";
import type { Post } from "@/lib/types/post";
import { formatKrwShort } from "@/lib/market/format";
import { KeywordAlertButton } from "@/app/components/KeywordAlertButton";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { logger } from "@/lib/log";

/* ============================================================
   [#64] 동네 홈 — /town/{regionId}
   /town?region= 쿼리 필터를 "우리 동네 상주 공간"으로 승격한 정식 페이지.
   그 지역의 이웃 글 · 자동수집 뉴스 · 시세 요약 · 공개 임장노트 · 키워드 알림을
   한 화면에 모으고, 시장 데이터 페이지(/region/[id])와 상호 링크한다.

   구분: /region/[id] = 시장 데이터(숫자), /town/[id] = 동네 생활(글·뉴스).
   generateStaticParams + dynamicParams=false — 카탈로그 62곳만 존재한다
   (임의 문자열은 빌드 매니페스트 밖이라 미들웨어 전에 정적 404 — soft-404 없음).
   ============================================================ */

export const revalidate = 600;
export const dynamicParams = false;

export function generateStaticParams(): Array<{ region: string }> {
  return REGION_CATALOG.map((r) => ({ region: r.id }));
}

type Params = { region: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { region: id } = await params;
  const region = findCatalogRegionById(id);
  if (!region) return { title: "동네를 찾을 수 없습니다 | 누구집" };
  const title = `${region.name} 동네 홈 — 이웃 글·뉴스·시세 한눈에`;
  const description = `${region.name} 이웃들의 임장·거주 이야기, 오늘의 ${region.name} 부동산 뉴스, 아파트 시세 요약을 한 화면에서. 키워드 알림으로 새 소식을 받아보세요.`;
  return {
    title,
    description,
    alternates: seoAlternates(`/town/${id}`),
    openGraph: { title, description, type: "website" },
  };
}

/** 글이 이 지역 것인가 — city/district/tags/제목의 정규화 키 포함 매칭 */
function postMatchesRegion(p: Post, nameKey: string): boolean {
  if (!nameKey) return false;
  const fields = [p.city, p.district, ...(p.tags ?? [])];
  for (const f of fields) {
    const k = normalizeRegionKey((f ?? "").trim());
    if (k && (k === nameKey || k.includes(nameKey) || nameKey.includes(k))) return true;
  }
  return normalizeRegionKey(p.title).includes(nameKey);
}

function noteMatchesRegion(n: PublicNoteCard, nameKey: string): boolean {
  const k = normalizeRegionKey(n.region ?? "");
  return Boolean(k && (k.includes(nameKey) || nameKey.includes(k)));
}

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "방금";
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return new Date(t).toISOString().slice(5, 10).replace("-", ".");
}

export default async function TownRegionHomePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { region: id } = await params;
  const region = findCatalogRegionById(id);
  if (!region) notFound();
  const nameKey = normalizeRegionKey(region.name);

  /* 실패는 섹션 단위로 접는다 — 동네 홈이 한 소스 장애로 통째로 죽지 않게 */
  const [postsR, notesR, snapR] = await Promise.allSettled([
    readTownPosts(),
    listPublicNoteCards(100),
    getRegionSnapshot(id),
  ]);
  if (postsR.status === "rejected") logger.error(`[town/${id}] 글 조회 실패`, postsR.reason);
  if (notesR.status === "rejected") logger.error(`[town/${id}] 노트 조회 실패`, notesR.reason);
  if (snapR.status === "rejected") logger.error(`[town/${id}] 시세 조회 실패`, snapR.reason);

  const allPosts: Post[] = postsR.status === "fulfilled" ? postsR.value : [];
  const regionPosts = allPosts.filter((p) => postMatchesRegion(p, nameKey));
  const communityPosts = regionPosts.filter((p) => !p.isAutomated).slice(0, 8);
  const newsPosts = regionPosts
    .filter((p) => p.isAutomated)
    .sort(
      (a, b) =>
        Date.parse(b.sourcePublishedAt || b.createdAt) -
        Date.parse(a.sourcePublishedAt || a.createdAt),
    )
    .slice(0, 6);
  const notes: PublicNoteCard[] =
    notesR.status === "fulfilled"
      ? notesR.value.filter((n) => noteMatchesRegion(n, nameKey)).slice(0, 6)
      : [];
  const snapshot: RegionMarketSnapshot | null =
    snapR.status === "fulfilled" ? snapR.value : null;
  const postsFailed = postsR.status === "rejected";

  return (
    <PageShell wide>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: "동네이야기", url: "/town" },
              { name: `${region.name} 동네 홈`, url: `/town/${id}` },
            ]),
          ]),
        }}
      />

      {/* 헤더 — 동네 이름 + 행동 */}
      <div className="rise-in mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold text-text-3">
            <Link href="/town" className="hover:underline">
              동네이야기
            </Link>{" "}
            › 동네 홈
          </div>
          <h1 className="mt-0.5 text-[24px] font-extrabold tracking-tight text-ink">
            {region.name} 동네 홈
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <KeywordAlertButton scope="news" query={region.name} label={`${region.name} 새 소식`} />
          <Link
            href={`/town/write?region=${encodeURIComponent(region.name)}`}
            className="btn-primary btn-cta px-4 py-[9px] text-[13px]"
          >
            이 동네 글쓰기
          </Link>
        </div>
      </div>

      {/* 시세 요약 스트립 — /region 페이지의 축약판 + 상호 링크 */}
      {snapshot && (
        <Link
          href={`/region/${id}`}
          className="rise-in-1 card card-hover mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-5 py-4 no-underline"
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {snapshot.avgSale && snapshot.avgSale > 0 && (
              <div>
                <div className="text-[10px] text-text-3">평균 매매가</div>
                <div className="text-[18px] font-extrabold text-ink tabular-nums">
                  {formatKrwShort(snapshot.avgSale)}
                </div>
              </div>
            )}
            {snapshot.jeonseRatio !== undefined && Number.isFinite(snapshot.jeonseRatio) && (
              <div>
                <div className="text-[10px] text-text-3">전세가율</div>
                <div className="text-[18px] font-extrabold text-ink tabular-nums">
                  {snapshot.jeonseRatio.toFixed(1)}%
                </div>
              </div>
            )}
            <div className="text-[11px] text-text-3">
              {region.name} 시장 데이터 전체 보기 — 지수 추이·실거래·입주 물량
            </div>
          </div>
          <span className="shrink-0 text-[13px] font-bold text-primary">시장 데이터 →</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 이웃 글 */}
        <section className="rise-in-1">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-[15px] font-extrabold text-ink">이웃 글</h2>
            <Link href="/town" className="text-[12px] font-bold text-primary">
              전체 피드 ›
            </Link>
          </div>
          {postsFailed ? (
            <div className="card rounded-2xl px-5 py-6 text-[13px] text-text-2">
              글을 지금 불러오지 못했어요. 잠시 후 다시 열어봐 주세요.
            </div>
          ) : communityPosts.length === 0 ? (
            <div className="card flex flex-col items-start gap-2 rounded-2xl px-5 py-6">
              <p className="text-[13px] leading-[1.7] text-text-2">
                아직 {region.name} 이웃 글이 없어요. 이 동네에 다녀오셨다면 첫 이야기를
                남겨 주세요 — 글 작성 시 포인트가 적립됩니다.
              </p>
              <Link
                href={`/town/write?region=${encodeURIComponent(region.name)}`}
                className="btn-soft rounded-[10px] px-3.5 py-2 text-[12px] font-bold"
              >
                첫 글 쓰기 ›
              </Link>
            </div>
          ) : (
            <div className="card overflow-hidden rounded-2xl">
              <ul className="flex flex-col">
                {communityPosts.map((p) => (
                  <li key={p.id} className="border-b border-line last:border-0">
                    <Link
                      href={`/town/news/${p.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#f7f9fd]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-bold text-ink">
                          {p.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-3">
                          <span>{p.authorLabel || "이웃"}</span>
                          <span>{relTime(p.createdAt)}</span>
                          {p.commentCount > 0 && <span>댓글 {p.commentCount}</span>}
                        </div>
                      </div>
                      <span className="shrink-0 text-[13px] font-bold text-text-3">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 동네 뉴스 */}
        <section className="rise-in-2">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-[15px] font-extrabold text-ink">{region.name} 뉴스</h2>
            <Link href="/town/news" className="text-[12px] font-bold text-primary">
              전체 뉴스 ›
            </Link>
          </div>
          {newsPosts.length === 0 ? (
            <div className="card rounded-2xl px-5 py-6 text-[13px] leading-[1.7] text-text-2">
              최근 수집된 {region.name} 뉴스가 없어요. 매일 아침 자동 수집되며, 위의
              &lsquo;{region.name} 새 소식&rsquo; 알림을 켜 두면 새 기사가 잡히는 대로
              알림함으로 알려드려요.
            </div>
          ) : (
            <div className="card overflow-hidden rounded-2xl">
              <ul className="flex flex-col">
                {newsPosts.map((p) => (
                  <li key={p.id} className="border-b border-line last:border-0">
                    <Link
                      href={`/town/news/${p.id}`}
                      className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-[#f7f9fd]"
                    >
                      <span className="line-clamp-2 text-[13.5px] font-bold leading-[1.5] text-ink">
                        {p.title}
                      </span>
                      <span className="text-[11px] text-text-3">
                        {p.sourceName || "뉴스"} ·{" "}
                        {relTime(p.sourcePublishedAt || p.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* 공개 임장노트 */}
      <section className="rise-in-3 mt-6">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-[15px] font-extrabold text-ink">
            {region.name} 공개 임장노트{" "}
            {notes.length > 0 && (
              <span className="text-[12px] font-medium text-text-3">{notes.length}편</span>
            )}
          </h2>
          <Link href="/notes" className="text-[12px] font-bold text-primary">
            임장노트 홈 ›
          </Link>
        </div>
        {notes.length === 0 ? (
          <div className="card flex flex-col items-start gap-2 rounded-2xl px-5 py-6">
            <p className="text-[13px] leading-[1.7] text-text-2">
              아직 {region.name} 공개 임장노트가 없어요. 직접 다녀온 기록이 이 동네의 첫
              번째 현장 자료가 됩니다.
            </p>
            <Link
              href={`/notes/new?region=${encodeURIComponent(region.name)}`}
              className="btn-soft rounded-[10px] px-3.5 py-2 text-[12px] font-bold"
            >
              {region.name} 임장노트 쓰기 ›
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {notes.map((n) => (
              <Link
                key={n.id}
                href={`/notes/${n.id}`}
                className="card card-hover rounded-2xl px-4 py-3.5"
              >
                <div className="truncate text-[13.5px] font-extrabold text-ink">{n.title}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-text-3">
                  {n.aptName && <span className="truncate">{n.aptName}</span>}
                  {n.visitDate && <span className="shrink-0">직접방문</span>}
                </div>
                {n.summary && (
                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.6] text-text-2">
                    {n.summary}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 다른 동네 + 지도 */}
      <section className="rise-in-4 mt-8">
        <h2 className="mb-2 px-1 text-[13px] font-extrabold text-ink">다른 동네 홈</h2>
        <div className="flex flex-wrap gap-1.5">
          {REGION_CATALOG.filter((r) => r.id !== id)
            .slice(0, 16)
            .map((r) => (
              <Link
                key={r.id}
                href={`/town/${r.id}`}
                className="chip border border-line bg-surface px-3 py-1.5 text-[12px] font-bold text-text-2"
              >
                {r.name}
              </Link>
            ))}
          <Link
            href={`/map?region=${encodeURIComponent(region.name)}`}
            className="chip border border-line bg-surface px-3 py-1.5 text-[12px] font-bold text-primary"
          >
            지도에서 {region.name} 보기 ›
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
