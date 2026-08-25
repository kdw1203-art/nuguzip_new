import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { QaBlock } from "@/app/components/QaBlock";
import {
  getBestNotesMonth,
  formatYmKo,
  SCORE_AXES,
  MAX_SCORE,
  MIN_SCORE,
  MIN_NOTES_PER_MONTH,
  MAX_NOTES_PER_MONTH,
  MAX_PER_AUTHOR,
} from "@/lib/inspection/best-notes";
import type { InspectionNote } from "@/lib/inspection/store-db";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   N13 — 이달의 공개 임장노트(월별 상세).

   목록 페이지가 계산식을 공개했다면, 이 페이지는 그 계산식이 각 노트에
   실제로 어떻게 적용됐는지를 축별 원값·배점까지 그대로 보여 준다.
   "왜 이 노트가 뽑혔는지" 를 독자가 직접 검산할 수 있어야 큐레이션이
   광고가 되지 않는다.

   자격 노트가 MIN_NOTES_PER_MONTH 편 미만인 달은 getBestNotesMonth 가
   null 을 돌려주고 여기서 404 가 된다 — 없는 선정을 만들지 않는다.
   조회 실패는 잡지 않고 던진다(→ 5xx). generateStaticParams 가 없어
   빌드 프리렌더 대상이 아니므로 던져도 빌드가 깨지지 않는다. DB 장애를
   404 로 바꾸면 크롤러에게 "이 URL 은 없어졌다" 고 확정 신고하는 꼴이다.
   ============================================================ */

export const revalidate = 1800;

/** 공개 목록에 이메일을 그대로 싣지 않는다 — /notes 피드와 같은 규칙. */
function maskAuthor(n: InspectionNote): string {
  if (n.authorLabel && n.authorLabel.trim()) return n.authorLabel.trim();
  const local = n.authorEmail.split("@")[0] ?? "이웃";
  const head = local.slice(0, 2) || "이웃";
  return `${head}** 이웃`;
}

function placeLabel(n: InspectionNote): string {
  const apt = n.aptName?.trim();
  const region = n.region?.trim();
  if (apt && region) return `${region} · ${apt}`;
  return apt || region || "지역 미기재";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ym: string }>;
}): Promise<Metadata> {
  const { ym } = await params;
  if (!/^\d{6}$/.test(ym)) {
    return { title: "이달의 공개 임장노트 | 누구집", robots: { index: false, follow: false } };
  }
  const month = await getBestNotesMonth(ym);
  if (!month) {
    return {
      title: `${formatYmKo(ym)} 이달의 공개 임장노트 | 누구집`,
      robots: { index: false, follow: true },
    };
  }
  const title = `${formatYmKo(month.ym)} 이달의 공개 임장노트 ${month.picks.length}편 | 누구집`;
  const description = `${formatYmKo(month.ym)}에 공개된 임장노트 ${month.totalCount}편 중 기록이 충실한 ${month.picks.length}편입니다. 사람이 고르지 않고 공개된 ${MAX_SCORE}점 계산식으로 뽑았습니다.`;
  const path = `/notes/best/${month.ym}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://nuguzip.com${path}`, type: "article" },
  };
}

export default async function BestNotesMonthPage({
  params,
}: {
  params: Promise<{ ym: string }>;
}) {
  const { ym } = await params;
  if (!/^\d{6}$/.test(ym)) notFound();
  const month = await getBestNotesMonth(ym);
  if (!month) notFound();

  const label = formatYmKo(month.ym);
  const top = month.picks[0];
  const authorCount = new Set(month.picks.map((p) => p.note.authorEmail.toLowerCase())).size;

  /* G12 — 발췌해도 완결되는 첫 문단. 실측치만 쓴다. */
  const leadSentence = `${label}에 공개된 임장노트는 ${month.totalCount}편이고, 그중 ${MIN_SCORE}점(${MAX_SCORE}점 만점) 이상 기록을 갖춘 노트는 ${month.qualifiedCount}편입니다. 이 페이지는 그중 상위 ${month.picks.length}편을 작성자 ${authorCount}명 기준으로 싣습니다 — 순위는 사람이 고른 것이 아니라 아래 다섯 축의 합계 점수입니다.`;

  const faq: FaqItem[] = [
    {
      q: "이달의 임장노트는 누가 고르나요?",
      a: `아무도 고르지 않습니다. 현장 기록 분량·사진 수·공공데이터 근거 수·체크리스트 확인 수·항목 작성 여부 다섯 축을 각각 상한을 둔 점수로 재서 합산하고(${MAX_SCORE}점 만점), 그 합계가 높은 순으로 싣습니다. 각 노트의 축별 원값과 배점을 이 페이지에 그대로 적어 두어 직접 검산할 수 있습니다.`,
    },
    {
      q: "점수가 높으면 좋은 단지라는 뜻인가요?",
      a: "아닙니다. 이 점수는 기록이 얼마나 자세한지만 잽니다. 그 단지가 좋은지, 값이 적절한지와는 무관합니다. 노트에 적힌 입지·학군 점수가 높다고 가산점을 주지도 않습니다 — 그러면 후하게 쓸수록 뽑히게 되기 때문입니다.",
    },
    {
      q: "왜 어떤 달은 페이지가 없나요?",
      a: `자격(${MIN_SCORE}점 이상) 노트가 ${MIN_NOTES_PER_MONTH}편 미만인 달은 아예 만들지 않습니다. 두세 편 중에서 뽑는 것은 선별이 아니라 그 달에 올라온 전부이고, 그걸 "이달의 노트"라고 부르면 없는 선별을 있는 척하는 것이기 때문입니다.`,
    },
  ];

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${label} 이달의 공개 임장노트`,
    description: leadSentence,
    inLanguage: "ko-KR",
    author: { "@type": "Organization", name: "누구집", url: "https://nuguzip.com" },
    publisher: { "@id": "https://nuguzip.com/#organization" },
    ...(top ? { dateModified: top.note.updatedAt, datePublished: top.note.createdAt } : {}),
    mainEntityOfPage: `https://nuguzip.com/notes/best/${month.ym}`,
  };

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${label} 이달의 공개 임장노트`,
    numberOfItems: month.picks.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: month.picks.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.note.title,
      url: `https://nuguzip.com/notes/${p.note.id}`,
    })),
  };

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "임장노트", url: "/notes" },
    { name: "이달의 공개 임장노트", url: "/notes/best" },
    { name: `${label}`, url: `/notes/best/${month.ym}` },
  ]);

  return (
    <PageShell breadcrumb={`임장노트 › 이달의 노트 › ${label}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([articleJsonLd, itemListJsonLd, crumbs]),
        }}
      />
      <div className="mx-auto max-w-[860px]">
        <h1 className="rise-in t-title text-ink">
          {label} 이달의 공개 임장노트
        </h1>
        <p className="rise-in-1 mt-2 t-body text-text-1">{leadSentence}</p>

        {/* 집계 요약 — 뽑힌 수만 보여 주면 분모를 숨기는 셈이 된다 */}
        <div className="rise-in-1 mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-[12px] border border-border px-4 py-3">
            <p className="t-sub font-bold text-text-3">그 달 공개 노트</p>
            <p className="mt-0.5 t-section text-ink">{month.totalCount}편</p>
          </div>
          <div className="rounded-[12px] border border-border px-4 py-3">
            <p className="t-sub font-bold text-text-3">{MIN_SCORE}점 이상</p>
            <p className="mt-0.5 t-section text-ink">{month.qualifiedCount}편</p>
          </div>
          <div className="rounded-[12px] border border-border px-4 py-3">
            <p className="t-sub font-bold text-text-3">여기 실린 노트</p>
            <p className="mt-0.5 t-section text-primary">
              {month.picks.length}편
            </p>
          </div>
        </div>

        {month.qualifiedCount > month.picks.length && (
          <p className="rise-in-1 mt-2 t-sub text-text-3">
            자격을 갖춘 {month.qualifiedCount}편 가운데 {month.picks.length}편만 실렸습니다 — 한
            달 최대 {MAX_NOTES_PER_MONTH}편, 같은 작성자 최대 {MAX_PER_AUTHOR}편 상한 때문입니다.
            상한에 걸려 빠진 노트가 더 나쁜 노트라는 뜻은 아닙니다.
          </p>
        )}

        {/* 선정 노트 — 축별 원값과 배점을 그대로 노출해 검산 가능하게 한다 */}
        <div className="rise-in-2 mt-6 flex flex-col gap-4">
          {month.picks.map((p, i) => (
            <article key={p.note.id} className="card rounded-[16px] p-[var(--pad-card)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="t-sub font-extrabold text-text-3">
                    {i + 1}위 · {placeLabel(p.note)}
                  </p>
                  <h2 className="mt-1 t-section text-ink">
                    <Link href={`/notes/${p.note.id}`} className="no-underline hover:underline">
                      {p.note.title}
                    </Link>
                  </h2>
                  <p className="mt-1 t-sub text-text-3">
                    {maskAuthor(p.note)} · {p.note.visitDate || p.note.createdAt.slice(0, 10)} 방문
                    기록
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="t-title leading-none text-primary">
                    {p.total}
                  </p>
                  <p className="mt-1 t-sub font-bold text-text-3">/ {MAX_SCORE}점</p>
                </div>
              </div>

              {p.note.summary?.trim() && (
                <p className="mt-3 t-body text-text-2">
                  {p.note.summary.trim().length > 140
                    ? `${p.note.summary.trim().slice(0, 140)}…`
                    : p.note.summary.trim()}
                </p>
              )}

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse t-sub">
                  <thead>
                    <tr className="border-b border-border text-left text-text-3">
                      <th className="py-1.5 pr-2 font-bold">항목</th>
                      <th className="py-1.5 pr-2 text-right font-bold">실측</th>
                      <th className="py-1.5 text-right font-bold">점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.breakdown.map((b) => (
                      <tr key={b.key} className="border-b border-border last:border-b-0">
                        <td className="py-1.5 pr-2 text-text-2">{b.label}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-text-2">
                          {b.raw.toLocaleString("ko-KR")}
                          {b.unit}
                        </td>
                        <td className="py-1.5 text-right font-bold tabular-nums text-ink">
                          {b.points}
                          <span className="font-normal text-text-3"> / {b.max}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3">
                <Link
                  href={`/notes/${p.note.id}`}
                  className="t-body font-bold text-primary underline"
                >
                  노트 전문 보기 ›
                </Link>
              </p>
            </article>
          ))}
        </div>

        {/* 계산식 재게시 — 목록에서 넘어오지 않은 방문자도 기준을 볼 수 있어야 한다 */}
        <section className="rise-in-3 card mt-6 p-[var(--pad-card)]">
          <h2 className="t-section text-ink">점수는 이렇게 계산했습니다</h2>
          <div className="mt-3 flex flex-col gap-3">
            {SCORE_AXES.map((a) => (
              <div key={a.key} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                <p className="t-body font-extrabold text-ink">
                  {a.label} <span className="text-primary">{a.max}점</span>
                </p>
                <p className="mt-0.5 t-sub text-text-3">{a.how}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 t-sub text-text-3">
            이 점수는 <strong className="text-ink">기록의 충실도</strong>만 잽니다. 그 단지가 좋은
            단지인지, 값이 적절한지와는 무관합니다.
          </p>
        </section>

        <QaBlock items={faq} />

        <p className="mb-8 mt-5 flex flex-wrap gap-4 t-sub text-text-3">
          <Link href="/notes/best" className="font-bold text-primary underline">
            다른 달 보기
          </Link>
          <Link href="/notes" className="font-bold text-primary underline">
            공개 임장노트 전체 보기
          </Link>
          <Link href="/notes/new" className="font-bold text-primary underline">
            내 임장노트 쓰기
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
