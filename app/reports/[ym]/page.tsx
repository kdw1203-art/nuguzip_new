import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { QaBlock } from "../../components/QaBlock";
import { CitationBlock } from "../../components/CitationBlock";
import { PressSummaryBlock } from "../../components/PressSummaryBlock";
import { getMonthlyReport, formatYmKo, isValidYm } from "@/lib/reports/monthly";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   S11/G7/G8/G14 — 월간 실거래 리포트 상세.
   market_region_monthly 집계에서 100% 자동 생성 — 사람이 쓴 시황이 아니다.
   AI 가 그대로 발췌·인용할 수 있는 완결 문장(첫 문단·Q&A·인용 블록)을
   실측치로만 조립하고, Article JSON-LD 에 dateModified(집계 갱신 시각)를 싣는다.
   데이터 없는 달은 404 — 빈 리포트를 만들지 않는다.

   404 는 "그 달 집계가 없다" 일 때만이다. 조회 실패는 잡지 않고 그대로
   던진다(→ 5xx). generateStaticParams 가 빈 배열이라 빌드 프리렌더 대상이
   아니므로 던져도 빌드가 깨지지 않고, 실패한 재검증은 직전 성공 페이지를
   그대로 유지시킨다. 반대로 DB 장애를 404 로 바꾸면 크롤러에게 "이 URL 은
   없어졌다" 고 확정 신고하는 꼴이다 — 5xx 는 재시도를 부르지만 404 는
   색인에서 지운다. 경위는 lib/market/tx-bands.ts 헤더 참고.
   ============================================================ */

export const revalidate = 3600;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { ym: string }[] {
  return [];
}

function eok(krw: number | null): string {
  if (krw === null || krw <= 0) return "—";
  const e = krw / 100_000_000;
  return `${(e >= 10 ? e.toFixed(1) : e.toFixed(2)).replace(/\.?0+$/, "")}억`;
}

function manwon(krw: number | null): string {
  if (krw === null || krw <= 0) return "—";
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
}

function deltaText(pct: number | null): string {
  if (pct === null) return "—";
  if (pct > 0) return `▲ ${pct.toFixed(1)}%`;
  if (pct < 0) return `▼ ${Math.abs(pct).toFixed(1)}%`;
  return "0.0%";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ym: string }>;
}): Promise<Metadata> {
  const { ym } = await params;
  const report = isValidYm(ym) ? await getMonthlyReport(ym) : null;
  if (!report) {
    return { title: "월간 실거래 리포트 | 내집나우", robots: { index: false, follow: false } };
  }
  const label = formatYmKo(report.ym);
  const title = `${label} 아파트 실거래 리포트 — ${report.regionCount}개 지역 ${report.txCount.toLocaleString("ko-KR")}건 | 내집나우`;
  const description = `${label} 전국 집계 지역 아파트 매매 실거래 ${report.txCount.toLocaleString("ko-KR")}건. 지역별 거래량·평균가·전월 대비 변동을 국토교통부 신고 기준으로 정리했습니다.`;
  const path = `/reports/${report.ym}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://naezipnow.com${path}`, type: "article" },
  };
}

export default async function MonthlyReportPage({
  params,
}: {
  params: Promise<{ ym: string }>;
}) {
  const { ym } = await params;
  if (!isValidYm(ym)) notFound();
  const report = await getMonthlyReport(ym);
  if (!report) notFound();

  const label = formatYmKo(report.ym);
  const momPct =
    report.prevTxCount && report.prevTxCount > 0
      ? ((report.txCount - report.prevTxCount) / report.prevTxCount) * 100
      : null;
  const momText =
    report.prevTxCount && momPct !== null
      ? `${report.prevTxCount.toLocaleString("ko-KR")}건이었던 전월(${formatYmKo(report.prevYm!)}) 대비 ${momPct.toFixed(1)}%`
      : null;

  /* G12 — 첫 문단: 발췌해도 완결되는 정의형 문장 */
  const leadSentence = `${label} 내집나우 집계 지역(${report.regionCount}곳)의 아파트 매매 실거래는 총 ${report.txCount.toLocaleString("ko-KR")}건입니다${
    momText ? ` (${momText})` : ""
  } — 국토교통부 실거래 신고 기준.`;

  const citation = `내집나우(naezipnow.com) 집계에 따르면, ${label} 집계 지역 ${report.regionCount}곳의 아파트 매매 실거래는 ${report.txCount.toLocaleString("ko-KR")}건이다 (국토교통부 실거래 신고 기반).`;

  const faq: FaqItem[] = [
    {
      q: `${label} 아파트 실거래는 총 몇 건인가요?`,
      a: leadSentence,
    },
  ];
  const top = report.rows[0];
  if (top) {
    faq.push({
      q: `${label} 거래가 가장 많았던 지역은 어디인가요?`,
      a: `${top.regionName}이(가) ${top.txCount.toLocaleString("ko-KR")}건으로 가장 많았습니다${
        top.avgKrw ? `. 이 지역의 ${label} 평균 매매가는 ${eok(top.avgKrw)}입니다` : ""
      } (국토교통부 실거래 신고 기준).`,
    });
  }
  if (report.risers.length > 0) {
    const r = report.risers[0];
    faq.push({
      q: `${label} 평균가가 가장 많이 오른 지역은?`,
      a: `집계 지역(거래 10건 이상) 중 ${r.regionName}의 평균 매매가가 전월 대비 ${deltaText(r.deltaPct)} 변동으로 상승 폭이 가장 컸습니다. 평균가는 면적 구성에 따라 달라질 수 있는 단순 평균입니다.`,
    });
  }

  /* N18 — 기사 리드로 그대로 옮길 수 있는 3문장. 전부 위에서 쓴 실측치 재사용이고,
     여기서 새로 계산하거나 해석을 덧붙이지 않는다. 근거가 없으면 문장을 뺀다. */
  const pressSentences: string[] = [
    `내집나우가 국토교통부 실거래 신고 자료를 집계한 결과, ${label} 전국 집계 지역 ${report.regionCount}곳의 아파트 매매 실거래는 ${report.txCount.toLocaleString("ko-KR")}건으로 나타났다${
      momPct !== null ? ` (전월 ${formatYmKo(report.prevYm!)} 대비 ${momPct.toFixed(1)}%)` : ""
    }.`,
  ];
  if (top) {
    pressSentences.push(
      `거래량이 가장 많았던 지역은 ${top.regionName}(${top.txCount.toLocaleString("ko-KR")}건)이었다${
        top.avgKrw ? `, 이 지역의 ${label} 평균 매매가는 ${eok(top.avgKrw)}이다` : ""
      }.`,
    );
  }
  if (report.risers.length > 0 || report.fallers.length > 0) {
    const upPart =
      report.risers.length > 0
        ? `상승 폭이 가장 컸던 지역은 ${report.risers[0].regionName}(전월 대비 ${(report.risers[0].deltaPct ?? 0).toFixed(1)}%)`
        : "";
    const downPart =
      report.fallers.length > 0
        ? `하락 폭이 가장 컸던 지역은 ${report.fallers[0].regionName}(전월 대비 ${(report.fallers[0].deltaPct ?? 0).toFixed(1)}%)`
        : "";
    pressSentences.push(
      `그 달 거래 10건 이상인 지역만 놓고 보면 ${[upPart, downPart].filter(Boolean).join(", ")}였다 (면적을 가중하지 않은 단순 평균 기준).`,
    );
  }

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${label} 아파트 실거래 리포트`,
    description: leadSentence,
    inLanguage: "ko-KR",
    author: { "@type": "Organization", name: "내집나우", url: "https://naezipnow.com" },
    publisher: { "@id": "https://naezipnow.com/#organization" },
    ...(report.updatedAt
      ? { dateModified: report.updatedAt, datePublished: report.updatedAt }
      : {}),
    mainEntityOfPage: `https://naezipnow.com/reports/${report.ym}`,
  };

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "월간 실거래 리포트", url: "/reports" },
    { name: label, url: `/reports/${report.ym}` },
  ]);

  return (
    <PageShell breadcrumb={`월간 실거래 리포트 › ${label}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([articleJsonLd, crumbs]) }}
      />
      <div className="mx-auto max-w-[860px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">
          {label} 아파트 실거래 리포트
        </h1>
        <p className="rise-in-1 mt-2 text-[13px] leading-[1.7] text-text-1">{leadSentence}</p>
        {report.isProvisional && (
          <p className="rise-in-1 mt-1 text-[12px] leading-[1.6] text-text-3">
            실거래 신고 기한(계약 후 30일)이 지나지 않아 이 달의 수치는 앞으로 더
            늘어날 수 있습니다.
          </p>
        )}

        {/* 상승·하락 상위 (거래 10건 이상 지역만 — 소표본 변동 과대 해석 방지) */}
        {(report.risers.length > 0 || report.fallers.length > 0) && (
          <div className="rise-in-2 mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {report.risers.length > 0 && (
              <div className="card rounded-2xl p-5">
                <h2 className="text-[13px] font-extrabold text-ink">평균가 상승 상위</h2>
                {report.risers.map((r) => (
                  <div key={r.regionName} className="mt-2 flex justify-between text-[13px]">
                    <span className="font-bold text-ink">{r.regionName}</span>
                    <span className="font-bold text-danger">{deltaText(r.deltaPct)}</span>
                  </div>
                ))}
              </div>
            )}
            {report.fallers.length > 0 && (
              <div className="card rounded-2xl p-5">
                <h2 className="text-[13px] font-extrabold text-ink">평균가 하락 상위</h2>
                {report.fallers.map((r) => (
                  <div key={r.regionName} className="mt-2 flex justify-between text-[13px]">
                    <span className="font-bold text-ink">{r.regionName}</span>
                    <span className="font-bold text-primary">{deltaText(r.deltaPct)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 지역별 표 */}
        <section className="rise-in-3 card mt-5 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            지역별 거래량·평균가{" "}
            <span className="text-[12px] font-medium text-text-3">거래량순 · {report.regionCount}개 지역</span>
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[12px] text-text-3">
                  <th className="py-2 font-medium">지역</th>
                  <th className="py-2 text-right font-medium">거래량</th>
                  <th className="py-2 text-right font-medium">평균가</th>
                  <th className="py-2 text-right font-medium">평당가</th>
                  <th className="py-2 text-right font-medium">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.regionName} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 font-bold text-ink">{r.regionName}</td>
                    <td className="py-2.5 text-right text-text-2">
                      {r.txCount.toLocaleString("ko-KR")}건
                    </td>
                    <td className="py-2.5 text-right font-extrabold text-ink">{eok(r.avgKrw)}</td>
                    <td className="py-2.5 text-right text-text-2">{manwon(r.perPyeongKrw)}</td>
                    <td
                      className={`py-2.5 text-right font-bold ${
                        (r.deltaPct ?? 0) > 0
                          ? "text-danger"
                          : (r.deltaPct ?? 0) < 0
                            ? "text-primary"
                            : "text-text-3"
                      }`}
                    >
                      {deltaText(r.deltaPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] leading-[1.6] text-text-3">
            평균가는 면적·타입 구분 없는 단순 평균입니다. 해제(취소) 신고분은 집계에서
            제외했습니다 —{" "}
            <Link href="/methodology" className="font-bold text-primary underline">
              집계 방법론 보기
            </Link>
          </p>
        </section>

        {/* G8 인용 블록 + N18 언론 인용 요약 + G5/G13 Q&A */}
        <div className="rise-in-4 mt-5">
          <CitationBlock sentence={citation} />
          <PressSummaryBlock
            sentences={pressSentences}
            asOfLabel={`${label} 실거래 신고 기준`}
            provisional={report.isProvisional}
          />
          <QaBlock title={`${label} 실거래 Q&A`} items={faq} />
        </div>

        <p className="mb-8 text-[12px] text-text-3">
          <Link href="/reports" className="font-bold text-primary underline">
            다른 달 리포트
          </Link>
          {" · "}
          <Link href="/tx" className="font-bold text-primary underline">
            지역별 실거래 상세
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
