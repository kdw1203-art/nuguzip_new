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
import { ToolHero, type HeroKpi } from "@/app/components/analysis/ToolHero";
import { Bars } from "@/app/components/viz/Bars";
import { RankBars } from "@/app/components/viz/RankBars";
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
  /** [AI-28] 실측 갭 = 평균 매매가 − 전세 신고 중앙값(최근 3개월, 표본 30건+) */
  measuredGap?: number;
  jeonseSample?: number;
  group: "서울" | "경기" | "인천";
};

/* 표 안 셀 배경 막대 — 값의 크기를 배경 길이로 먼저 보인다.
   숫자 7열짜리 표는 눈이 한 열씩 훑어야 순위가 잡힌다. */
function ratioBarStyle(ratio: number, max: number): React.CSSProperties {
  const w = max > 0 ? Math.min(100, Math.round((ratio / max) * 100)) : 0;
  return { ["--w" as string]: `${w}%` };
}

function fmtPeriod(period: string): string {
  const d = period.replace(/[^0-9]/g, "");
  if (d.length < 6) return period;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}`;
}

function RankTable({ rows, tone, maxRatio }: { rows: Row[]; tone: "high" | "low"; maxRatio: number }) {
  return (
    <div className="card overflow-x-auto rounded-[14px] px-4 py-2">
      <table className="t-body w-full min-w-[600px]">
        <thead>
          <tr className="t-sub border-b border-line text-left text-text-3">
            <th className="py-2 pr-3 font-semibold">지역</th>
            <th className="py-2 pr-3 text-right font-semibold">전세가율</th>
            <th className="py-2 pr-3 text-right font-semibold">평균 매매가</th>
            <th className="py-2 pr-3 text-right font-semibold">갭(실측 우선)</th>
            <th className="py-2 pr-3 text-right font-semibold">월세 환산</th>
            <th className="py-2 pr-3 text-right font-semibold">매매지수 변동</th>
            <th className="py-2 text-right font-semibold">기준</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.regionId} className="row-hl border-b border-divider last:border-0">
              <td className="py-2.5 pr-3">
                <Link
                  href={`/region/${r.regionId}`}
                  className="font-bold text-ink underline-offset-2 hover:underline"
                >
                  {r.name}
                </Link>
              </td>
              <td
                className={`cell-bar py-2.5 pr-3 text-right font-extrabold tabular-nums ${
                  tone === "high" ? "text-primary" : "text-text-2"
                }`}
                style={ratioBarStyle(r.ratio, maxRatio)}
              >
                {r.ratio.toFixed(1)}%
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-text-1">
                {r.avgSale && r.avgSale > 0 ? formatKrwShort(r.avgSale) : "—"}
              </td>
              <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-ink">
                {r.measuredGap !== undefined ? (
                  <>
                    {formatKrwShort(r.measuredGap)}
                    <span className="t-caption ml-1 rounded bg-success-soft px-1 py-px font-extrabold text-success">실측</span>
                  </>
                ) : r.gap !== undefined ? (
                  <>
                    {formatKrwShort(r.gap)}
                    <span className="t-caption ml-1 rounded bg-bg px-1 py-px font-extrabold text-text-3">추정</span>
                  </>
                ) : (
                  "—"
                )}
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
              <td className="t-sub py-2.5 text-right text-text-3">
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
        const yr = yieldMap.get(r.name);
        const y = rentYieldPct(r.avgSale, yr);
        if (y !== null) r.rentYield = Math.round(y * 10) / 10;
        /* [AI-28] 전월세 신고 실측 갭 — 추정(비율 환산)을 실측으로 대체 */
        if (
          yr &&
          yr.jeonseCount >= 30 &&
          yr.jeonseMedianDepositKrw &&
          r.avgSale &&
          r.avgSale > yr.jeonseMedianDepositKrw
        ) {
          r.measuredGap = Math.round(r.avgSale - yr.jeonseMedianDepositKrw);
          r.jeonseSample = yr.jeonseCount;
        }
      }
    }
  }

  rows = rows.sort((a, b) => b.ratio - a.ratio);
  const top = rows.slice(0, 15);
  const bottom = [...rows].reverse().slice(0, 10);
  const median =
    rows.length > 0 ? rows[Math.floor(rows.length / 2)].ratio : null;
  const maxRatio = rows.length > 0 ? rows[0].ratio : 0;

  /* 분포 히스토그램 — 표만 보면 "내 지역이 높은 편인가"를 알 수 없다.
     5%p 구간으로 세어 전국이 어디 몰려 있는지를 먼저 보인다. */
  const BIN = 5;
  const binned = new Map<number, number>();
  for (const r of rows) {
    const b = Math.floor(r.ratio / BIN) * BIN;
    binned.set(b, (binned.get(b) ?? 0) + 1);
  }
  const binKeys = [...binned.keys()].sort((a, b) => a - b);
  const histValues = binKeys.map((k) => binned.get(k) ?? 0);
  const histLabels = binKeys.map((k) => `${k}%`);

  const measured = rows.filter((r) => r.measuredGap !== undefined).length;
  const kpis: HeroKpi[] = [];
  if (rows.length > 0) {
    kpis.push({ label: "집계 지역", value: `${rows.length}곳`, note: "서울·경기·인천" });
    if (median !== null) {
      kpis.push({ label: "전세가율 중앙값", value: `${median.toFixed(1)}%`, note: "절반이 이 값보다 높다" });
    }
    kpis.push({
      label: "가장 높은 곳",
      value: `${rows[0].ratio.toFixed(1)}%`,
      note: `${rows[0].name} · 갭이 가장 작다`,
    });
    kpis.push({
      label: "가장 낮은 곳",
      value: `${rows[rows.length - 1].ratio.toFixed(1)}%`,
      note: `${rows[rows.length - 1].name} · 갭이 가장 크다`,
    });
    if (measured > 0) {
      kpis.push({
        label: "실측 갭 지역",
        value: `${measured}곳`,
        note: "전세 신고 30건 이상 — 나머지는 비율 환산 추정",
      });
    }
  }

  return (
    <PageShell breadcrumb="AI 분석 › 전세가율·갭">
      <ToolHero
        eyebrow="지역·시장 흐름"
        icon="landmark"
        title="전세가율·갭 스크리너"
        toneClass="text-success"
        lead="수도권 시군구를 전세가율 순으로 줄 세워, 갭이 작은 곳과 큰 곳을 한 화면에서 봅니다."
        kpis={kpis}
        chart={
          histValues.length > 1 ? (
            <div className="rounded-[12px] border border-line bg-surface px-2 pb-1 pt-2 text-success">
              <span className="t-caption block px-1 pb-1 text-text-3">
                전세가율 분포 · {BIN}%p 구간별 지역 수
              </span>
              <Bars
                values={histValues}
                labels={histLabels}
                height={78}
                valueSuffix="곳"
                ariaLabel="전세가율 분포 히스토그램"
              />
            </div>
          ) : null
        }
        source="한국부동산원(REB)·KB 공표 지역 통계 — 지역·출처별 공표 주기가 달라 기준 시점이 지역마다 다릅니다(표의 기준 열 참고)."
      />

      <p className="mb-4 mt-4 max-w-[720px] t-body text-text-2">
        전세가율은 매매가 대비 전세가의 비율이고, 높을수록 갭이 작습니다. 갭은{" "}
        <b className="text-ink">평균 매매가 − 전세 신고 중앙값(최근 3개월)</b>의{" "}
        <b className="text-ink">실측</b>을 우선 표시하고, 전세 표본이 30건 미만인 지역만
        비율 환산 <b className="text-ink">추정</b>으로 대신합니다. 전월세 신고는
        갱신·신규 계약이 구분되지 않아 실측값에도 그 한계가 섞여 있으며, 단지·면적에
        따라 실제 갭은 크게 다릅니다.
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
          <section className="mb-6" data-reveal="">
            <h2 className="mb-2 t-title text-ink">
              전세가율 상위 — 갭이 작은 지역 TOP {top.length}
            </h2>
            {/* 막대가 먼저, 표는 그 아래. 순위는 길이로 읽고 세부는 표에서 읽는다 */}
            <div className="card mb-2 rounded-[14px] p-3 text-success">
              <RankBars
                rows={top.map((r) => ({
                  key: r.regionId,
                  label: r.name,
                  value: r.ratio,
                  href: `/region/${r.regionId}`,
                }))}
                suffix="%"
                max={maxRatio}
              />
            </div>
            <RankTable rows={top} tone="high" maxRatio={maxRatio} />
            <p className="mt-2 t-sub text-text-3">
              전세가율이 높은 지역은 갭이 작은 만큼, 전세가 하락 시 보증금 반환 부담
              (역전세)·매매가와 전세가 역전 위험도 함께 큽니다. 갭이 작다는 산술이
              &lsquo;안전하다&rsquo;는 뜻이 아닙니다.
            </p>
          </section>

          <section className="mb-6" data-reveal="">
            <h2 className="mb-2 t-title text-ink">
              전세가율 하위 — 갭이 큰 지역 {bottom.length}곳
            </h2>
            <div className="card mb-2 rounded-[14px] p-3 text-warning">
              <RankBars
                rows={bottom.map((r) => ({
                  key: r.regionId,
                  label: r.name,
                  value: r.ratio,
                  href: `/region/${r.regionId}`,
                }))}
                suffix="%"
                max={maxRatio}
              />
            </div>
            <RankTable rows={bottom} tone="low" maxRatio={maxRatio} />
          </section>

          {/* [#78 v2] 시도별 전체 표 — 앵커 점프로 필터를 대신한다(파라미터 없는 ISR 유지) */}
          <div className="mb-3 flex flex-wrap gap-2" data-reveal="">
            {(["서울", "경기", "인천"] as const).map((g) => (
              <a
                key={g}
                href={`#sido-${g}`}
                className="chip t-sub border border-line bg-surface px-3.5 py-1.5 font-bold text-primary no-underline transition-colors hover:bg-primary-soft"
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
                <h2 className="mb-2 t-title text-ink">
                  {g} 전체 — 전세가율 순 {groupRows.length}개 지역
                </h2>
                <RankTable rows={groupRows} tone="high" maxRatio={maxRatio} />
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
            <h2 className="mb-2 t-title text-ink">자주 묻는 질문</h2>
            <div className="flex flex-col gap-2">
              {faq.map((f) => (
                <details key={f.q} className="card tile rounded-[14px] px-4 py-3">
                  <summary className="cursor-pointer t-section text-ink">{f.q}</summary>
                  <p className="mt-2 t-body text-text-2">{f.a}</p>
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

      <p className="mt-6 t-caption text-text-3">
        출처: 한국부동산원(REB)·KB 공표 지역 통계 — 지역·출처별 최신 공표 주기 기준이라
        시점이 지역마다 다를 수 있습니다(각 행의 기준 열 참고). 본 화면은 공표 통계의
        산술 정리이며 투자 권유가 아닙니다. 판단과 책임은 이용자에게 있습니다.
      </p>
    </PageShell>
  );
}
