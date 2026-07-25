import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import {
  getTxCoverage,
  listTxRegions,
  MIN_BAND_TX,
  type TxRegionSummary,
} from "@/lib/market/tx-bands";
import { formatYmRange } from "@/lib/market/format";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   실거래 구간 인덱스 — /tx
   국토교통부 실거래(market_transactions) 기반 지역 목록.
   면적대·가격대 랜딩(/tx/[region]/[kind]/[band])의 진입점이자
   프로그래매틱 SEO 페이지들을 크롤러에 이어 주는 허브.
   ============================================================ */

export const revalidate = 3600;

const PATH = "/tx";

export async function generateMetadata(): Promise<Metadata> {
  const regions = await listTxRegions().catch(() => [] as TxRegionSummary[]);
  // 구간에 정리된 건수. 전체 신고분과 다를 수 있어 문장에서도 "정리했다"로 쓴다.
  const total = regions.reduce((s, r) => s + r.txCount, 0);
  const description =
    regions.length > 0
      ? `국토교통부 아파트 매매 실거래 ${total.toLocaleString("ko-KR")}건을 ${regions.length}개 지역 × 면적대·가격대 구간으로 정리했습니다. 신고 기준 ${formatYmRange(
          regions.reduce<string | null>((a, r) => (r.firstYm && (!a || r.firstYm < a) ? r.firstYm : a), null),
          regions.reduce<string | null>((a, r) => (r.latestYm && (!a || r.latestYm > a) ? r.latestYm : a), null),
        )}. 매물 호가가 아닙니다.`
      : "국토교통부 아파트 매매 실거래를 지역·면적대·가격대로 나눠 봅니다. 매물 호가가 아닙니다.";
  return {
    title: "지역별 면적대·가격대 실거래 | 누구집",
    description,
    alternates: seoAlternates(PATH),
    openGraph: {
      title: "지역별 면적대·가격대 실거래 | 누구집",
      description,
      url: `https://nuguzip.com${PATH}`,
      type: "website",
    },
  };
}

export default async function TxIndexPage() {
  const regions = await listTxRegions().catch(() => [] as TxRegionSummary[]);
  const total = regions.reduce((s, r) => s + r.txCount, 0);
  // 커버리지: 구간에 정리된 건수(total)와 면적대 셀 전체 합을 분리해서 받는다.
  // 둘이 다르면 그 차이를 감추지 않고 문장으로 드러낸다 — 아래 uncovered 참고.
  const coverage = await getTxCoverage().catch(() => null);
  const uncovered = coverage ? Math.max(0, coverage.totalTx - coverage.coveredTx) : 0;
  const firstYm = regions.reduce<string | null>(
    (a, r) => (r.firstYm && (!a || r.firstYm < a) ? r.firstYm : a),
    null,
  );
  const latestYm = regions.reduce<string | null>(
    (a, r) => (r.latestYm && (!a || r.latestYm > a) ? r.latestYm : a),
    null,
  );
  const range = formatYmRange(firstYm, latestYm);

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "지역별 실거래 구간", url: PATH },
  ]);

  return (
    <PageShell breadcrumb="홈 › 지역별 실거래 구간" title="지역별 면적대·가격대 실거래">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        국토교통부 아파트 매매 실거래 신고분을 지역 × 면적대·가격대로 나눠 정리했습니다.
        {total > 0 && (
          <>
            {" "}
            현재 <strong className="text-ink">{regions.length}개 지역</strong> ·{" "}
            <strong className="text-ink">{total.toLocaleString("ko-KR")}건</strong>이
            구간으로 정리돼 있습니다{range && ` (${range} 신고 기준)`}.
          </>
        )}{" "}
        매물 호가가 아니라 실제 체결·신고된 금액입니다.
        {uncovered > 0 && coverage && (
          <>
            {" "}
            같은 기간 면적이 확인된 신고분{" "}
            <strong className="text-ink">{coverage.totalTx.toLocaleString("ko-KR")}건</strong> 가운데,
            구간당 {MIN_BAND_TX}건에 못 미쳐 페이지를 만들지 않은{" "}
            <strong className="text-ink">{uncovered.toLocaleString("ko-KR")}건</strong>은 위 숫자에서
            빠져 있습니다.
          </>
        )}
      </p>

      {regions.length === 0 ? (
        <section className="rise-in-1 card p-[var(--pad-card)]">
          <p className="py-8 text-center text-[13px] text-text-3">
            실거래 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
          </p>
        </section>
      ) : (
        <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            지역{" "}
            <span className="text-[11px] font-medium text-text-3">
              거래 많은 순 · 구간별 페이지로 이동
            </span>
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {regions.map((r) => (
              <Link
                key={r.slug}
                href={`/tx/${encodeURIComponent(r.slug)}`}
                className="card-hover flex items-baseline justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5 text-[13px]"
              >
                <span className="font-bold text-ink">{r.name}</span>
                <span className="shrink-0 text-[12px] text-text-3">
                  {r.txCount.toLocaleString("ko-KR")}건 · 구간{" "}
                  {r.areaCells.length + r.priceCells.length}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">이 숫자를 읽는 법</h2>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-[1.6] text-text-2">
          <li>
            · <strong className="text-ink">실거래 신고가</strong>입니다. 매물 호가·중개사 제시가가
            아니며, 계약 후 신고까지 시차가 있어 최근 달은 건수가 더 늘어날 수 있습니다.
          </li>
          <li>
            · 면적은 <strong className="text-ink">전용면적</strong> 기준입니다. 분양면적(공급면적)
            으로 부르는 평수와 다릅니다.
          </li>
          <li>
            · 구간 평균은 그 구간에 신고된 거래만의 평균입니다. 지역 전체 시세나 특정 단지의
            현재 가격을 뜻하지 않습니다.
          </li>
          <li>
            · 거래 {MIN_BAND_TX}건 미만 구간은 평균이 한두 건에 흔들려 페이지를 만들지 않습니다.
            그 구간의 거래는 위 합계에도 포함하지 않았습니다 — 없는 거래가 아니라, 평균을
            내기에 표본이 모자란 구간입니다.
          </li>
        </ul>
      </section>

      <p className="mb-8 text-[12px] text-text-3">
        단지 단위로 보려면{" "}
        <Link href="/complex/browse" className="font-bold text-primary underline">
          단지 실거래 브라우즈
        </Link>
        , 지역 시세 흐름은{" "}
        <Link href="/analysis/price" className="font-bold text-primary underline">
          가격 분석
        </Link>
        에서 확인하세요.
      </p>
    </PageShell>
  );
}
