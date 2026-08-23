import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { QaBlock } from "../../components/QaBlock";
import {
  getRegionSnapshot,
  getRegionSeries,
  getRegionMonthlyVolume,
  listRegionTransactions,
  type RegionTransactionRow,
  type RegionMonthlyVolumeRow,
} from "@/lib/market/store";
import type { RegionMarketSnapshot } from "@/lib/market/types";
import { listPublicNoteCards } from "@/lib/inspection/store-db";
import { settle, startDeadline } from "@/lib/data/section-budget";
import { getSupplyForArea, type SupplyItem } from "@/lib/market/supply";
import type { PublicNoteCard } from "@/lib/inspection/store-db";
import {
  findComplexTxRegionById,
  listDistrictComplexSummaries,
  type ComplexSummary,
  type ComplexTxRegion,
} from "@/lib/market/complex-transactions";
import { ExpandableComplexRows } from "./ExpandableComplexRows";
import { ComplexSummaryTable } from "../../components/ComplexSummaryTable";
import { findTxRegionForMarketRegion, type TxRegionSummary } from "@/lib/market/tx-bands";
import { BAND_KIND_LABEL } from "@/lib/market/bands";
import { listDbProjects } from "@/lib/redevelopment/store";
import {
  labelForType,
  stageLabel,
  stageOrder,
  type RedevelopmentProject,
} from "@/lib/redevelopment/types";
import { findTemperatureRegion } from "@/lib/market/temperature";
import { logger } from "@/lib/log";
import { buildMarketRead } from "@/lib/region/market-read";
import { getRegionRentSnapshot, type RegionRentSnapshot } from "@/lib/market/rent";
import { getRegionTradeAreaBands, type RegionAreaBands } from "@/lib/market/area-bands-lite";
import { KeywordAlertButton } from "@/app/components/KeywordAlertButton";
import {
  breadcrumbJsonLd,
  regionPlaceJsonLd,
  jsonLdScript,
  type FaqItem,
} from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   N9 — 지역 종합 가이드 (/region/[id])
   "○○구에 산다는 것" 을 실데이터로만 조립한다.
   시세 스냅샷(market_region_price) · 가격지수 추이 · 최근 실거래 ·
   월별 거래량(market_region_monthly) · 단지별 현황 · 입주 예정 물량 ·
   정비사업(DB 확정분만) · 공개 임장노트 · 면적대/가격대 구간.

   ── 두 가지 규칙 ────────────────────────────────────────────
   1) **조회 실패는 "데이터 없음"이 아니다.** 예전에는 스냅샷 조회를
      .catch(() => null) 로 삼키고 그대로 notFound() 를 불렀다. DB 가 잠깐
      느려진 것뿐인데 이 페이지가 404 를 냈고, 크롤러에게는 "이 지역 페이지는
      없어졌다"는 확정 신고가 됐다. 이제 스냅샷 조회 실패는 던진다(→ 5xx =
      "지금은 못 준다, 나중에 다시 와라"). notFound() 는 지역이 **정말로**
      목록에 없을 때만 부른다.
   2) 곁다리 섹션은 실패해도 페이지 전체를 죽이지 않지만, 실패를 "없음"이나
      "준비 중"으로 표기하지 않는다. 세 가지 상태(정상 / 정말 없음 / 조회 실패)를
      각각 다른 문장으로 적는다.

   캐시: 2026-08-01 부터 ISR 이다. 예전엔 `?complexes=30` 을 읽어서 —
   searchParams 를 읽는 순간 Next 는 요청마다 서버 렌더로 돌리고 `private,
   no-cache, no-store` 를 실어 보낸다 — CDN 이 이 페이지를 한 벌도 재사용하지
   못했다(2026-07-28 함수 호출 소진 사고의 남은 자리였다). 12↔30 확장을
   ExpandableComplexRows(클라이언트 토글)로 옮기고 generateStaticParams(빈
   배열)를 export 해 형제 라우트(/complex/[id] · /tx/[region])와 같은 ISR 로
   복귀시켰다. scripts/check-cache-policy.mjs 의 ISR_EXEMPT 면제도 해제됐다.
   ============================================================ */

export const revalidate = 3600;

/* 빈 generateStaticParams — 빌드 때는 아무 지역도 미리 만들지 않고, 첫 요청이
   ISR 로 채운다. ?complexes=30(searchParams)을 클라이언트 토글로 옮겼으므로
   이제 CDN 이 한 시간 창 안에서 응답을 재사용한다 (/complex/[id] 와 같은 판단). */
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return [];
}

/* ---------- 세 갈래 상태 (정상 / 정말 없음 / 조회 실패) ---------- */

/* 세 갈래 상태와 공유 예산은 lib/data/section-budget.ts 로 옮겼다.
   /complex/[id] 등 다른 화면도 같은 규칙을 써야 하기 때문이다.
   핵심 스냅샷은 이 예산에 포함되지 않는다 — 그건 페이지의 존재 이유라서,
   실패하면 여전히 던져서 5xx 가 되어야 한다. */

/**
 * 곁다리 섹션 하나가 빠졌을 때의 안내.
 *
 * "새로고침해 주세요" 라고 쓰지 않는다 — 이 페이지는 revalidate=3600 이라
 * 이 화면이 그려진 순간 최대 1시간 동안 그대로 저장된다. 새로고침해도 같은
 * 화면이 나오는데 "새로고침하면 된다"고 적으면, 그것도 사실이 아닌 안내다.
 */
function LoadFailed({ what }: { what: string }) {
  return (
    <p className="py-6 text-center text-[13px] leading-[1.7] text-text-3">
      {what}을 지금 불러오지 못했습니다. 데이터가 없다는 뜻이 아니라 조회에 실패했다는
      뜻입니다 — 이 화면은 최대 1시간 저장되므로, 잠시 뒤에 다시 방문해 주세요.
    </p>
  );
}

/**
 * 곁다리 7개 중 몇 개가 실패하면 "페이지가 아니라 DB 가 문제"로 볼 것인가.
 *
 * 곁다리들은 공유 마감시계(8초) 하나를 함께 본다. 그래서 DB 가 밀리는 순간에는
 * 하나가 아니라 남아 있던 것 전부가 동시에 실패한다. 그렇게 만들어진 화면은
 * 머리말만 있고 본문이 거의 없는 껍데기인데, revalidate=3600 이라 그 껍데기가
 * **1시간 동안 고정**된다. 방문자에게도 크롤러에게도 그건 "이 지역은 내용이
 * 없는 페이지"라는 잘못된 사실이 된다(승인 문서가 금지한 얇은 페이지 그대로다).
 *
 * 그래서 이 선을 넘으면 그리지 않고 던진다. 5xx 는 캐시되지 않으므로 DB 가
 * 회복된 다음 방문자는 제대로 된 페이지를 받는다 — "지금은 못 준다"가
 * "여긴 원래 비어 있다"보다 정확하다.
 *
 * 5/7 로 잡은 이유: 한두 섹션이 늦는 것은 평상시에도 있는 일이고, 그때는
 * 나머지 본문이 충분히 남아 있어 페이지로서 값어치가 있다.
 */
const SIDE_FAILURE_ABORT_THRESHOLD = 5;

/* ---------- 포맷 헬퍼 ---------- */

/** 원(KRW) → "12.4억" / "9,800만" */
function formatKrwShort(krw: number | undefined): string {
  if (krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

/** "202606" → "2026.06" */
function formatYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

/** "2025-08-01" → "25.08" */
function shortPeriod(period: string): string {
  return period.length >= 7 ? `${period.slice(2, 4)}.${period.slice(5, 7)}` : period;
}

/** "202606" → "26.06" */
function shortYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(2, 4)}.${ym.slice(4)}` : ym;
}

function sourceLabel(source: RegionMarketSnapshot["source"]): string {
  if (source === "reb") return "한국부동산원(R-ONE)";
  if (source === "kb") return "KB부동산";
  return "자체 수집";
}

function deltaView(changePct: number | undefined): {
  label: string;
  className: string;
} {
  if (changePct === undefined || !Number.isFinite(changePct)) {
    return { label: "—", className: "delta-flat" };
  }
  const abs = Math.abs(changePct).toFixed(2);
  // 시세 관례: 상승 red(delta-up) / 하락 blue(delta-down)
  if (changePct > 0) return { label: `▲ ${abs}%`, className: "delta-up" };
  if (changePct < 0) return { label: `▼ ${abs}%`, className: "delta-down" };
  return { label: "0.00%", className: "delta-flat" };
}

/** 공개 임장노트 지역 텍스트 매칭 — "고양시 덕양구" ↔ "고양 덕양구 행신동" 등 */
function noteMatchesRegion(noteRegion: string, regionName: string): boolean {
  const target = noteRegion.replace(/\s+/g, "");
  if (!target) return false;
  const full = regionName.replace(/\s+/g, "");
  if (target.includes(full) || full.includes(target)) return true;
  const lastToken = regionName.trim().split(/\s+/).pop() ?? "";
  return lastToken.length >= 2 && target.includes(lastToken);
}

/* ---------- 메타데이터 ---------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  /* 여기서도 실패를 삼키지 않는다. 삼키면 "존재하지 않는 지역"과 똑같이
     noindex 메타를 내보내게 되고, 장애 중에 크롤링된 페이지가 색인에서
     빠진다. 던지면 5xx 가 되고 크롤러는 다시 온다. */
  const snapshot = await getRegionSnapshot(id);
  if (!snapshot) {
    return { title: "지역 시세 | 누구집", robots: { index: false, follow: false } };
  }
  const name = snapshot.regionName;
  const price =
    snapshot.avgSale !== undefined ? `평균 매매가 ${formatKrwShort(snapshot.avgSale)}` : "시세 준비 중";
  const title = `${name} 아파트 시세·실거래·정비사업 | 누구집`;
  const description = `${name} 아파트 ${price} (${formatYm(snapshot.period)} 기준) — 시세 추이, 최근 실거래, 월별 거래량, 입주 예정 물량, 정비사업, 이웃 임장노트를 한 화면에서 확인하세요.`;
  const alternates = seoAlternates(`/region/${id}`);
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical as string,
      siteName: "누구집",
      locale: "ko_KR",
      type: "website",
      /* [개선 #4] 지역 카드 — 지역명·평균가가 박힌 동적 공유 카드(/api/og).
         카톡 미리보기가 밋밋한 기본 카드로 나가던 것을 교체. */
      images: [
        {
          url: `/api/og?${new URLSearchParams({
            title: `${name} 아파트 시세`,
            sub: `${price} · ${formatYm(snapshot.period)} 기준`,
            badge: "지역 시세",
          }).toString()}`,
          width: 1200,
          height: 630,
          alt: `${name} 시세 카드`,
        },
      ],
    },
  };
}

/* ---------- 페이지 ---------- */

export default async function RegionHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  /* 이 페이지의 뼈대. 실패하면 던진다 → 5xx.
     null 은 이제 "이 지역은 목록에 없다"만 뜻한다 → 404 가 맞다. */
  const snapshot: RegionMarketSnapshot | null = await getRegionSnapshot(id);
  if (!snapshot) notFound();

  const name = snapshot.regionName;
  /* 단지별 현황 — 30개를 한 번에 받아 클라이언트 토글로 12↔30 을 오간다.
     예전의 ?complexes=30 방식은 searchParams 를 읽는 순간 페이지 전체가
     요청마다 서버 렌더가 되어 ISR 을 무력화했다(ExpandableComplexRows 주석). */
  const complexLimit = 30;
  const txRegion: ComplexTxRegion =
    findComplexTxRegionById(id) ?? { id, name, city: id.startsWith("incheon-") ? "인천" : "서울" };
  // 이 지역 자치구명 (예: "고양시 덕양구" → "덕양구") — 공급·정비사업 매칭 키
  const shortName = name.trim().split(/\s+/).pop() ?? name;

  /* 곁다리 7개는 공유 마감시계 하나를 함께 본다. 하나가 늦어도 나머지가
     끝났으면 페이지는 8초 안에 그려진다.

     여덟 번째로 실거래 구간 매칭(txBandRegion)도 여기 같이 태운다. 예전에는
     이 Promise.all 이 끝난 **뒤에** 따로 await 했다 — 곁다리 7개가 모두 끝날
     때까지 기다렸다가 그제서야 아홉 번째 왕복을 시작했다는 뜻이고, 그 한 번이
     통째로 직렬 지연이었다. 같이 출발시키면 총 대기는 가장 느린 하나로 줄어든다.
     다만 이 값은 sideResults 에 넣지 않는다 — 아래 중단 판단은 "화면이 비었나"를
     세는 것이고, 이건 실패해도 내부 링크 하나가 빠질 뿐이라 성격이 다르다. */
  const budget = startDeadline();
  const [seriesR, transactionsR, complexR, notesR, volumeR, projectsR, supplyR, txBandRegion, rentSnap, areaBands] =
    await Promise.all([
      /* 항목 25: budget.signal 로 예산 초과 시 PostgREST 요청 자체를 끊는다. */
      settle(
        `${id} 매매가격지수`,
        getRegionSeries(id, "sale_index", "monthly", 12, budget.signal),
        budget.expired,
      ),
      settle(`${id} 최근 실거래`, listRegionTransactions(id, name, 5, budget.signal), budget.expired),
      settle(
        `${id} 단지별 현황`,
        listDistrictComplexSummaries(txRegion, complexLimit, budget.signal),
        budget.expired,
      ),
      /* 카드 6칸만 그리는데 select("*") 로 100행을 통째로 받던 자리다. 그 행에는
         checklist·sections·photos·ai_analysis·metadata 다섯 jsonb 가 들어 있고
         전부 버려졌다. 카드 전용 컬럼만 읽는다(listPublicNoteCards 주석 참고). */
      settle("공개 임장노트", listPublicNoteCards(100, budget.signal), budget.expired),
      settle(`${id} 월별 거래량`, getRegionMonthlyVolume(id, name, 12, budget.signal), budget.expired),
      /* 정비사업은 DB 확정분만 쓴다(시드 폴백 없음). 이 화면은 "○○구에 산다는 것"을
         사실로만 조립하는 곳이고, 시드는 수기 정리본이라 여기 섞으면 안 된다. */
      settle(
        `${shortName} 정비사업`,
        listDbProjects({ sigungu: shortName, limit: 200, signal: budget.signal }),
        budget.expired,
      ),
      /* 웹16 — 목록은 6건만 보여주지만 연도별 미니 차트는 더 넓게 집계해야
         왜곡이 없다. 같은 단일 쿼리의 limit 만 24 로 올린다(추가 요청 없음). */
      settle(`${shortName} 입주 예정 물량`, getSupplyForArea(shortName, 24, budget.signal), budget.expired),
      /* A5 — 이 지역의 면적대·가격대 실거래 랜딩. 실제 존재하는 지역만 잡히고,
         없으면 null 이라 링크 섹션 자체가 렌더되지 않는다(죽은 링크를 만들지 않는다).
         여기서는 실패를 삼켜도 된다 — 이 페이지의 본문은 지역 시세 스냅샷이고 이건
         곁다리 내부 링크라, 못 읽었으면 링크 하나가 빠질 뿐 틀린 내용이 나가지 않는다.
         다만 **조용히** 삼키지는 않는다. 2026-07-25 사고의 교훈이 정확히 그것이다. */
      findTxRegionForMarketRegion(id, name).catch((e: unknown): TxRegionSummary | null => {
        logger.error(
          `[/region/${id}] 실거래 구간 지역 매칭 실패 — 링크 섹션을 생략합니다:`,
          e instanceof Error ? e.message : String(e),
        );
        return null;
      }),
      /* [#94] 전월세 스냅샷 — txBandRegion 과 같은 성격의 보너스 섹션: 실패하면
         섹션이 빠질 뿐이라 sideResults(중단 판정)에는 넣지 않는다. */
      getRegionRentSnapshot(id, name, budget.signal).catch((e: unknown): RegionRentSnapshot | null => {
        logger.error(`[/region/${id}] 전월세 스냅샷 조회 실패 — 섹션 생략:`, e instanceof Error ? e.message : String(e));
        return null;
      }),
      /* [#52] 평형대별 시세 — 같은 규칙 */
      getRegionTradeAreaBands(id, name, budget.signal).catch((e: unknown): RegionAreaBands | null => {
        logger.error(`[/region/${id}] 평형대별 시세 조회 실패 — 섹션 생략:`, e instanceof Error ? e.message : String(e));
        return null;
      }),
    ]);
  budget.done();

  /* 껍데기를 1시간 얼리지 않는다 (위 SIDE_FAILURE_ABORT_THRESHOLD 설명 참고).
     실패 개수만 세서 판단한다 — 어떤 섹션이 실패했는지는 settle() 이 이미
     각각 로그로 남겼다. */
  const sideResults = [seriesR, transactionsR, complexR, notesR, volumeR, projectsR, supplyR];
  const sideFailures = sideResults.filter((r) => !r.ok).length;
  if (sideFailures >= SIDE_FAILURE_ABORT_THRESHOLD) {
    throw new Error(
      `[/region/${id}] 곁다리 섹션 ${sideResults.length}개 중 ${sideFailures}개 조회 실패 — ` +
        "빈 껍데기를 캐시에 남기지 않기 위해 렌더를 중단합니다",
    );
  }

  const series: Array<{ period: string; value: number }> = seriesR.ok ? seriesR.data : [];
  const transactions: RegionTransactionRow[] = transactionsR.ok ? transactionsR.data : [];
  const complexSummaries: ComplexSummary[] = complexR.ok ? complexR.data : [];
  const volume: RegionMonthlyVolumeRow[] = volumeR.ok ? volumeR.data : [];
  const supply: SupplyItem[] = supplyR.ok ? supplyR.data : [];
  /* 쿼리가 이미 is_public 으로 걸러 오므로 여기서 다시 보지 않는다
     (예전 select("*") 시절에는 매핑된 isPublic 을 한 번 더 확인했었다). */
  const allNotes: PublicNoteCard[] = notesR.ok ? notesR.data : [];
  const notes = allNotes.filter((n) => noteMatchesRegion(n.region, name)).slice(0, 4);

  /* 정비사업 — 진행단계가 앞선 순, 같으면 세대수 큰 순. 최대 8곳만. */
  const projects: RedevelopmentProject[] = (projectsR.ok ? projectsR.data : [])
    .filter((p) => !p.isSample)
    .sort((a, b) => {
      const s = stageOrder(b.stageKey) - stageOrder(a.stageKey);
      if (s !== 0) return s;
      return (b.households ?? 0) - (a.households ?? 0);
    });
  const projectsShown = projects.slice(0, 8);

  // N11 — 이 지역의 시장 온도 기록이 있으면 교차 링크
  const tempRegion = findTemperatureRegion(id);

  const delta = deltaView(snapshot.saleChangeMonthly);
  const jeonseRatio =
    snapshot.jeonseRatio !== undefined && Number.isFinite(snapshot.jeonseRatio)
      ? `${snapshot.jeonseRatio.toFixed(1)}%`
      : "—";

  // 스파크라인(막대) 정규화 — 차트 라이브러리 없이 CSS 바
  const values = series.map((s) => s.value);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const range = max - min;
  const barHeight = (v: number): number =>
    range > 0 ? 24 + Math.round(((v - min) / range) * 76) : 60;

  // 거래량 막대 정규화 (0 을 바닥으로 — 건수는 절대량이 의미 있다)
  const volMax = volume.length > 0 ? Math.max(...volume.map((v) => v.count)) : 0;
  const volBarHeight = (n: number): number =>
    volMax > 0 ? Math.max(4, Math.round((n / volMax) * 84)) : 4;
  const latestVolume = volume.length > 0 ? volume[volume.length - 1] : null;
  const volumeTotal = volume.reduce((acc, v) => acc + v.count, 0);

  const kpiCards: Array<{ label: string; value: string; sub?: string; subClass?: string }> = [
    { label: "평균 매매가", value: formatKrwShort(snapshot.avgSale) },
    { label: "중위 매매가", value: formatKrwShort(snapshot.medianSale) },
    { label: "전월 대비", value: delta.label, subClass: delta.className },
    { label: "전세가율", value: jeonseRatio },
  ];

  /* ---------- G12 — 발췌해도 완결되는 첫 문단 ----------
     여기에 들어가는 문장은 전부 위에서 실제로 읽어 온 값에서 만든다.
     값이 없으면 그 문장을 아예 넣지 않는다(빈칸을 "—" 로 채우지 않는다). */
  const priceClauses: string[] = [];
  if (snapshot.avgSale !== undefined && snapshot.avgSale > 0) {
    priceClauses.push(`평균 매매가 ${formatKrwShort(snapshot.avgSale)}`);
  }
  if (snapshot.medianSale !== undefined && snapshot.medianSale > 0) {
    priceClauses.push(`중위 매매가 ${formatKrwShort(snapshot.medianSale)}`);
  }
  if (jeonseRatio !== "—") priceClauses.push(`전세가율 ${jeonseRatio}`);

  const leadSentences: string[] = [];
  leadSentences.push(
    priceClauses.length > 0
      ? `${name}의 ${formatYm(snapshot.period)} 아파트 시세는 ${priceClauses.join(
          " · ",
        )}입니다(출처 ${sourceLabel(snapshot.source)}).`
      : `${name}의 ${formatYm(snapshot.period)} 기준 아파트 시세 지표는 아직 수집된 항목이 없습니다.`,
  );
  if (snapshot.saleChangeMonthly !== undefined && Number.isFinite(snapshot.saleChangeMonthly)) {
    const chg = snapshot.saleChangeMonthly;
    leadSentences.push(
      chg === 0
        ? "전월 대비로는 보합입니다."
        : `전월 대비로는 ${Math.abs(chg).toFixed(2)}% ${chg > 0 ? "올랐습니다" : "내렸습니다"}.`,
    );
  }
  if (latestVolume !== null) {
    leadSentences.push(
      `국토교통부에 신고된 아파트 매매는 ${formatYm(latestVolume.month)}에 ${latestVolume.count.toLocaleString(
        "ko-KR",
      )}건이며, 최근 ${volume.length}개월 합계는 ${volumeTotal.toLocaleString("ko-KR")}건입니다.`,
    );
  }
  if (projectsShown.length > 0) {
    leadSentences.push(
      `공개 자료로 확인된 ${shortName} 정비사업 구역은 ${projects.length.toLocaleString(
        "ko-KR",
      )}곳입니다.`,
    );
  }
  if (supply.length > 0) {
    /* limit 24 조회라 24곳이면 "이상"일 수 있다 — 상한에 걸린 경우 표현을 바꾼다 */
    leadSentences.push(
      supply.length >= 24
        ? `입주 예정 물량으로 잡힌 단지는 24곳 이상입니다.`
        : `입주 예정 물량으로 잡힌 단지는 ${supply.length}곳입니다.`,
    );
  }
  if (notes.length > 0) {
    leadSentences.push(`이웃이 공개한 임장노트는 ${notes.length}편 있습니다.`);
  }
  leadSentences.push(
    "모두 공공 실거래·공표 통계에서 계산한 값이며, 중개 매물의 호가는 포함하지 않습니다.",
  );
  const lead = leadSentences.join(" ");

  /* [개선 #7] 시장 흐름 읽기 — 추가 조회 없이 위에서 읽은 값의 산술 서술 */
  const marketRead = buildMarketRead({
    name,
    series,
    volume: volume.map((v) => ({ month: v.month, count: v.count })),
    supply: supply.map((si) => ({ households: si.households })),
    supplyCapped: supply.length >= 24,
    jeonseRatio: snapshot.jeonseRatio,
    avgSaleLabel:
      snapshot.avgSale !== undefined && snapshot.avgSale > 0
        ? formatKrwShort(snapshot.avgSale)
        : null,
    periodLabel: formatYm(snapshot.period),
  });

  /* ---------- Q&A — 이 페이지에 실제로 보이는 숫자로만 ---------- */
  const faq: FaqItem[] = [];
  if (priceClauses.length > 0) {
    faq.push({
      q: `${name} 아파트 시세는 얼마인가요?`,
      a: `${formatYm(snapshot.period)} 기준 ${name} 아파트는 ${priceClauses.join(
        " · ",
      )}입니다. ${sourceLabel(snapshot.source)}가 공표한 지역 통계이며, 개별 단지·평형에 따라 실제 거래가는 크게 다릅니다.`,
    });
  }
  if (latestVolume !== null) {
    faq.push({
      q: `${name}는 요즘 거래가 잘 되나요?`,
      a: `국토교통부 실거래 신고 기준으로 ${formatYm(latestVolume.month)} ${name} 아파트 매매는 ${latestVolume.count.toLocaleString(
        "ko-KR",
      )}건, 최근 ${volume.length}개월 합계는 ${volumeTotal.toLocaleString(
        "ko-KR",
      )}건입니다. 다만 계약일로부터 30일의 신고 기한이 있어 가장 최근 1~2개월은 실제보다 적게 집계됩니다.`,
    });
  }
  if (transactions.length > 0) {
    const t = transactions[0];
    faq.push({
      q: `${name}에서 가장 최근에 신고된 아파트 거래는 무엇인가요?`,
      a: `${formatYm(t.contractYm)}${
        t.contractDay ? `.${String(t.contractDay).padStart(2, "0")}` : ""
      } ${t.complexName}${t.areaM2 !== null ? ` ${t.areaM2.toFixed(1)}㎡` : ""}${
        t.floor !== null ? ` ${t.floor}층` : ""
      }이 ${formatKrwShort(t.dealAmountKrw)}에 거래된 건이 이 페이지에 수집된 가장 최근 신고분입니다.`,
    });
  }
  if (projectsShown.length > 0) {
    const top = projectsShown[0];
    faq.push({
      q: `${shortName}에 진행 중인 정비사업이 있나요?`,
      a: `공개 자료로 확인된 ${shortName} 정비사업 구역은 ${projects.length.toLocaleString(
        "ko-KR",
      )}곳입니다. 진행 단계가 가장 앞선 곳은 ${top.name}(${labelForType(
        top.typeKey,
      )} · ${stageLabel(top.stageKey)})입니다. 단계는 공개 고시·언론 공개정보 기준 참고값이며, 확정 일정은 조합·지자체 공고를 확인해야 합니다.`,
    });
  }
  faq.push({
    q: "이 페이지의 숫자는 어디서 오나요?",
    a: `시세 지표는 ${sourceLabel(
      snapshot.source,
    )} 공표 통계, 실거래와 거래량은 국토교통부 실거래가 공개시스템, 입주 예정 물량과 정비사업은 공공기관 공개 자료입니다. 매물 호가나 중개사 제공 가격은 쓰지 않으며, 값이 없는 항목은 추정치로 채우지 않고 비워 둡니다.`,
  });

  // JSON-LD(BreadcrumbList + Place) — 실데이터 스냅샷, 존재 필드만
  // (FAQPage 는 QaBlock 이 화면에 보이는 items 로 직접 생성한다)
  const regionJsonLd = [
    /* "지역 시세"는 목적지가 없는 라벨이라 뺐다 — item(URL) 없는 중간 항목은
       구글이 심각 오류로 처리해 탐색경로 전체를 버린다(2026-07-27 Search Console).
       화면 상단 breadcrumb 텍스트에는 그대로 남는다(그건 시각 라벨이다). */
    breadcrumbJsonLd([
      { name: "홈", url: "/" },
      { name, url: `/region/${id}` },
    ]),
    /* G6: 예전엔 여기 Place 와 별개로 @id 없는 Place 를 하나 더 내보내
       같은 지역이 두 엔티티로 읽혔다. 상위 시/도(txRegion.city)를 넘겨
       addressRegion=시/도 + addressLocality=구 로 합쳤다. */
    regionPlaceJsonLd({
      id,
      name,
      description:
        snapshot.avgSale !== undefined
          ? `${name} 아파트 평균 매매가 ${formatKrwShort(snapshot.avgSale)} (${formatYm(
              snapshot.period,
            )} 기준)`
          : null,
      parentRegion: txRegion.city && txRegion.city !== name ? txRegion.city : null,
    }),
  ];

  return (
    <PageShell
      breadcrumb={`홈 › 지역 시세 › ${name}`}
      title={`${name}에 산다는 것`}
    >
      {/* JSON-LD(BreadcrumbList + Place) — 지역 SEO 구조화 데이터 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(regionJsonLd) }}
      />
      <p className="rise-in mb-1 text-[12px] text-text-3">
        {formatYm(snapshot.period)} 기준 · 출처 {sourceLabel(snapshot.source)}
      </p>
      {/* G12 — 이 문단만 떼어 인용해도 뜻이 통해야 한다 */}
      <p className="rise-in mb-5 text-[14px] leading-[1.75] text-text-1">{lead}</p>

      {/* [#64] 동네 홈 상호 링크 — 숫자(여기) ↔ 생활(동네 홈) */}
      <div className="rise-in mb-5 -mt-2">
        <Link
          href={`/town/${id}`}
          className="chip border border-line bg-surface px-3.5 py-2 text-[12.5px] font-bold text-primary"
        >
          {name} 동네 홈 — 이웃 글·뉴스·임장노트 ›
        </Link>
      </div>

      {/* 현재가 KPI 4카드 */}
      <section className="rise-in-1 mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-[11px] text-text-3">{k.label}</div>
            <div
              className={`mt-1 text-[20px] font-extrabold ${
                k.subClass ?? "text-ink"
              }`}
            >
              {k.value}
            </div>
          </div>
        ))}
      </section>

      {/* [개선 #7] 시장 흐름 읽기 — 위 표·차트의 숫자를 지역마다 다른 문장으로.
          전 문장이 이 페이지가 이미 읽은 실데이터의 산술 서술이다(전망·권유 없음,
          lib/region/market-read.ts). 값이 부족한 지역은 문단 수가 줄고, 아예
          없으면 섹션 자체가 안 그려진다 — 빈 틀을 만들지 않는다. */}
      {marketRead.paragraphs.length > 0 && (
        <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-extrabold text-ink">
              {name} 시장 흐름 읽기
            </h2>
            {/* [개선 #13] 지역 이름 키워드로 뉴스·동네글 알림 원탭 구독 */}
            <KeywordAlertButton scope="news" query={name} label={`${name} 새 소식`} />
          </div>
          <div className="mt-2 flex flex-col gap-2.5">
            {marketRead.paragraphs.map((p, i) => (
              <p key={i} className="text-[13.5px] leading-[1.8] text-text-1">
                {p}
              </p>
            ))}
          </div>
          {/* [#79] 월간 아카이브 진입 — "그때 얼마였지"를 월 고정 페이지로 */}
          <div className="mt-3">
            <Link
              href={`/region/${id}/report`}
              className="text-[12.5px] font-bold text-primary"
            >
              월간 리포트 아카이브 — 지난달까지의 월별 스냅샷 ›
            </Link>
          </div>
        </section>
      )}

      {/* 최근 시세 추이 — 매매가격지수 월간 12개월, CSS 바 스파크라인 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          최근 시세 추이{" "}
          <span className="text-[11px] font-medium text-text-3">
            매매가격지수 · 월간
          </span>
        </h2>
        {!seriesR.ok ? (
          <LoadFailed what="시세 추이" />
        ) : series.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">
            이 지역의 매매가격지수 시계열이 아직 수집되지 않았습니다.
          </p>
        ) : (
          <>
            <div className="mt-4 flex h-[110px] items-end gap-[6px]">
              {series.map((s, i) => (
                <div
                  key={s.period}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  title={`${s.period} · ${s.value.toFixed(1)}`}
                >
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${barHeight(s.value)}px`,
                      background:
                        i === series.length - 1
                          ? "var(--primary)"
                          : "var(--primary-soft)",
                      border:
                        i === series.length - 1
                          ? "none"
                          : "1px solid var(--border)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-text-3">
              <span>{shortPeriod(series[0].period)}</span>
              <span>{shortPeriod(series[series.length - 1].period)}</span>
            </div>
          </>
        )}
        {tempRegion && (
          <p className="mt-3 text-[12px] text-text-3">
            <Link
              href={`/analysis/temperature/${encodeURIComponent(id)}`}
              className="font-bold text-primary underline"
            >
              {name} 시장 온도 주간 기록 보기 →
            </Link>
          </p>
        )}
      </section>

      {/* [#94] 전월세 시장 — 46.9만 행의 첫 노출면. 산술 사실(중앙값·건수)만 서술,
          신고 지연·갱신/신규 미구분(원천 한계)은 화면에 명기한다. */}
      {rentSnap && (rentSnap.jeonse.count > 0 || rentSnap.wolse.count > 0) && (
        <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            전월세 시장{" "}
            <span className="text-[11px] font-medium text-text-3">
              {rentSnap.periodLabel} 신고분 {rentSnap.sampleCount.toLocaleString("ko-KR")}건
              {rentSnap.sampleTruncated ? " 표본" : ""} 기준
            </span>
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-bg px-3 py-2.5">
              <div className="text-[10.5px] text-text-3">전세 보증금 중앙값</div>
              <div className="mt-0.5 text-[16px] font-extrabold tabular-nums text-ink">
                {rentSnap.jeonse.medianDepositKrw59_85 !== null
                  ? formatKrwShort(rentSnap.jeonse.medianDepositKrw59_85)
                  : rentSnap.jeonse.medianDepositKrw !== null
                    ? formatKrwShort(rentSnap.jeonse.medianDepositKrw)
                    : "—"}
              </div>
              <div className="text-[10px] text-text-3">
                {rentSnap.jeonse.medianDepositKrw59_85 !== null ? "59~85㎡ 기준" : "전체 면적 기준"} ·{" "}
                {rentSnap.jeonse.count.toLocaleString("ko-KR")}건
              </div>
            </div>
            <div className="rounded-xl bg-bg px-3 py-2.5">
              <div className="text-[10.5px] text-text-3">월세 중앙값</div>
              <div className="mt-0.5 text-[16px] font-extrabold tabular-nums text-ink">
                {rentSnap.wolse.medianMonthlyKrw !== null
                  ? `월 ${Math.round(rentSnap.wolse.medianMonthlyKrw / 10_000).toLocaleString("ko-KR")}만`
                  : "—"}
              </div>
              <div className="text-[10px] text-text-3">
                보증금 중앙{" "}
                {rentSnap.wolse.medianDepositKrw !== null
                  ? formatKrwShort(rentSnap.wolse.medianDepositKrw)
                  : "—"}{" "}
                · {rentSnap.wolse.count.toLocaleString("ko-KR")}건
              </div>
            </div>
            <div className="rounded-xl bg-bg px-3 py-2.5">
              <div className="text-[10.5px] text-text-3">월세 비중</div>
              <div className="mt-0.5 text-[16px] font-extrabold tabular-nums text-ink">
                {rentSnap.wolseShare !== null ? `${Math.round(rentSnap.wolseShare * 100)}%` : "—"}
              </div>
              <div className="text-[10px] text-text-3">전월세 신고 중 월세 계약</div>
            </div>
          </div>
          {rentSnap.monthly.length >= 4 && (
            <>
              <div className="mt-4 flex h-[64px] items-end gap-[6px]">
                {rentSnap.monthly.map((m, i) => {
                  const max = Math.max(...rentSnap.monthly.map((x) => x.count));
                  const h = max > 0 ? Math.max(4, Math.round((m.count / max) * 60)) : 4;
                  return (
                    <div
                      key={m.month}
                      className="flex min-w-0 flex-1 flex-col items-center"
                      title={`${formatYm(m.month)} · ${m.count.toLocaleString("ko-KR")}건`}
                    >
                      <div
                        className="w-full rounded-t-[4px]"
                        style={{
                          height: `${h}px`,
                          background:
                            i >= rentSnap.monthly.length - 2 ? "var(--primary-soft)" : "var(--primary)",
                          border: i >= rentSnap.monthly.length - 2 ? "1px dashed var(--border)" : "none",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[9px] text-text-3">
                <span>{shortYm(rentSnap.monthly[0].month)}</span>
                <span>{shortYm(rentSnap.monthly[rentSnap.monthly.length - 1].month)}</span>
              </div>
            </>
          )}
          <p className="mt-3 text-[11px] leading-[1.7] text-text-3">
            국토교통부 전월세 신고 기준. 최근 두 달(점선)은 신고 지연으로 실제보다 적게
            잡힐 수 있고, 신고분에는 갱신·신규 계약이 섞여 있어 체감 시세와 다를 수
            있습니다. 중앙값은 지역 전체 기준이라 단지별 편차가 큽니다.
          </p>
        </section>
      )}

      {/* [#52] 평형대별 시세 — "○○구 30평대" 검색 수요를 지역 페이지 안에서 받는다 */}
      {areaBands && areaBands.bands.length > 0 && (
        <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            평형대별 매매 시세{" "}
            <span className="text-[11px] font-medium text-text-3">
              {areaBands.periodLabel} 신고 {areaBands.sampleCount.toLocaleString("ko-KR")}건
              {areaBands.truncated ? " 표본" : ""} 기준
            </span>
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-text-3">
                  <th className="py-1.5 pr-3 font-semibold">면적대</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">거래</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">중앙값</th>
                  <th className="py-1.5 text-right font-semibold">평당 중앙값</th>
                </tr>
              </thead>
              <tbody>
                {areaBands.bands.map((b) => (
                  <tr key={b.key} className="border-b border-[#f0f3f8] last:border-0">
                    <td className="py-2 pr-3 font-bold text-ink">{b.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-text-1">
                      {b.count.toLocaleString("ko-KR")}건
                    </td>
                    <td className="py-2 pr-3 text-right font-extrabold tabular-nums text-ink">
                      {formatKrwShort(b.medianKrw)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-1">
                      {formatKrwShort(b.medianPerPyeongKrw)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-[1.7] text-text-3">
            표본 5건 미만 면적대는 표시하지 않습니다. 중앙값 기준이라 단지·층·연식에 따라
            실제 가격은 다릅니다.
          </p>
        </section>
      )}

      {/* 월별 거래량 — market_region_monthly (국토부 실거래 집계) */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          월별 거래량{" "}
          <span className="text-[11px] font-medium text-text-3">
            아파트 매매 신고 건수
          </span>
        </h2>
        {!volumeR.ok ? (
          <LoadFailed what="월별 거래량" />
        ) : volume.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">
            이 지역의 월별 거래량 집계가 아직 없습니다.
          </p>
        ) : (
          <>
            <div className="mt-4 flex h-[96px] items-end gap-[6px]">
              {volume.map((v, i) => (
                <div
                  key={v.month}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  title={`${formatYm(v.month)} · ${v.count.toLocaleString("ko-KR")}건`}
                >
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${volBarHeight(v.count)}px`,
                      background:
                        i >= volume.length - 2 ? "var(--primary-soft)" : "var(--primary)",
                      border:
                        i >= volume.length - 2 ? "1px dashed var(--border)" : "none",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-text-3">
              <span>{shortYm(volume[0].month)}</span>
              <span>{shortYm(volume[volume.length - 1].month)}</span>
            </div>
            <p className="mt-3 text-[12px] leading-[1.7] text-text-2">
              최근 {volume.length}개월 합계 {volumeTotal.toLocaleString("ko-KR")}건
              {latestVolume
                ? ` · ${formatYm(latestVolume.month)} ${latestVolume.count.toLocaleString("ko-KR")}건`
                : ""}
            </p>
            {/* 신고 지연은 반드시 화면에 적는다 — 적지 않으면 마지막 두 칸을
                "거래 급감" 으로 오해하게 된다. 그래서 그 두 칸은 점선으로 그린다. */}
            <p className="mt-1 text-[11px] leading-[1.7] text-text-3">
              실거래 신고 기한은 계약일로부터 30일입니다. 점선으로 표시한 최근 두 달은
              아직 신고가 들어오는 중이라 실제보다 적게 잡혀 있습니다.
            </p>
          </>
        )}
      </section>

      {/* 최근 실거래 5건 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          최근 실거래{" "}
          <span className="text-[11px] font-medium text-text-3">
            아파트 매매 · 국토부 실거래가
          </span>
        </h2>
        {!transactionsR.ok ? (
          <LoadFailed what="최근 실거래" />
        ) : transactions.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">
            이 지역에서 수집된 아파트 매매 실거래가 아직 없습니다.
          </p>
        ) : (
          <ul className="mt-2">
            {transactions.map((t, i) => (
              <li
                key={`${t.complexName}-${t.contractYm}-${i}`}
                className={`flex items-center justify-between gap-3 py-3 ${
                  i < transactions.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-ink">
                    {t.complexName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-3">
                    {formatYm(t.contractYm)}
                    {t.contractDay ? `.${String(t.contractDay).padStart(2, "0")}` : ""}
                    {t.areaM2 !== null ? ` · ${t.areaM2.toFixed(1)}㎡` : ""}
                    {t.floor !== null ? ` · ${t.floor}층` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-[15px] font-extrabold text-ink">
                  {formatKrwShort(t.dealAmountKrw)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 단지별 현황 — market_transactions 그룹 요약 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-extrabold text-ink">
            단지별 현황{" "}
            <span className="text-[11px] font-medium text-text-3">
              국토부 실거래가 기반 · 매물 호가 아님
            </span>
          </h2>
        </div>
        <ExpandableComplexRows
          canExpand={complexSummaries.length > 12}
          collapsed={
            <ComplexSummaryTable
              summaries={complexSummaries.slice(0, 12)}
              regionId={id}
              failed={!complexR.ok}
            />
          }
          expanded={
            <ComplexSummaryTable
              summaries={complexSummaries}
              regionId={id}
              failed={!complexR.ok}
            />
          }
        />
        {complexSummaries.length > 0 && (
          <div className="mt-3 text-right">
            <Link
              href={`/complex/browse?district=${encodeURIComponent(
                txRegion.city === "서울" ? `서울 ${txRegion.name}` : txRegion.name,
              )}`}
              className="text-[12px] font-bold text-primary"
            >
              서울 전체 단지 브라우즈 →
            </Link>
          </div>
        )}
      </section>

      {/* 이 지역 입주 예정 물량 — 조회 실패는 섹션 자체를 렌더하지 않는다
          (없다고 말하지 않기 위해서다) */}
      {supply.length > 0 && (
        <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            {name} 입주 예정 물량{" "}
            <span className="text-[11px] font-medium text-text-3">
              공급 · 2026~2027
            </span>
          </h2>
          {/* 웹16 — 연도별 세대 합 미니 막대. 세대수가 실려 있는 조회분만
              집계하고(미상 제외 건수 병기), 연도가 2개 이상일 때만 그린다
              (막대 1개는 비교가 아니라 장식이다). */}
          {(() => {
            const byYear = new Map<string, number>();
            let unknown = 0;
            for (const s of supply) {
              const y = s.moveInYm.slice(0, 4);
              if (!/^\d{4}$/.test(y)) continue;
              if (s.households == null || s.households <= 0) {
                unknown += 1;
                continue;
              }
              byYear.set(y, (byYear.get(y) ?? 0) + s.households);
            }
            const years = [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            if (years.length < 2) return null;
            const max = Math.max(...years.map(([, v]) => v));
            return (
              <div className="mt-3 flex flex-col gap-1.5">
                {years.map(([y, v]) => (
                  <div key={y} className="flex items-center gap-2.5 text-[12px]">
                    <span className="w-[38px] shrink-0 font-bold tabular-nums text-text-2">
                      {y}
                    </span>
                    <span className="h-[8px] flex-1 overflow-hidden rounded-full bg-[#eef2f8]">
                      <span
                        className="block h-full rounded-full bg-primary/55"
                        style={{ width: `${Math.max(2, Math.round((v / max) * 100))}%` }}
                      />
                    </span>
                    <span className="w-[76px] shrink-0 text-right tabular-nums text-text-2">
                      {v.toLocaleString("ko-KR")}세대
                    </span>
                  </div>
                ))}
                <p className="text-[10px] leading-[1.6] text-text-3">
                  조회분 {supply.length}건 중 세대수 확인분 합계
                  {unknown > 0 && ` (세대수 미상 ${unknown}건 제외)`} · 일정은 변동될 수
                  있습니다
                </p>
              </div>
            );
          })()}
          <ul className="mt-2">
            {supply.slice(0, 6).map((s, i) => (
              <li
                key={`${s.moveInYm}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-ink">
                    {s.aptName ?? "미정"}
                    {s.bizType ? (
                      <span className="ml-1.5 rounded-full bg-primary-soft chip-pad-tight text-[10px] font-semibold text-primary">
                        {s.bizType}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-text-3">
                    {s.address ?? ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[13px] font-extrabold text-ink">
                    {s.moveInYm.slice(0, 4)}.{s.moveInYm.slice(4, 6)}
                  </div>
                  <div className="text-[11px] text-text-3">
                    {s.households ? `${s.households.toLocaleString()}세대` : "—"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href={`/supply?region=${encodeURIComponent(txRegion.city)}`}
            className="mt-3 inline-block text-[12px] font-bold text-primary"
          >
            {txRegion.city} 전체 입주 물량 ›
          </Link>
        </section>
      )}

      {/* 정비사업 — DB 확정분만. 0곳이거나 조회 실패면 섹션을 만들지 않는다.
          "정비사업이 없는 동네" 는 우리가 확인할 수 없는 주장이다. */}
      {projectsShown.length > 0 && (
        <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            {shortName} 정비사업{" "}
            <span className="text-[11px] font-medium text-text-3">
              공개 자료 확인분 {projects.length.toLocaleString("ko-KR")}곳
            </span>
          </h2>
          <ul className="mt-2">
            {projectsShown.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-ink">{p.name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-text-3">
                    {labelForType(p.typeKey)} · {stageLabel(p.stageKey)}
                    {p.address ? ` · ${p.address}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[11px] text-text-3">
                  {p.households ? `${p.households.toLocaleString("ko-KR")}세대` : "세대수 미공개"}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-[1.7] text-text-3">
            진행 단계는 공개 고시·언론 공개정보 기준 참고값입니다. 확정 일정과 조건은
            조합·지자체 공고를 확인해 주세요.
          </p>
          <Link
            href="/redevelopment"
            className="mt-2 inline-block text-[12px] font-bold text-primary"
          >
            정비사업 지도에서 보기 ›
          </Link>
        </section>
      )}

      {/* 이 지역 공개 임장노트 */}
      <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          {name} 공개 임장노트
        </h2>
        {!notesR.ok ? (
          <LoadFailed what="공개 임장노트" />
        ) : notes.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">
            아직 이 지역의 공개 임장노트가 없어요. 첫 노트를 남겨보세요.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {notes.map((n) => (
              <Link
                key={n.id}
                href={`/notes/${n.id}`}
                className="card card-hover block p-4"
              >
                <div className="truncate text-[13px] font-bold text-ink">
                  {n.title}
                </div>
                <div className="mt-1 text-[11px] text-text-3">
                  {n.region}
                  {n.aptName ? ` · ${n.aptName}` : ""} · {n.visitDate}
                </div>
                {n.summary ? (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-[1.6] text-text-2">
                    {n.summary}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* A5 — 면적대·가격대별 실거래 랜딩 내부 링크 */}
      {txBandRegion && (
        <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            면적대·가격대별 실거래{" "}
            <span className="text-[11px] font-medium text-text-3">
              국토부 신고 {txBandRegion.txCount.toLocaleString("ko-KR")}건 기준
            </span>
          </h2>
          {(["area", "price"] as const).map((kind) => {
            const cells = kind === "area" ? txBandRegion.areaCells : txBandRegion.priceCells;
            if (cells.length === 0) return null;
            return (
              <div key={kind} className="mt-3">
                <div className="mb-1.5 text-[11px] text-text-3">{BAND_KIND_LABEL[kind]}</div>
                <div className="flex flex-wrap gap-2">
                  {cells.map((c) => (
                    <Link
                      key={c.bandSlug}
                      href={`/tx/${encodeURIComponent(txBandRegion.slug)}/${kind}/${c.bandSlug}`}
                      className="card-hover rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-ink"
                    >
                      {c.bandLabel}
                      <span className="ml-1 font-medium text-text-3">
                        {c.txCount.toLocaleString("ko-KR")}건
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="mt-3 text-[12px] text-text-3">
            <Link
              href={`/tx/${encodeURIComponent(txBandRegion.slug)}`}
              className="font-bold text-primary underline"
            >
              {txBandRegion.name} 구간 전체 보기 →
            </Link>
          </p>
        </section>
      )}

      {/* Q&A — 위 숫자로만 만든 항목. FAQPage JSON-LD 는 QaBlock 이 함께 낸다. */}
      <QaBlock title={`${name} 자주 묻는 질문`} items={faq} />

      {/* [#88] 지역 시세 위젯 배포 진입점 — 중개사 블로그·홈페이지용. 위젯 안에
          출처 링크가 박혀 있으므로 퍼가기가 곧 백링크다(단지 위젯 N17 과 동일 원리). */}
      <div className="rise-in-3 mb-4 flex flex-col gap-1 rounded-[14px] border border-line bg-surface p-4">
        <span className="text-[13px] font-extrabold text-ink">
          {name} 시세를 블로그·홈페이지에 붙이기
        </span>
        <span className="text-[12px] leading-[1.7] text-text-2">
          중개사무소 블로그·홈페이지에 iframe 한 줄로 {name} 평균 매매가·전세가율·지수
          변동 카드를 실을 수 있습니다. 시세가 갱신되면 붙여넣은 위젯도 함께 갱신됩니다.
          무료이며 출처 표기가 포함됩니다.
        </span>
        <Link
          href={`/widget?region=${encodeURIComponent(id)}`}
          className="mt-2 w-fit rounded-[10px] bg-primary px-4 py-2 text-[12px] font-bold text-white"
        >
          위젯 코드 만들기 ›
        </Link>
      </div>

      {/* CTA */}
      <section className="rise-in-3 mb-4 flex flex-wrap gap-2">
        <Link
          href="/notes/new"
          className="rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-[var(--shadow-cta)]"
        >
          이 지역 임장노트 쓰기
        </Link>
        <Link
          href="/map"
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          지도에서 보기
        </Link>
        <Link
          href="/notifications"
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          시세 알림 구독
        </Link>
      </section>
    </PageShell>
  );
}
