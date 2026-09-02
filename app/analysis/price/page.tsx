import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import { ToolHero, type HeroKpi } from "@/app/components/analysis/ToolHero";
import { Bars } from "@/app/components/viz/Bars";
import { RankBars } from "@/app/components/viz/RankBars";
import { findTemperatureRegionIdByName } from "@/lib/market/temperature";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import {
  listTxRegions,
  listBandComplexes,
  type BandCell,
  type BandComplex,
} from "@/lib/market/tx-bands";
import { RegionSelect } from "./RegionSelect";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { pickRegionByAnyName } from "@/lib/regions/param";
import { findCatalogRegionById } from "@/lib/region/catalog";

/* 면적대별 **실거래** 시세 분석 — 예전엔 이 경로가 손으로 적은 "적정가 산정 예시"
   (수치 전부 하드코딩)였다. 이제 tx_band_landing/complex 뷰(국토교통부 실거래)
   위에서 지역×면적대 평단가·중앙값·건수·단지수를 읽고, 같은 면적대의 지역 분위와
   면적 프리미엄(소형/대형 평단가 역전)을 계산한다. /tx 지역 랜딩과 색인 경쟁을
   피하려 noIndex 는 유지 — 여긴 SEO 페이지가 아니라 상호작용 분석 도구다. */
export const metadata = buildPageMetadata({
  title: "면적대별 실거래 시세 분석",
  description:
    "국토교통부 실거래가로 지역·면적대별 평단가와 지역 분위를 비교하고, 소형·대형 평단가 역전(면적 프리미엄)까지 한눈에 봅니다.",
  path: "/analysis/price",
  noIndex: true,
});

export const revalidate = 3600;

function eok(won: number): string {
  if (!won || won <= 0) return "—";
  const e = won / 100_000_000;
  const s = e >= 10 ? e.toFixed(1) : e.toFixed(2);
  return `${s.replace(/\.?0+$/, "")}억`;
}

/** 원/평 → "3,500만/평" (없으면 "—") */
function manPerPyeong(won: number | null): string {
  if (!won || won <= 0) return "—";
  return `${Math.round(won / 10_000).toLocaleString("ko-KR")}만/평`;
}

/** "202607" → "2026.07" */
function ymLabel(ym: string | null): string {
  if (!ym || ym.length < 6) return "";
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="card mx-auto mt-8 max-w-[560px] rounded-2xl px-5 py-10 text-center">
      <p className="text-[14px] font-extrabold text-ink">실거래 시세를 불러오지 못했어요</p>
      <p className="mt-1 text-[12px] leading-relaxed text-text-3">{msg}</p>
      <Link href="/tx" className="btn-soft btn-sm mt-4 inline-block no-underline">
        지역별 실거래 보기
      </Link>
    </div>
  );
}

export default async function PricePage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const sp = await searchParams;
  let regions;
  try {
    regions = await listTxRegions();
  } catch {
    return (
      <PageShell breadcrumb="AI 분석 · 면적대별 시세">
        <EmptyState msg="실거래 집계를 일시적으로 읽지 못했어요. 잠시 후 다시 시도해 주세요." />
      </PageShell>
    );
  }

  // 면적대 셀이 있는 지역만(가격대만 있는 지역 제외)
  const areaRegions = regions.filter((r) => r.areaCells.length > 0);
  if (areaRegions.length === 0) {
    return (
      <PageShell breadcrumb="AI 분석 · 면적대별 시세">
        <EmptyState msg="아직 면적대별로 정리된 실거래가 없어요." />
      </PageShell>
    );
  }

  /* [D62] `?region=` 은 화면마다 다른 말로 온다 — 지도는 "서울 강남구",
     타이밍·시나리오는 "gangnam", 여기 목록은 "서울-강남구". 예전에는 정확히
     일치할 때만 찾고 **아니면 조용히 첫 지역으로** 갔다: 사용자는 자기가 고른
     줄 알았던 다른 동네의 숫자를 봤다. 이제 어느 말로 와도 찾고, 정말 없으면
     못 찾았다고 화면에 적는다. */
  const wanted = (sp.region ?? "").trim();
  /* 카탈로그 id("gangnam")로 오는 경우가 있다 — 타이밍·시나리오가 쓰는 말이다.
     이 목록에는 id 칸이 없으므로(실거래 집계는 슬러그·한글명뿐), 먼저 id 를
     한글 지역명으로 옮긴 뒤 같은 매칭을 한 번 더 돌린다. 서버 전용 import 라
     클라이언트 번들에는 영향이 없다. */
  const wantedAsName = wanted ? (findCatalogRegionById(wanted)?.name ?? null) : null;
  const matched =
    (wanted ? pickRegionByAnyName(wanted, areaRegions) : null) ??
    (wantedAsName ? pickRegionByAnyName(wantedAsName, areaRegions) : null);
  const target = matched ?? areaRegions[0];
  const regionMissed = Boolean(wanted) && !matched;

  // 지역 분위 — 같은 면적대의 평단가를 수록 지역끼리 줄 세운다
  const perByBand = new Map<string, number[]>();
  for (const r of areaRegions) {
    for (const c of r.areaCells) {
      if (c.avgPerPyeongKrw && c.avgPerPyeongKrw > 0) {
        const arr = perByBand.get(c.bandSlug) ?? [];
        arr.push(c.avgPerPyeongKrw);
        perByBand.set(c.bandSlug, arr);
      }
    }
  }
  for (const arr of perByBand.values()) arr.sort((a, b) => a - b);

  /** 이 면적대·평단가가 수록 지역 중 상위 몇 %인가 (표본 8곳 미만이면 null). */
  function topPercentOf(bandSlug: string, v: number): number | null {
    const arr = perByBand.get(bandSlug);
    if (!arr || arr.length < 8) return null;
    const below = arr.filter((x) => x <= v).length;
    return Math.max(1, 100 - Math.round((below / arr.length) * 100));
  }

  const cells = target.areaCells; // 면적 순서(좁은 → 넓은)로 이미 정렬됨
  const maxPer = Math.max(...cells.map((c) => c.avgPerPyeongKrw ?? 0), 1);

  // 가장 거래 많은 면적대 → 대표 단지
  const busiest = [...cells].sort((a, b) => b.txCount - a.txCount)[0] ?? null;
  let topComplexes: BandComplex[] = [];
  if (busiest) {
    topComplexes = await listBandComplexes(target.name, "area", busiest.bandSlug, 8).catch(() => []);
  }

  // 면적 프리미엄 — 평단가 최고/최저 면적대
  const withPer = cells.filter((c): c is BandCell & { avgPerPyeongKrw: number } =>
    Boolean(c.avgPerPyeongKrw && c.avgPerPyeongKrw > 0),
  );
  const hiBand = withPer.length
    ? withPer.reduce((a, b) => (b.avgPerPyeongKrw > a.avgPerPyeongKrw ? b : a))
    : null;
  const loBand = withPer.length
    ? withPer.reduce((a, b) => (b.avgPerPyeongKrw < a.avgPerPyeongKrw ? b : a))
    : null;
  const premiumRatio =
    hiBand && loBand && loBand.avgPerPyeongKrw > 0
      ? hiBand.avgPerPyeongKrw / loBand.avgPerPyeongKrw
      : null;
  // 최고 평단가 면적대가 작은 평형이면 '소형 프리미엄', 큰 평형이면 '대형 프리미엄'
  const smallSlugs = new Set(["under-60", "60-85"]);
  const premiumKind = hiBand
    ? smallSlugs.has(hiBand.bandSlug)
      ? "소형"
      : "대형"
    : null;

  const coverage = `${ymLabel(target.firstYm)}~${ymLabel(target.latestYm)} 실거래 ${target.txCount.toLocaleString(
    "ko-KR",
  )}건 · ${target.complexCount.toLocaleString("ko-KR")}개 단지`;

  /* 첫 화면에 세울 숫자 — 값이 없으면 그 칸을 만들지 않는다. */
  const perValues = cells.map((c) => Math.round((c.avgPerPyeongKrw ?? 0) / 10_000));
  const heroKpis: HeroKpi[] = [
    {
      label: "수집 실거래",
      value: `${target.txCount.toLocaleString("ko-KR")}건`,
      note: `${target.complexCount.toLocaleString("ko-KR")}개 단지 · ${ymLabel(target.firstYm)}~${ymLabel(target.latestYm)}`,
    },
  ];
  if (busiest) {
    heroKpis.push({
      label: "거래가 가장 많은 면적대",
      value: busiest.bandLabel,
      note: `${busiest.txCount.toLocaleString("ko-KR")}건 · 중앙값 ${eok(busiest.medianKrw)}`,
    });
  }
  if (hiBand) {
    heroKpis.push({
      label: "평단가 최고 면적대",
      value: manPerPyeong(hiBand.avgPerPyeongKrw),
      note: `${hiBand.bandLabel}${premiumKind ? ` · ${premiumKind} 프리미엄` : ""}`,
    });
  }
  if (premiumRatio && loBand && hiBand && loBand.bandSlug !== hiBand.bandSlug) {
    heroKpis.push({
      label: "면적 프리미엄",
      value: `${premiumRatio.toFixed(2)}배`,
      note: `${hiBand.bandLabel} ÷ ${loBand.bandLabel} 평단가`,
    });
  }

  const selectRegions = areaRegions.map((r) => ({
    slug: r.slug,
    name: r.name,
    txCount: r.txCount,
  }));

  return (
    <PageShell breadcrumb="AI 분석 · 면적대별 실거래 시세">
      <div className="mx-auto w-full max-w-[900px]">
        {/* [D62] 넘겨받은 지역을 못 찾았으면 **그 사실을 말한다.**
            예전에는 조용히 첫 지역으로 갈아탔다 — 화면에는 다른 동네의 숫자가
            아무 표시 없이 떠 있었고, 사용자는 그게 자기가 고른 지역인 줄 알았다. */}
        {regionMissed && (
          <div className="mb-3 rounded-[12px] border border-line bg-warning-soft px-3.5 py-2.5 t-sub text-ink">
            “{wanted}”는 실거래 집계에 아직 없는 지역이에요 — 대신{" "}
            <b>{target.name}</b>를 보여 드립니다. 아래에서 지역을 바꿀 수 있어요.
          </div>
        )}
        <ToolHero
          eyebrow="지역·시장 흐름"
          icon="bar"
          title="면적대별 실거래 시세"
          toneClass="text-success"
          lead={`${target.name}의 면적대별 평단가·중앙값·거래량을 국토교통부 신고 매매가로 정리했습니다.`}
          kpis={heroKpis}
          chart={
            perValues.some((v) => v > 0) ? (
              <div className="rounded-[12px] border border-line bg-surface px-2 pb-1 pt-2 text-success">
                <span className="t-caption block px-1 pb-1 text-text-3">
                  면적대별 평단가 (만원/평)
                </span>
                <Bars
                  values={perValues}
                  labels={cells.map((c) => c.bandLabel)}
                  height={78}
                  valueSuffix="만"
                  ariaLabel="면적대별 평단가 막대"
                />
              </div>
            ) : null
          }
          actions={<RegionSelect regions={selectRegions} current={target.slug} />}
          source={`${target.name} · ${coverage} · 국토교통부 신고 매매가 기준`}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* 좌: 면적대 표 + 평단가 곡선 */}
          <div className="flex flex-col gap-4">
            <div className="card overflow-hidden rounded-[14px]" data-reveal="">
              <div className="t-section border-b border-line px-5 py-3.5 text-ink">
                면적대별 평단가 · 중앙값 · 거래량
              </div>
              <div className="overflow-x-auto">
                <table className="t-body w-full min-w-[520px]">
                  <thead>
                    <tr className="t-sub border-b border-line text-left text-text-3">
                      <th className="px-5 py-2 font-semibold">면적대</th>
                      <th className="px-2 py-2 text-right font-semibold">거래</th>
                      <th className="px-2 py-2 text-right font-semibold">중앙값</th>
                      <th className="px-2 py-2 text-right font-semibold">평단가</th>
                      <th className="px-5 py-2 text-right font-semibold">지역 분위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cells.map((c) => {
                      const top = c.avgPerPyeongKrw
                        ? topPercentOf(c.bandSlug, c.avgPerPyeongKrw)
                        : null;
                      const isHi = hiBand?.bandSlug === c.bandSlug;
                      return (
                        <tr
                          key={c.bandSlug}
                          className="row-hl border-b border-divider last:border-0"
                        >
                          <td className="px-5 py-2.5">
                            <span className="font-bold text-ink">{c.bandLabel}</span>
                            {isHi && premiumKind && (
                              <span className="t-caption ml-1.5 rounded bg-primary-soft px-1.5 py-px font-extrabold text-primary">
                                평단가 최고
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-text-2">
                            {c.txCount.toLocaleString("ko-KR")}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums font-semibold text-ink">
                            {eok(c.medianKrw)}
                          </td>
                          <td
                            className="cell-bar px-2 py-2.5 text-right font-extrabold tabular-nums text-success"
                            style={{
                              ["--w" as string]: `${Math.round(((c.avgPerPyeongKrw ?? 0) / maxPer) * 100)}%`,
                            }}
                          >
                            {manPerPyeong(c.avgPerPyeongKrw)}
                          </td>
                          <td className="t-sub px-5 py-2.5 text-right text-text-2">
                            {top !== null ? `상위 ${top}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="t-caption px-5 py-2.5 text-text-3">
                평단가 = 전용면적 평(3.3㎡)당 평균 매매가. 지역 분위는 내집나우에 수록된
                지역들 중 같은 면적대 평단가 순위예요(표본 8곳 이상일 때만 표시).
              </div>
            </div>

            {/* 평단가 곡선 — 예전엔 div 높이 %에 색을 #1d4fd8/#a9bde8 로 박아
                그렸다(다크에서 토큰을 안 타고, 값 라벨이 막대마다 겹쳤다). */}
            <div className="chart-card text-success" data-reveal="">
              <div className="chart-head">
                <span className="t-section text-ink">면적대별 평단가 곡선</span>
                <span className="t-caption ml-auto text-text-3">만원/평 · 가장 진한 막대가 최고</span>
              </div>
              <Bars
                values={perValues}
                labels={cells.map((c) => c.bandLabel)}
                height={150}
                valueSuffix="만"
                ariaLabel="면적대별 평단가"
              />
            </div>

            {/* 대표 단지 — 예전엔 이름·건수·가격 3열 텍스트 목록이라
                "어디가 얼마나 많이 거래됐나"가 숫자를 다 읽어야 보였다. */}
            {busiest && topComplexes.length > 0 && (
              <div className="chart-card text-primary" data-reveal="">
                <div className="chart-head">
                  <span className="t-section text-ink">
                    {busiest.bandLabel} 실거래 상위 단지
                  </span>
                  <span className="t-caption ml-auto text-text-3">거래 많은 순</span>
                </div>
                <RankBars
                  rows={topComplexes.map((c, i) => ({
                    key: `${c.name}-${i}`,
                    label: c.name,
                    value: c.txCount,
                    href: complexHrefFromNames(target.name, c.name),
                  }))}
                  suffix="건"
                />
                <div className="flex flex-col gap-1">
                  {topComplexes.slice(0, 3).map((c, i) => (
                    <div key={`avg-${i}`} className="flex justify-between gap-2">
                      <span className="t-sub truncate text-text-3">{c.name} 평균</span>
                      <span className="t-sub t-num text-ink">{eok(c.avgKrw)}</span>
                    </div>
                  ))}
                </div>
                <Link
                  href={`/tx/${encodeURIComponent(target.slug)}`}
                  className="btn-soft btn-md mt-auto no-underline"
                >
                  {target.name} 전체 실거래·단지 보기
                </Link>
              </div>
            )}
          </div>

          {/* 우: 인사이트 */}
          <div className="flex flex-col gap-3.5">
            {hiBand && premiumKind && premiumRatio && (
              <div className="card tile flex flex-col gap-2 rounded-[14px] p-4" data-reveal="">
                <div className="t-section text-ink">면적 프리미엄</div>
                <div className="t-body text-text-2">
                  {target.name}에서 평단가가 가장 높은 면적대는{" "}
                  <b className="text-primary">{hiBand.bandLabel}</b>
                  {premiumKind === "소형" ? " (소형 프리미엄)" : " (대형 프리미엄)"}이에요.
                  {loBand && loBand.bandSlug !== hiBand.bandSlug && (
                    <>
                      {" "}
                      가장 낮은 <b>{loBand.bandLabel}</b> 대비{" "}
                      <b className="text-ink">{premiumRatio.toFixed(2)}배</b> 수준입니다.
                    </>
                  )}
                </div>
                <div className="t-sub text-text-3">
                  {premiumKind === "소형"
                    ? "소형 평단가가 높으면 실수요·임대수요가 두텁거나 재건축 기대가 반영된 경우가 많아요."
                    : "대형 평단가가 높으면 학군·조망 등 프리미엄이 큰 평형에 몰린 지역일 수 있어요."}
                </div>
              </div>
            )}

            <div className="card tile flex flex-col gap-2 rounded-[14px] p-4" data-reveal="">
              <div className="t-section text-ink">거래가 가장 많은 면적대</div>
              {busiest ? (
                <>
                  <div className="t-num text-[19px] text-ink">{busiest.bandLabel}</div>
                  <div className="t-sub text-text-3">
                    최근 실거래 {busiest.txCount.toLocaleString("ko-KR")}건 · 중앙값{" "}
                    {eok(busiest.medianKrw)} · 평단가 {manPerPyeong(busiest.avgPerPyeongKrw)}
                  </div>
                  <div className="t-sub text-text-3">
                    거래가 몰린 면적대는 환금성이 좋아 실거래가도 촘촘하게 형성돼요.
                  </div>
                </>
              ) : (
                <div className="t-sub text-text-3">데이터가 부족해요.</div>
              )}
            </div>

            <div className="card tile flex flex-col gap-2 rounded-[14px] p-4" data-reveal="">
              <div className="t-section text-ink">이 데이터로 할 수 있는 것</div>
              <div className="t-sub text-text-3">
                관심 평형의 평단가·중앙값을 지역 분위와 함께 확인하고, 임장 전 목표
                면적대의 시세대를 잡아보세요. 개별 단지 시세·추이는 단지 상세에서 더
                자세히 볼 수 있어요.
              </div>
              <Link
                href={`/tx/${encodeURIComponent(target.slug)}`}
                className="tile-go t-sub font-bold text-primary no-underline"
              >
                {target.name} 실거래 상세 ›
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4">
          {/* #411 — 도구 간 이어가기: 보던 지역 그대로 타이밍·시나리오·지도로 */}
          <AnalysisCrossLinks
            current="price"
            regionLabel={target.name}
            regionFor={{
              map: target.name,
              ...(findTemperatureRegionIdByName(target.name)
                ? {
                    timing: findTemperatureRegionIdByName(target.name)!,
                    scenario: findTemperatureRegionIdByName(target.name)!,
                  }
                : {}),
            }}
            note={{
              label: "이 지역 노트 쓰기",
              href: `/notes/new?region=${encodeURIComponent(target.name)}`,
            }}
          />
        </div>
      </div>
    </PageShell>
  );
}
