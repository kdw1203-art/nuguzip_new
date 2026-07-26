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
import { logger } from "@/lib/log";

/* ============================================================
   실거래 구간 인덱스 — /tx
   국토교통부 실거래(market_transactions) 기반 지역 목록.
   면적대·가격대 랜딩(/tx/[region]/[kind]/[band])의 진입점이자
   프로그래매틱 SEO 페이지들을 크롤러에 이어 주는 허브.

   ── "못 읽었다" 와 "없다" 를 절대 섞지 않는다 ──────────────────
   이 페이지는 예전에 `listTxRegions().catch(() => [])` 로 실패를 빈 배열로
   바꿨다. 2026-07-25 에 market_agg MV 의 GRANT 가 사라져 모든 조회가
   42501(permission denied)로 떨어졌을 때, 그 빈 배열이 "실거래 데이터를
   불러오지 못했습니다" 로 렌더돼 프리렌더 HTML 에 굳었고 — 배포가
   revalidate(1시간)보다 잦아 스스로 낫지도 않았다 — 하루 동안 아무도 몰랐다.
   로그에는 경고 한 줄뿐이었고 오류 코드조차 남지 않았다.

   그래서 지금은 로더가 예외를 던지고(lib/market/tx-bands.ts), 이 페이지가
   세 가지 상태를 각각 다르게 렌더한다:
     1) 정상 — 지역 목록
     2) 조회 실패 — 그렇게 말하고, robots noindex 를 건다(깨진 페이지를
        색인시키지 않는다). 원인은 서버 로그에 code·hint 까지 남긴다.
     3) 정말로 빈 결과 — "아직 구간이 없다" 는 별개의 문장
   ============================================================ */

export const revalidate = 3600;

const PATH = "/tx";

type TxIndexData = {
  regions: TxRegionSummary[];
  coverage: Awaited<ReturnType<typeof getTxCoverage>> | null;
  /** 조회 자체가 실패한 사유. null 이면 "읽었고 결과가 이만큼" 이라는 뜻이다. */
  loadError: string | null;
};

/**
 * 순차로 부른다(Promise.all 아님). getTxCoverage() 는 listTxRegions() 가 채워 둔
 * 모듈 캐시를 그대로 쓰므로, 나란히 띄우면 같은 쿼리를 두 번 던지게 된다.
 */
async function loadTxIndex(): Promise<TxIndexData> {
  try {
    const regions = await listTxRegions();
    const coverage = await getTxCoverage();
    return { regions, coverage, loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      "[/tx] 실거래 구간 집계를 읽지 못했습니다 — 거래가 없는 것이 아니라 조회가 실패했습니다:",
      message,
    );
    return { regions: [], coverage: null, loadError: message };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { regions, loadError } = await loadTxIndex();
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
    // 조회가 실패한 상태의 껍데기를 색인시키지 않는다. 다음 재검증에서 성공하면
    // 이 지시는 사라진다 — 실패를 색인에 남기는 것보다 잠깐 빠지는 편이 낫다.
    ...(loadError ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: "지역별 면적대·가격대 실거래 | 누구집",
      description,
      url: `https://nuguzip.com${PATH}`,
      type: "website",
    },
  };
}

export default async function TxIndexPage() {
  const { regions, coverage, loadError } = await loadTxIndex();
  const total = regions.reduce((s, r) => s + r.txCount, 0);
  // 커버리지: 구간에 정리된 건수(total)와 면적대 셀 전체 합을 분리해서 받는다.
  // 둘이 다르면 그 차이를 감추지 않고 문장으로 드러낸다 — 아래 uncovered 참고.
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

      {loadError ? (
        <section className="rise-in-1 card p-[var(--pad-card)]">
          <p className="py-8 text-center text-[13px] leading-[1.7] text-text-3">
            실거래 집계를 <strong className="text-ink">불러오지 못했습니다</strong>.
            <br />
            거래가 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻입니다. 잠시 후 다시
            확인해 주세요.
          </p>
        </section>
      ) : regions.length === 0 ? (
        <section className="rise-in-1 card p-[var(--pad-card)]">
          <p className="py-8 text-center text-[13px] leading-[1.7] text-text-3">
            아직 구간으로 정리된 지역이 없습니다.
            <br />
            한 구간에 거래 {MIN_BAND_TX}건이 모이면 이곳에 지역이 나타납니다.
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
