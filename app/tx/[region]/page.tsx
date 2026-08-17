import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import {
  findTxRegionBySlug,
  listTxRegions,
  type BandCell,
  type TxRegionSummary,
} from "@/lib/market/tx-bands";
import { BAND_KIND_LABEL, type BandKind } from "@/lib/market/bands";
import { formatKrwShort, formatYmRange } from "@/lib/market/format";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { QaBlock } from "@/app/components/QaBlock";
import { CitationBlock } from "@/app/components/CitationBlock";

/* ============================================================
   지역 실거래 구간 허브 — /tx/[region]
   그 지역의 면적대·가격대 랜딩을 한자리에 모은다.
   region 슬러그는 market_transactions.region_name 의 공백을 하이픈으로 바꾼 값이며,
   DB 에 없는 값은 404 (임의 문자열로 빈 페이지가 양산되는 걸 막는다).
   ============================================================ */

export const revalidate = 3600;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { region: string }[] {
  return [];
}


/**
 * null 은 "그런 지역이 없다"(→ 404) 일 때만이다. 조회 실패는 던진다 —
 * 예전의 `.catch(() => null)` 은 DB 장애를 404 로 바꿔 크롤러에게 "이 URL 은
 * 없어졌다" 고 확정 신고하는 꼴이었다(5xx 는 재시도를 부르지만 404 는 색인에서
 * 지운다). 자세한 경위는 lib/market/tx-bands.ts 헤더 참고.
 */
async function load(regionSlug: string): Promise<TxRegionSummary | null> {
  return findTxRegionBySlug(regionSlug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string }>;
}): Promise<Metadata> {
  const { region: slug } = await params;
  const region = await load(slug);
  if (!region) {
    return { title: "지역 실거래 구간 | 누구집", robots: { index: false, follow: false } };
  }
  const range = formatYmRange(region.firstYm, region.latestYm);
  const title = `${region.name} 아파트 실거래 ${region.txCount.toLocaleString("ko-KR")}건 — 면적대·가격대별 | 누구집`;
  const description = `${region.name} 아파트 매매 실거래를 면적대(${region.areaCells.length}구간)·가격대(${region.priceCells.length}구간)로 나눠 봅니다. 국토교통부 신고 기준${
    range ? ` ${range}` : ""
  } ${region.txCount.toLocaleString("ko-KR")}건. 매물 호가가 아닙니다.`;
  const path = `/tx/${encodeURIComponent(region.slug)}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://nuguzip.com${path}`, type: "website" },
  };
}

function BandTable({
  region,
  kind,
  cells,
}: {
  region: TxRegionSummary;
  kind: BandKind;
  cells: BandCell[];
}) {
  if (cells.length === 0) return null;
  return (
    <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
      <h2 className="text-[15px] font-extrabold text-ink">
        {BAND_KIND_LABEL[kind]}별{" "}
        <span className="text-[11px] font-medium text-text-3">
          {kind === "area" ? "전용면적 기준" : "거래금액 기준"} · {cells.length}구간
        </span>
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[460px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] text-text-3">
              <th className="py-2 font-medium">{kind === "area" ? "전용면적" : "거래금액"}</th>
              <th className="py-2 font-medium">거래</th>
              <th className="py-2 font-medium">단지</th>
              <th className="py-2 text-right font-medium">중앙값</th>
              <th className="py-2 text-right font-medium">평균</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => (
              <tr key={c.bandSlug} className="border-b border-border last:border-b-0">
                <td className="py-2.5">
                  <Link
                    href={`/tx/${encodeURIComponent(region.slug)}/${kind}/${c.bandSlug}`}
                    className="font-bold text-primary underline"
                  >
                    {c.bandLabel}
                  </Link>
                </td>
                <td className="py-2.5 text-text-2">{c.txCount.toLocaleString("ko-KR")}건</td>
                <td className="py-2.5 text-text-2">{c.complexCount.toLocaleString("ko-KR")}곳</td>
                <td className="py-2.5 text-right font-extrabold text-ink">
                  {formatKrwShort(c.medianKrw)}
                </td>
                <td className="py-2.5 text-right text-text-2">{formatKrwShort(c.avgKrw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* G5+G12 — 지역 Q&A: 이 페이지가 이미 가진 실데이터로만 답을 만든다.
   수치가 없으면 그 질문은 넣지 않는다(빈 답·추정 금지). */
function buildRegionFaq(region: TxRegionSummary, range: string | null): FaqItem[] {
  const items: FaqItem[] = [];
  if (region.txCount > 0) {
    items.push({
      q: `${region.name} 아파트 실거래는 몇 건인가요?`,
      a: `국토교통부 신고 기준${range ? ` ${range}` : ""} ${region.name} 아파트 매매 실거래는 ${region.txCount.toLocaleString("ko-KR")}건, 거래 단지는 ${region.complexCount.toLocaleString("ko-KR")}곳입니다. 매물 호가가 아닌 신고된 실거래만 집계한 값입니다.`,
    });
  }
  const topArea = [...region.areaCells].sort((a, b) => b.txCount - a.txCount)[0];
  if (topArea) {
    items.push({
      q: `${region.name}에서 가장 거래가 많은 면적대는 어디인가요?`,
      a: `전용면적 ${topArea.bandLabel} 구간이 ${topArea.txCount.toLocaleString("ko-KR")}건으로 가장 많이 거래됐고, 이 구간의 거래금액 중앙값은 ${formatKrwShort(topArea.medianKrw)}입니다${range ? ` (${range} 신고 기준)` : ""}.`,
    });
  }
  const topPrice = [...region.priceCells].sort((a, b) => b.txCount - a.txCount)[0];
  if (topPrice) {
    items.push({
      q: `${region.name} 아파트는 주로 어느 가격대에서 거래되나요?`,
      a: `${topPrice.bandLabel} 구간의 거래가 ${topPrice.txCount.toLocaleString("ko-KR")}건으로 가장 많습니다${range ? ` (${range} 신고 기준)` : ""}. 계약 후 신고까지 최대 30일의 시차가 있어 최근 달 수치는 이후 늘어날 수 있습니다.`,
    });
  }
  return items;
}

export default async function TxRegionPage({
  params,
}: {
  params: Promise<{ region: string }>;
}) {
  const { region: slug } = await params;
  const region = await load(slug);
  if (!region) notFound();

  const range = formatYmRange(region.firstYm, region.latestYm);
  const faq = buildRegionFaq(region, range);

  /* 웹9 — 같은 시/도의 다른 지역 칩. region.name 은 "서울 강남구" 꼴이라 첫
     토큰이 시/도다(좌표 인접 계산은 다음 단계 — 지금은 행정 그룹만). 실재하는
     허브(listTxRegions 결과 = /tx 목록과 동일)만 링크한다 — 죽은 링크 금지.
     조회 실패면 칩 없이 렌더한다(보조 내비게이션이라 페이지를 막지 않는다). */
  const sido = region.name.split(" ")[0] ?? "";
  let siblings: TxRegionSummary[] = [];
  if (sido) {
    try {
      siblings = (await listTxRegions())
        .filter((r) => r.slug !== region.slug && r.name.split(" ")[0] === sido)
        .slice(0, 12);
    } catch {
      siblings = [];
    }
  }

  /* S18/G15 — Dataset 스키마: 이 페이지가 실제로 보여주는 집계를 데이터셋으로 기술.
     구글 데이터셋 검색 노출 + AI 의 출처 인식(원출처 국토교통부 명시). */
  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${region.name} 아파트 매매 실거래 집계`,
    description: `${region.name} 아파트 매매 실거래 ${region.txCount.toLocaleString("ko-KR")}건의 면적대·가격대별 집계${range ? ` (${range} 신고 기준)` : ""}. 해제 신고분 제외.`,
    url: `https://nuguzip.com/tx/${encodeURIComponent(region.slug)}`,
    inLanguage: "ko-KR",
    creator: { "@id": "https://nuguzip.com/#organization" },
    isBasedOn: "https://rt.molit.go.kr",
    license: "https://nuguzip.com/methodology",
    keywords: [region.name, "아파트", "실거래가", "매매"],
    /* 항목 45 — 기계 판독용 신선도·기간·인용 가능한 API. 값은 전부 페이지가
       이미 가진 실데이터에서만 온다 — 없으면 필드 자체를 넣지 않는다. */
    ...(region.lastDataAt
      ? { dateModified: region.lastDataAt.toISOString().slice(0, 10) }
      : {}),
    ...(region.firstYm && region.latestYm
      ? {
          temporalCoverage: `${region.firstYm.slice(0, 4)}-${region.firstYm.slice(4, 6)}/${region.latestYm.slice(0, 4)}-${region.latestYm.slice(4, 6)}`,
        }
      : {}),
    distribution: [
      {
        "@type": "DataDownload",
        contentUrl: "https://nuguzip.com/api/public/v1/regions/monthly",
        encodingFormat: "application/json",
      },
    ],
  };
  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "지역별 실거래 구간", url: "/tx" },
    { name: region.name, url: `/tx/${encodeURIComponent(region.slug)}` },
  ]);

  return (
    <PageShell
      breadcrumb={`홈 › 지역별 실거래 구간 › ${region.name}`}
      title={`${region.name} 면적대·가격대별 실거래`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([crumbs, datasetJsonLd]) }}
      />

      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        국토교통부 아파트 매매 실거래{" "}
        <strong className="text-ink">{region.txCount.toLocaleString("ko-KR")}건</strong>
        {range && ` (${range} 신고 기준)`} · 단지{" "}
        <strong className="text-ink">{region.complexCount.toLocaleString("ko-KR")}곳</strong>. 매물
        호가가 아닙니다.
      </p>

      <BandTable region={region} kind="area" cells={region.areaCells} />
      <BandTable region={region} kind="price" cells={region.priceCells} />

      {/* G5+G13 — 실데이터 기반 Q&A + FAQPage 스키마 (같은 배열에서 생성) */}
      <QaBlock title={`${region.name} 실거래 Q&A`} items={faq} />

      {/* G8 — 인용 유도: 출처·기준월이 붙은 완결 인용문 제공 */}
      {region.txCount > 0 && (
        <CitationBlock
          sentence={`누구집(nuguzip.com) 집계에 따르면, ${region.name} 아파트 매매 실거래는${range ? ` ${range}` : ""} ${region.txCount.toLocaleString("ko-KR")}건이다 (국토교통부 실거래 신고 기반, 해제분 제외).`}
        />
      )}

      {/* 웹9 — 같은 시/도 인접 지역 칩 (실재 허브만) */}
      {siblings.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[13px] font-extrabold text-ink">
            {sido}의 다른 지역{" "}
            <span className="text-[11px] font-medium text-text-3">거래 많은 순</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {siblings.map((s) => (
              <Link
                key={s.slug}
                prefetch={false}
                href={`/tx/${encodeURIComponent(s.slug)}`}
                className="chip border border-line bg-bg px-3 py-1.5 text-[12px] font-bold text-text-2 no-underline transition-colors hover:border-primary hover:text-primary"
              >
                {s.name.slice(sido.length).trim() || s.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="mb-8 text-[12px] leading-[1.7] text-text-3">
        거래 10건 미만 구간은 평균이 한두 건에 크게 흔들려 따로 페이지를 만들지 않습니다. 면적은
        전용면적 기준이며, 계약 후 신고까지 시차가 있어 최근 달 건수는 더 늘어날 수 있습니다.
        <br />
        <Link href="/tx" className="font-bold text-primary underline">
          다른 지역 보기
        </Link>
        {" · "}
        <Link href="/complex/browse" className="font-bold text-primary underline">
          단지별 실거래 브라우즈
        </Link>
        {" · "}
        {/* 시세(보기) → 임장(가기) 연결 — 같은 지역 원천이라 슬러그가 1:1 이다 */}
        <Link
          href={`/imjang/${encodeURIComponent(region.slug)}`}
          className="font-bold text-primary underline"
        >
          이 지역 임장 가이드
        </Link>
      </p>
    </PageShell>
  );
}
