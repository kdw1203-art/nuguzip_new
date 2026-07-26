import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { QaBlock } from "@/app/components/QaBlock";
import {
  getDigestWeek,
  weekSlugToMs,
  weekRangeLabel,
  weekOrdinalLabel,
  ARCHIVE_WEEKS,
  MIN_ITEMS,
} from "@/lib/digest/archive";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   N23 — 주간 다이제스트 웹 아카이브(한 주).

   주소의 날짜는 한국시간 기준 그 주 월요일이다. 월요일이 아닌 날짜는
   주소로 인정하지 않는다(같은 주에 URL 이 7개 생기는 것을 막는다).

   그 주에 실제로 수집된 것만 싣는다. 시장 온도 스냅샷이 그 주에 없으면
   최근 주 값으로 채우지 않고 없다고 적는다 — 다른 주 숫자를 그 주 것처럼
   싣는 순간 아카이브 전체를 믿을 수 없게 된다.

   기준 미달·범위 밖은 404. 조회 실패는 잡지 않고 던진다(→ 5xx).
   generateStaticParams 가 없어 빌드 프리렌더 대상이 아니므로 던져도 빌드가
   깨지지 않는다. DB 장애를 404 로 바꾸면 크롤러에게 "이 URL 은 없어졌다" 고
   확정 신고하는 꼴이다.
   ============================================================ */

export const revalidate = 3600;

function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const kst = new Date(t + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(kst.getUTCMonth() + 1)}.${p(kst.getUTCDate())}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ week: string }>;
}): Promise<Metadata> {
  const { week } = await params;
  const startMs = weekSlugToMs(week);
  if (startMs === null) {
    return { title: "주간 다이제스트 | 누구집", robots: { index: false, follow: false } };
  }
  const data = await getDigestWeek(week);
  if (!data) {
    return {
      title: `${weekOrdinalLabel(startMs)} 주간 다이제스트 | 누구집`,
      robots: { index: false, follow: true },
    };
  }
  const title = `${data.ordinalLabel}(${data.rangeLabel}) 부동산 주간 다이제스트 | 누구집`;
  const description = `${data.rangeLabel} 한 주 동안 수집된 부동산 뉴스 ${data.newsCount}건과 이웃 글 ${data.communityCount}건을 한 장으로 정리했습니다.`;
  const path = `/digest/${data.slug}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://nuguzip.com${path}`, type: "article" },
  };
}

export default async function DigestWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const startMs = weekSlugToMs(week);
  if (startMs === null) notFound();
  const data = await getDigestWeek(week);
  if (!data) notFound();

  /* G12 — 발췌해도 완결되는 첫 문단. 실측 개수만 쓴다. */
  const leadSentence = `${data.rangeLabel}(한국시간 월~일) 한 주 동안 누구집에 수집된 부동산 뉴스는 ${data.newsCount}건, 이웃이 올린 글은 ${data.communityCount}건입니다.${
    data.temperature.length > 0
      ? ` 같은 주 시장 온도 기록은 ${data.temperature.length}개 지역에 남아 있습니다.`
      : " 같은 주 시장 온도 스냅샷은 남아 있지 않습니다."
  }`;

  const faq: FaqItem[] = [
    {
      q: "이 페이지의 '한 주'는 언제부터 언제까지인가요?",
      a: `한국시간 기준 월요일 00:00부터 일요일 24:00까지입니다. 주소에 적힌 날짜(${data.slug})가 그 주 월요일입니다. 진행 중인 주는 아직 끝나지 않았으므로 아카이브에 넣지 않습니다.`,
    },
    {
      q: "숫자는 어디서 온 건가요?",
      a: "그 주에 실제로 수집·게시된 글을 매번 원본에서 다시 세어 보여 줍니다. 별도의 요약본을 저장해 두지 않기 때문에, 어떤 글이 나중에 내려가면 이 페이지의 숫자도 그만큼 줄어듭니다. 저장해 둔 숫자와 원본이 어긋나는 것보다 이쪽이 낫다고 봤습니다.",
    },
    {
      q: "왜 없는 주가 있나요?",
      a: `수집 항목이 ${MIN_ITEMS}건 미만인 주는 페이지를 만들지 않습니다. 두어 줄짜리 요약을 주간 다이제스트라고 부르지 않기 위해서입니다. 보관 범위는 최근 ${ARCHIVE_WEEKS}주입니다.`,
    },
  ];

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${data.ordinalLabel} 부동산 주간 다이제스트`,
    description: leadSentence,
    inLanguage: "ko-KR",
    author: { "@type": "Organization", name: "누구집", url: "https://nuguzip.com" },
    publisher: { "@id": "https://nuguzip.com/#organization" },
    datePublished: new Date(data.startMs).toISOString(),
    mainEntityOfPage: `https://nuguzip.com/digest/${data.slug}`,
  };

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "주간 다이제스트", url: "/digest" },
    { name: "아카이브", url: "/digest/archive" },
    { name: data.ordinalLabel, url: `/digest/${data.slug}` },
  ]);

  return (
    <PageShell breadcrumb={`주간 다이제스트 › ${data.ordinalLabel}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([articleJsonLd, crumbs]) }}
      />
      <div className="mx-auto max-w-[860px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">
          {data.ordinalLabel} 부동산 주간 다이제스트
        </h1>
        <p className="rise-in-1 mt-1 text-[12px] font-semibold text-text-3">{data.rangeLabel}</p>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-1">{leadSentence}</p>

        {/* 뉴스 */}
        <section className="rise-in-2 mt-6">
          <h2 className="text-[16px] font-extrabold text-ink">
            그 주 뉴스 <span className="text-text-3">{data.newsCount}건</span>
          </h2>
          {data.news.length > 0 ? (
            <ul className="mt-3 flex list-none flex-col gap-2 p-0">
              {data.news.map((item) => (
                <li key={item.id} className="card rounded-[14px] px-4 py-3">
                  <Link
                    href={`/town/news/${item.id}`}
                    className="text-[14px] font-bold leading-[1.5] text-ink no-underline hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-1 text-[11px] text-text-3">
                    {[shortDate(item.at), item.sourceName, item.region]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-text-3">그 주에 수집된 뉴스가 없습니다.</p>
          )}
          {data.newsCount > data.news.length && (
            <p className="mt-2 text-[12px] text-text-3">
              그 주 뉴스 {data.newsCount}건 중 {data.news.length}건만 표시했습니다.
            </p>
          )}
        </section>

        {/* 이웃 글 */}
        <section className="rise-in-3 mt-8">
          <h2 className="text-[16px] font-extrabold text-ink">
            그 주 이웃 글 <span className="text-text-3">{data.communityCount}건</span>
          </h2>
          {data.community.length > 0 ? (
            <ul className="mt-3 flex list-none flex-col gap-2 p-0">
              {data.community.map((item) => (
                <li key={item.id} className="card rounded-[14px] px-4 py-3">
                  <Link
                    href={`/town/news/${item.id}`}
                    className="text-[14px] font-bold leading-[1.5] text-ink no-underline hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-1 text-[11px] text-text-3">
                    {[shortDate(item.at), item.region].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-text-3">그 주에 올라온 이웃 글이 없습니다.</p>
          )}
          {data.communityCount > data.community.length && (
            <p className="mt-2 text-[12px] text-text-3">
              그 주 이웃 글 {data.communityCount}건 중 {data.community.length}건만
              표시했습니다.
            </p>
          )}
        </section>

        {/* 시장 온도 — 그 주 스냅샷이 있을 때만 */}
        <section className="rise-in-4 mt-8">
          <h2 className="text-[16px] font-extrabold text-ink">그 주 시장 온도</h2>
          {data.temperature.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-text-3">
                    <th className="py-2 pr-2 text-[12px] font-bold">지역</th>
                    <th className="py-2 pr-2 text-right text-[12px] font-bold">온도</th>
                    <th className="py-2 text-[12px] font-bold">한 줄 요약</th>
                  </tr>
                </thead>
                <tbody>
                  {data.temperature.map((t) => (
                    <tr key={t.regionId} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-2 font-bold text-ink">
                        <Link
                          href={`/analysis/temperature/${encodeURIComponent(t.regionId)}`}
                          className="no-underline hover:underline"
                        >
                          {t.regionLabel}
                        </Link>
                      </td>
                      <td className="py-2 pr-2 text-right font-bold tabular-nums text-primary">
                        {Math.round(t.score)}
                      </td>
                      <td className="py-2 text-text-2">{t.headline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-[13px] leading-[1.7] text-text-3">
              그 주에 기록된 시장 온도 스냅샷이 없습니다. 다른 주 값으로 대신 채우지 않습니다 —
              그 주의 숫자가 아니기 때문입니다.
            </p>
          )}
        </section>

        <QaBlock items={faq} />

        <p className="mb-8 mt-5 flex flex-wrap gap-4 text-[12px] text-text-3">
          <Link href="/digest/archive" className="font-bold text-primary underline">
            다른 주 보기
          </Link>
          <Link href="/digest" className="font-bold text-primary underline">
            이번 주 다이제스트
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
