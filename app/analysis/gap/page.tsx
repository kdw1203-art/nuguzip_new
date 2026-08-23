import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { getAllRegionSnapshots } from "@/lib/market/store";
import { formatKrwShort } from "@/lib/market/format";
import {
  getRegionRentYieldMap,
  rentYieldPct,
  type RegionRentYieldMap,
} from "@/lib/market/rent-yield";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { logger } from "@/lib/log";
import { ErrorState } from "@/app/components/ui";
import { faqJsonLd, jsonLdScript } from "@/lib/seo/jsonld";

/* [3차 · AI 분석 확충] 전세가율·갭 스크리너.
 *
 * 데이터: market_region_price 전 지역 스냅샷(REB/KB 공표 통계 — 이미 매일 적재됨).
 * 화면: 전세가율 상·하위 지역 랭킹과 "추정 갭"(평균 매매가 − 평균 매매가×전세가율).
 * 원칙: 산술 사실만 서술한다. 전세가율이 높다 = 갭이 작다는 산술이지 "사도 된다"가
 * 아니며, 그 동전의 뒷면(역전세·보증금 위험)을 같은 화면에서 함께 말한다.
 * 지역 평균은 단지·면적별 편차를 가리므로 각 행이 지역 허브로 연결된다. */

export const metadata = buildPageMetadata({
  title: "전세가율·갭 스크리너 — 지역별 랭킹",
  description:
    "전국 시군구 전세가율 상·하위 랭킹과 평균 매매가 기준 추정 갭. 한국부동산원·KB 공표 통계 기반.",
  path: "/analysis/gap",
  og: { badge: "AI 분석", sub: "전세가율 랭킹 · 추정 갭 — 공표 통계 기반" },
});

export const revalidate = 3600;

type Row = {
  regionId: string;
  name: string;
  ratio: number;
  avgSale?: number;
  gap?: number;
  period: string;
  source: string;
  /** 월간 매매지수 변동(%) — 스냅샷의 sale_change (없으면 undefined) */
  saleChange?: number;
  /** [#94 잔여] 월세 환산 수익률(연 %) — 표본 30건 미만·분모 0 이하면 undefined */
  rentYield?: number;
  group: "서울" | "경기" | "인천";
};

function fmtPeriod(period: string): string {
  const d = period.replace(/[^0-9]/g, "");
  if (d.length < 6) return period;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}`;
}

function RankTable({ rows, tone }: { rows: Row[]; tone: "high" | "low" }) {
  return (
    <div className="card overflow-x-auto rounded-2xl px-4 py-2">
      <table className="w-full min-w-[600px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] text-text-3">
            <th className="py-2 pr-3 font-semibold">지역</th>
            <th className="py-2 pr-3 text-right font-semibold">전세가율</th>
            <th className="py-2 pr-3 text-right font-semibold">평균 매매가</th>
            <th className="py-2 pr-3 text-right font-semibold">추정 갭</th>
            <th className="py-2 pr-3 text-right font-semibold">월세 환산</th>
            <th className="py-2 pr-3 text-right font-semibold">매매지수 변동</th>
            <th className="py-2 text-right font-semibold">기준</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.regionId} className="border-b border-[#f0f3f8] last:border-0">
              <td className="py-2.5 pr-3">
                <Link
                  href={`/region/${r.regionId}`}
                  className="font-bold text-ink underline-offset-2 hover:underline"
                >
                  {r.name}
                </Link>
              </td>
              <td
                className={`py-2.5 pr-3 text-right font-extrabold tabular-nums ${
                  tone === "high" ? "text-primary" : "text-ink"
                }`}
              >
                {r.ratio.toFixed(1)}%
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-text-1">
                {r.avgSale && r.avgSale > 0 ? formatKrwShort(r.avgSale) : "—"}
              </td>
              <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-ink">
                {r.gap !== undefined ? formatKrwShort(r.gap) : "—"}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-text-1">
                {r.rentYield !== undefined ? `${r.rentYield.toFixed(1)}%` : "—"}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">
                {r.saleChange === undefined ? (
                  <span className="text-text-3">—</span>
                ) : Math.abs(r.saleChange) < 0.005 ? (
                  <span className="text-text-3">보합</span>
                ) : r.saleChange > 0 ? (
                  <span className="font-bold text-danger">▲ {r.saleChange.toFixed(2)}%</span>
                ) : (
                  <span className="font-bold text-primary">▼ {Math.abs(r.saleChange).toFixed(2)}%</span>
                )}
              </td>
              <td className="py-2.5 text-right text-[11px] text-text-3">
                {fmtPeriod(r.period)} · {r.source.toUpperCase()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function GapScreenerPage() {
  let rows: Row[] = [];
  let loadFailed = false;
  try {
    const map = await getAllRegionSnapshots();
    for (const [regionId, s] of map) {
      if (s.jeonseRatio === undefined || !Number.isFinite(s.jeonseRatio)) continue;
      if (s.jeonseRatio <= 0 || s.jeonseRatio >= 100) continue; // 자료 오류 방어
      const avgSale = s.avgSale && s.avgSale > 0 ? s.avgSale : undefined;
      rows.push({
        regionId,
        name: s.regionName,
        ratio: s.jeonseRatio,
        avgSale,
        gap: avgSale !== undefined ? Math.round(avgSale * (1 - s.jeonseRatio / 100)) : undefined,
        period: s.period,
        source: s.source,
        saleChange:
          s.saleChangeMonthly !== undefined && Number.isFinite(s.saleChangeMonthly)
            ? s.saleChangeMonthly
            : undefined,
        group: regionId.startsWith("incheon-")
          ? "인천"
          : /^[^\s]+구$/.test(s.regionName.trim())
            ? "서울"
            : "경기",
      });
    }
  } catch (e) {
    logger.error("[analysis/gap] 스냅샷 로드 실패", e);
    loadFailed = true;
  }

  /* [#94 잔여] 월세 환산 수익률 — RPC 1회로 전 지역 중앙값을 받아 행에 붙인다.
     실패는 열 결측("—")일 뿐 페이지 실패가 아니다 — 본문(전세가율)은 그대로 산다. */
  if (!loadFailed && rows.length > 0) {
    let yieldMap: RegionRentYieldMap | null = null;
    try {
      yieldMap = await getRegionRentYieldMap();
    } catch (e) {
      logger.error("[analysis/gap] 월세 수익률 RPC 실패 — 열 없이 렌더", e);
    }
    if (yieldMap) {
      for (const r of rows) {
        const y = rentYieldPct(r.avgSale, yieldMap.get(r.name));
        if (y !== null) r.rentYield = Math.round(y * 10) / 10;
      }
    }
  }

  rows = rows.sort((a, b) => b.ratio - a.ratio);
  const top = rows.slice(0, 15);
  const bottom = [...rows].reverse().slice(0, 10);
  const median =
    rows.length > 0 ? rows[Math.floor(rows.length / 2)].ratio : null;

  return (
    <PageShell breadcrumb="AI 분석 › 전세가율·갭" title="전세가율·갭 스크리너">
      <p className="rise-in mb-4 max-w-[720px] text-[13px] leading-[1.8] text-text-2">
        전세가율은 매매가 대비 전세가의 비율입니다. 비율이 높을수록 매매가와 전세가의
        차이(갭)가 작다는 뜻입니다. 아래 추정 갭은{" "}
        <b className="text-ink">평균 매매가 × (1 − 전세가율)</b>로 계산한 지역 평균값이며,
        단지·면적에 따라 실제 갭은 크게 다릅니다.
        {median !== null && (
          <>
            {" "}
            지금 집계된 {rows.length}개 지역의 전세가율 중앙값은{" "}
            <b className="text-ink">{median.toFixed(1)}%</b>입니다.
          </>
        )}
      </p>

      {loadFailed ? (
        <ErrorState
          title="지역 시세를 지금 불러오지 못했어요"
          desc="조회가 실패했습니다. 전세가율 데이터가 없다는 뜻은 아니에요 — 잠시 후 다시 열어봐 주세요."
        />
      ) : rows.length === 0 ? (
        <ErrorState
          title="전세가율 데이터가 아직 없어요"
          desc="공표 통계 적재 후 표시됩니다. 시세 지수 적재(매일)가 끝나면 채워져요."
          action={{ href: "/analysis", label: "다른 분석 도구 보기" }}
        />
      ) : (
        <>
          <section className="rise-in-1 mb-6">
            <h2 className="mb-2 text-[15px] font-extrabold text-ink">
              전세가율 상위 — 갭이 작은 지역 TOP {top.length}
            </h2>
            <RankTable rows={top} tone="high" />
            <p className="mt-2 text-[11.5px] leading-[1.7] text-text-3">
              ⚠️ 전세가율이 높은 지역은 갭이 작은 만큼, 전세가 하락 시 보증금 반환 부담
              (역전세)·매매가와 전세가 역전 위험도 함께 큽니다. 갭이 작다는 산술이
              &lsquo;안전하다&rsquo;는 뜻이 아닙니다.
            </p>
          </section>

          <section className="rise-in-2 mb-6">
            <h2 className="mb-2 text-[15px] font-extrabold text-ink">
              전세가율 하위 — 갭이 큰 지역 {bottom.length}곳
            </h2>
            <RankTable rows={bottom} tone="low" />
          </section>

          {/* [#78 v2] 시도별 전체 표 — 앵커 점프로 필터를 대신한다(파라미터 없는 ISR 유지) */}
          <div className="rise-in-2 mb-3 flex flex-wrap gap-2">
            {(["서울", "경기", "인천"] as const).map((g) => (
              <a
                key={g}
                href={`#sido-${g}`}
                className="chip border border-line bg-surface px-3.5 py-1.5 text-[12px] font-bold text-primary no-underline"
              >
                {g} 전체 ({rows.filter((r) => r.group === g).length})
              </a>
            ))}
          </div>
          {(["서울", "경기", "인천"] as const).map((g) => {
            const groupRows = rows.filter((r) => r.group === g);
            if (groupRows.length === 0) return null;
            return (
              <section key={g} id={`sido-${g}`} className="mb-6 scroll-mt-20">
                <h2 className="mb-2 text-[15px] font-extrabold text-ink">
                  {g} 전체 — 전세가율 순 {groupRows.length}개 지역
                </h2>
                <RankTable rows={groupRows} tone="high" />
              </section>
            );
          })}
        </>
      )}

      {/* [#55] FAQ — 화면에 실제로 보이는 문답과 같은 배열로만 JSON-LD 생성 (허위 표기 금지 규칙) */}
      {(() => {
        const faq = [
          {
            q: "전세가율이란 무엇인가요?",
            a: "매매가 대비 전세가의 비율입니다. 예를 들어 매매가 10억 원, 전세가 7억 원이면 전세가율은 70%입니다. 비율이 높을수록 매매가와 전세가의 차이(갭)가 작습니다.",
          },
          {
            q: "추정 갭은 어떻게 계산하나요?",
            a: "평균 매매가 × (1 − 전세가율)로 계산합니다. 지역 평균 기준이므로 단지·면적에 따라 실제 갭은 크게 다를 수 있습니다.",
          },
          {
            q: "전세가율이 높으면 안전한 지역인가요?",
            a: "아닙니다. 전세가율이 높다는 것은 갭이 작다는 산술일 뿐이며, 전세가 하락 시 보증금 반환 부담(역전세)과 매매가·전세가 역전 위험도 함께 커집니다.",
          },
          {
            q: "월세 환산 수익률은 어떻게 계산하나요?",
            a: "최근 3개월 그 지역 월세 신고의 중앙값을 써서, (월세 중앙값 × 12) ÷ (평균 매매가 − 월세 보증금 중앙값)으로 계산한 연 수익률입니다. 지역 평균 매매가와 단지가 뒤섞인 중앙값의 결합이라 참고 지표이며, 표본이 30건 미만인 지역은 표시하지 않습니다. 세금·수리비·공실은 반영되지 않습니다.",
          },
        ];
        return (
          <section className="mt-8">
            <h2 className="mb-2 text-[15px] font-extrabold text-ink">자주 묻는 질문</h2>
            <div className="flex flex-col gap-2">
              {faq.map((f) => (
                <details key={f.q} className="card rounded-xl px-4 py-3">
                  <summary className="cursor-pointer text-[13.5px] font-bold text-ink">{f.q}</summary>
                  <p className="mt-2 text-[13px] leading-[1.8] text-text-2">{f.a}</p>
                </details>
              ))}
            </div>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: jsonLdScript([faqJsonLd(faq)]) }}
            />
          </section>
        );
      })()}

      <p className="mt-6 text-[11px] leading-[1.7] text-text-3">
        출처: 한국부동산원(REB)·KB 공표 지역 통계 — 지역·출처별 최신 공표 주기 기준이라
        시점이 지역마다 다를 수 있습니다(각 행의 기준 열 참고). 본 화면은 공표 통계의
        산술 정리이며 투자 권유가 아닙니다. 판단과 책임은 이용자에게 있습니다.
      </p>
    </PageShell>
  );
}
