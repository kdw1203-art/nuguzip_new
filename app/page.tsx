import Link from "next/link";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { AIPanel } from "./components/AIPanel";
import { ResumeDraftPopup } from "./components/home/ResumeDraftPopup";
import { EmptyState, ErrorState } from "./components/ui/EmptyState";
import { BetaNoticeModal } from "./components/BetaNoticeModal";
import { HomeMiniMap } from "./components/HomeMiniMap";
import { AdSlot } from "./components/ads/AdSlot";
import { AdSenseUnit } from "./components/ads/AdSenseUnit";
import { Footer } from "./components/Footer";
import { HomeTicker, type TickerItem } from "./components/home/HomeTicker";
import { HomeHeroSearch } from "./components/home/HomeHeroSearch";
import { HomeEngagementCard } from "./components/home/HomeEngagementCard";
import { HomeWatchlistBrief } from "./components/HomeWatchlistBrief";
import { BrandSloganBand } from "./components/BrandSloganBand";
import type { KpiRegion, KpiTemp } from "./components/home/HomeKpiRow";
import { HomeTodayLine } from "./components/home/HomeTodayLine";
import { HomeToolPick } from "./components/home/HomeToolPick";
import { HomeLevelKpi } from "./components/home/HomeLevelKpi";
import { RegionPulseCards } from "./components/home/RegionPulseCards";
import { loadLatestTemperatures } from "./components/MarketTempWidget";
import { loadNewHomeData } from "@/lib/newui/home-data";
import { loadHomeCoverage } from "@/lib/newui/home-coverage";
import { HomeCoverageLine } from "./components/home/HomeCoverageLine";
import { formatAsOfLabel } from "@/lib/newui/as-of-label";
import { getBaseRate } from "@/lib/market/base-rate";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { getWeeklyDigest } from "@/lib/newui/digest";
import { logger } from "@/lib/log";
import type { Metadata } from "next";
import type { DeltaTone, HomeBriefing } from "@/lib/newui/home-data";
/* #408 리디자인 — 히어로 카피 상수(HOME_HERO_*)·보조 CTA(지도/AI)·퍼널 칩은
   화면과 함께 내려갔다. 카피 정본은 lib/brand/home-copy.ts 에 그대로 있다. */
import {
  HOME_AI_BRIEFING_LABEL,
  HOME_AI_EXAMPLE_INPUT,
  HOME_AI_EXAMPLE_OUTPUT,
  HOME_AI_GATEWAY_LEAD,
  HOME_AI_GATEWAY_TITLE,
  HOME_CTA_AI,
  HOME_CTA_NOTE,
  HOME_HERO_SUBLINE_SHORT,
  HOME_PAGE_H1,
} from "@/lib/brand/home-copy";
import { seoAlternates } from "@/lib/seo/alternates";

// 스케일 지침 #21: 비로그인 홈은 정적 캐시 (5분 재검증) — 접속마다 재계산 금지
export const revalidate = 300;

/* 항목 43 — 홈 canonical. ReferralRedeem 이 ?ref_code= 트래픽을 홈으로
   보내므로, canonical 이 없으면 가장 권위 높은 URL 이 파라미터 변형으로
   쪼개진다. 제목·설명은 루트 레이아웃 것을 그대로 상속한다. */
export const metadata: Metadata = {
  alternates: seoAlternates("/"),
};

/* ANALYSIS_TOOLS 상수는 제거했다(2026-08-26).
   홈에서 도구 넷을 나열하지 않게 되면서 쓰는 곳이 없어졌다 —
   추천 로직과 그 근거는 app/components/home/HomeToolPick.tsx 가 갖는다.
   전체 목록이 필요하면 /analysis 허브(app/analysis/tool-catalog.ts)가 단일 출처다. */

/* G10 / 사실 우선: 여기 있던 5개 예시 폴백을 삭제했다.
   - MOCK_REGIONS: "강남구 32.5억 ▼4.2%" — 실존 자치구에 지어낸 시세·변동률
   - MOCK_NOTES:   "공작아파트 302동 78점" — 존재하지 않는 노트(클릭 시 죽은 링크)
   - MOCK_POSTS:   "청년 82.6% 세입자 시대…" — 지어낸 통계가 박힌 가짜 헤드라인
   - MOCK_MEETINGS:"과천지식정보타운 · 토 10:00 · 4/6" — 실제 장소약 없는 모임(사람이 나갈 수 있다)
   - MOCK_REPORTS: "관양동 재건축 흐름 분석 · 9,900원" — 팔지 않는 상품
   "예시" 배지를 붙여도 홈 첫 화면에서는 실데이터와 같은 카드 모양으로 읽힌다.
   데이터가 없으면 없다고 말하고, 채우는 행동(CTA)으로 안내한다. */

const LAB_NOTES_CAPTION =
  "Lab 데이터 노트는 실거래·통계로 편집부가 정리한 노트예요. 이웃이 직접 다녀와 쓴 노트가 올라오면 여기에 함께 보입니다.";

const deltaClass: Record<DeltaTone, string> = {
  down: "delta-down",
  up: "delta-up",
  flat: "delta-flat",
};

/* FunnelSteps(기록→AI→지도 칩 행)는 #408 리디자인에서 히어로와 함께 제거됐고,
   그 자리를 물려받았던 JourneyBanner("지금 어디부터 할까요?")도 2026-08-26 에
   홈에서 뺐다 — 주 버튼이 이미 시작하는 흐름을 배너가 한 번 더 설명하고 있었다. */

/** AI 시작 행동 + 시장 브리핑(참고) 강등
 *  [950] 홈 비판 ⑦ — "먼저 노트를 남겨 보세요"는 결과를 보여 주기 전에 노력을 요구했다.
 *  같은 예시를 문장이 아니라 **입력 → 정리** 두 칸으로 그려 결과의 모양을 먼저 보인다.
 *  예시라는 표식을 붙인다(지어낸 수치가 아니라 형식 안내다). 예시 노트가 실제로
 *  있으면(공개 노트 1건) "이렇게 정리됩니다" 링크로 실물을 잇는다. */
function HomeAiGateway({
  briefing,
  exampleNoteId,
}: {
  briefing: HomeBriefing | null;
  exampleNoteId: string | null;
}) {
  return (
    <AIPanel
      title={HOME_AI_GATEWAY_TITLE}
      cta={{ href: HOME_CTA_AI.href, label: HOME_CTA_AI.label }}
    >
      <p className="m-0">{HOME_AI_GATEWAY_LEAD}</p>
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-2">
          <div className="t-caption font-extrabold text-ai-muted">예시 · 현장 메모</div>
          <div className="mt-0.5 t-body leading-[1.5] text-white/85">
            {HOME_AI_EXAMPLE_INPUT}
          </div>
        </div>
        <div className="hidden text-center text-ai-accent sm:block" aria-hidden="true">
          →
        </div>
        <div className="rounded-lg border border-ai-accent/40 bg-white/5 px-2.5 py-2">
          <div className="t-caption font-extrabold text-ai-muted">예시 · AI 정리</div>
          <ul className="mt-0.5 m-0 list-none p-0 t-body leading-[1.5] text-white/85">
            {HOME_AI_EXAMPLE_OUTPUT.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {exampleNoteId && (
          <Link
            href={`/notes/${exampleNoteId}`}
            className="w-fit text-[12px] font-bold text-ai-accent no-underline"
          >
            실제 정리된 공개 노트 보기 ›
          </Link>
        )}
        {/* [958] 홈에서 단지 분석 도구 12종으로 가는 길이 없었다 — 한 줄 링크 */}
        <Link href="/analysis" className="w-fit text-[12px] font-bold text-ai-accent no-underline">
          단지 분석 도구 12종 ›
        </Link>
      </div>
      <div className="mt-2 border-t border-white/15 pt-2">
        <div className="mb-1 t-caption font-extrabold text-ai-muted">
          {HOME_AI_BRIEFING_LABEL}
        </div>
        {briefing ? (
          <>
            {briefing.text}
            <span className="ml-1.5 inline-flex items-center rounded border border-white/20 px-1 py-px align-middle text-[10px] font-semibold text-ai-muted">
              {briefing.asOfLabel}
            </span>
            {/* [950] 무엇을 잰 값인지 — 티커의 지역 평균과 같은 기준임을 한 줄로 */}
            <div className="mt-0.5 t-caption text-ai-muted">{briefing.basis}</div>
          </>
        ) : (
          <>오늘 브리핑을 아직 만들지 못했어요. 실거래 데이터가 갱신되면 표시됩니다.</>
        )}
      </div>
    </AIPanel>
  );
}

export default async function Home() {
  /* 4개 조회는 서로 의존이 없다 — 직렬로 기다리면 콜드/만료 렌더가 네 조회의
     시간을 전부 합산해 지불한다(`/` 는 300초 타임아웃 목록의 최상단이었다).
     한 Promise.all 로 임계 경로를 가장 느린 하나로 줄인다. */
  const [data, freshness, digest, baseRateData, coverage] = await Promise.all([
    loadNewHomeData(),
    // 데이터 신선도 라벨(#21) — 조회 실패 시 null → 캡션 미표시
    getMarketFreshnessDateLabel(),
    /* P1-9: 주간 다이제스트 진입 카드 티저 (1h 캐시).
       조회가 전부 실패하면 getWeeklyDigest() 는 던진다 — 홈까지 같이 죽일 이유는
       없으니 여기서는 티저만 포기하고, 대신 "0건" 같은 사실 아닌 문구는 쓰지
       않는다(카드 설명으로만 남긴다). */
    getWeeklyDigest().catch((e): null => {
      logger.error("[Home] 주간 다이제스트 조회 실패", e);
      return null;
    }),
    // 기준금리: ECOS(한국은행) 연동 시 실값, 미연동 시 "—" (허위 수치 금지)
    getBaseRate(),
    // [950] 커버리지 실수치(실거래·단지·지역) — 6시간 데이터 캐시, 실패 시 줄 생략
    loadHomeCoverage(),
  ]);

  /* 주차 라벨도 다이제스트에서 온다 — 못 읽었으면 없는 채로 둔다. */
  const digestWeekLabel = digest?.weekLabel ?? null;
  const digestTeaser =
    digest?.news[0]?.title ??
    (digest && digest.market.length > 0
      ? `${digest.market[0].name} 등 주요 지역 시세 요약`
      : "최근 7일 뉴스·시세·커뮤니티 요약");

  // 실데이터만 사용한다 — 0건이면 빈 상태를 그린다(가짜 카드로 채우지 않는다).
  const regions = data.regions;
  const notes = data.notes;
  const news = data.news;
  /* [950] 공개 노트가 전부 Lab(데이터·AI 편집) 노트면 그 사실을 한 줄로 적는다 —
     "나 같은 사람의 노트"가 없다는 걸 숨기지 않는다(홈 비판 ⑥). 이웃 노트가 하나라도
     섞이면 캡션은 사라진다. */
  const allLabNotes = notes.length > 0 && notes.every((n) => n.kind === "lab");
  /* [950] 검색 아래 지역 칩 — 티커·시세 카드와 같은 지역(실데이터)으로 맞춘다.
     예전 칩(동안구·만안구·의왕시·과천시)은 초기 커버리지의 흔적이라 "안양 근방
     서비스"로 읽혔다(홈 비판 ③). 지역 카드가 비면 칩 자체를 그리지 않는다. */
  const heroRegionChips = regions.slice(0, 4).map((r) => ({
    label: r.name,
    href: `/map?region=${encodeURIComponent(r.name)}`,
  }));
  const posts = data.posts;
  const meetings = data.meetings;
  const reports = data.reports;
  /* 빈 배열이 "아직 없음"인지 "조회 실패"인지 구분하는 값.
     이게 없던 시절에는 DB 가 잠깐 죽으면 홈이 "아직 올라온 글이 없어요"라고
     말했다 — 글은 있는데. 조회 실패는 데이터 없음이 아니다. */
  const failed = data.failed;

  /* 사실 기반 원칙: 지표는 티커가 그린다(#409 — MarketStrip 흡수).
     티커는 없는 항목을 "—"로 채우지 않고 **뺀다**. "—" 폴백은 매매지수·
     기준금리에만 남는다(아래 조건들이 그 값으로 유무를 가른다). */
  const saleIndexSeoul = data.saleIndexSeoul ?? "—";
  const loanRate = data.loanRate;
  const baseRate = baseRateData?.label ?? "—";
  /* 기준시점 — 기준금리는 일 단위, 주담대는 월 공시라 시점 없이 나란히 두면
     두 달 차이 나는 숫자가 같은 날처럼 읽힌다. 티커 값에 함께 싣는다. */
  const baseRateAsOf = formatAsOfLabel(baseRateData?.cycle ?? null);
  const loanRateAsOf = formatAsOfLabel(data.loanRateAsOf);

  // 홈 미니지도 마커용 시세 지역 (좌표 매핑은 HomeMiniMap 내부) — 실데이터만 마커로 표시
  const mapRegions = regions.slice(0, 4);

  /* ---- 홈 리디자인(#408) — 티커·KPI 데이터. 전부 실측이고, 없으면 그
     항목/칸이 **빠진다**(가짜 숫자·"—" 채움 없음. KPI 는 그리드가 접힌다). */
  let kpiTemp: KpiTemp | null = null;
  try {
    const t = await loadLatestTemperatures();
    const row =
      t.rows.find((r) => r.current.regionId === (regions[0]?.id ?? "")) ??
      t.rows[0] ??
      null;
    if (row) {
      const m = row.current.weekStart.match(/^\d{4}-(\d{2})-(\d{2})$/);
      kpiTemp = {
        score: row.current.score,
        headline: row.current.headline,
        weekLabel: m ? `${Number(m[1])}.${m[2]} 주` : row.current.weekStart,
      };
    }
  } catch {
    /* 아카이브 없음/조회 실패 — 티커·KPI에서 온도 항목만 빠진다
       (MarketTempWidget 과 같은 판단: 곁다리는 조용히 접는 쪽이 정직하다). */
    kpiTemp = null;
  }
  const kpiRegion: KpiRegion | null = regions[0]
    ? {
        name: regions[0].name,
        price: regions[0].price,
        delta: regions[0].delta,
        tone: regions[0].tone,
        /* meta("서울 · 120건")에서 실거래 건수만 — 우리 포맷의 표시용 파싱 */
        tradeLabel: regions[0].meta.match(/([\d,]+건)/)?.[1] ?? null,
        href: `/map?region=${encodeURIComponent(regions[0].name)}`,
        periodLabel: regions[0].periodLabel,
      }
    : null;
  const tickerItems: TickerItem[] = [];
  for (const r of regions.slice(0, 3)) {
    tickerItems.push({
      /* [950] 기준월을 라벨에 — 티커·카드·브리핑이 같은 달(부동산원 지수)임을 드러낸다 */
      label: r.periodLabel ? `${r.name} ${r.periodLabel} 평균` : `${r.name} 평균`,
      value: `${r.price} ${r.delta}`,
      tone: r.tone,
      href: `/map?region=${encodeURIComponent(r.name)}`,
      kind: "region", // 주인공 (A15)
    });
  }
  if (saleIndexSeoul !== "—") {
    tickerItems.push({
      /* [950] "매매지수" 만으로는 무엇인지 모른다는 지적 — 출처를 라벨에 */
      label: "부동산원 매매지수 · 서울",
      value: saleIndexSeoul,
      href: "/analysis/timing",
      kind: "macro",
    });
  }
  /* 기준시점을 값에 함께 싣는다(#409) — 기준금리는 일 단위, 주담대는 월 공시라
     시점 없이 나란히 흐르면 두 달 차이 나는 숫자가 같은 날처럼 읽힌다
     (MarketStrip 이 지키던 표기를 티커가 물려받는다). */
  if (baseRate !== "—") {
    tickerItems.push({
      label: "기준금리",
      value: baseRateAsOf ? `${baseRate} (${baseRateAsOf})` : baseRate,
      href: "/analysis/scenario",
      kind: "macro",
    });
  }
  if (loanRate) {
    tickerItems.push({
      label: "주담대 변동",
      value: loanRateAsOf ? `${loanRate} (${loanRateAsOf} 공시)` : loanRate,
      href: "/analysis/scenario",
      kind: "macro",
    });
  }
  if (kpiTemp) {
    tickerItems.push({
      /* [950] "온도 45" 는 척도를 모르면 읽히지 않는다 — 0~100 척도를 값에 적는다 */
      label: "시장 온도 (0~100)",
      value: `${kpiTemp.score} · ${kpiTemp.headline}`,
      href: "/analysis/temperature",
      kind: "macro",
    });
  }
  /* 커뮤니티 규모 지표는 임계(100) 전까지 싣지 않는다 — "15건"을 전면에
     흘리는 건 정직이 아니라 역광고다(수치를 부풀리지 않되, 작을 때는
     시장 데이터가 밴드의 주인공이 된다). 임계를 넘으면 실측 그대로 복귀. */
  const COMMUNITY_TICKER_MIN = 100;
  if (data.publicNotesTotal !== null && data.publicNotesTotal >= COMMUNITY_TICKER_MIN) {
    tickerItems.push({
      label: "공개 임장노트",
      value: `${data.publicNotesTotal}건`,
      tone: "up",
      href: "/notes",
      kind: "macro",
    });
  }
  if (data.activityToday !== null && data.activityToday >= COMMUNITY_TICKER_MIN) {
    tickerItems.push({ label: "오늘 활동", value: `${data.activityToday}건`, kind: "macro" });
  }
  /* 출처·기준일은 화면에 **한 번만** 적는다.
     예전엔 검색 히어로 바로 아래에 "실거래 데이터 YYYY.MM.DD 기준 · 국토교통부
     신고분"을 따로 깔았는데, 같은 사실이 이 티커의 "실거래 기준"과 푸터의
     "실거래가는 국토교통부 공개 데이터 기준입니다"에도 이미 있었다 — 첫 화면에서
     같은 말을 세 번 하면 정작 물어보는 문장("어느 단지가 궁금하세요?")이 묻힌다.
     기준일은 여기(클릭하면 /tx 로 간다), 출처 표기는 푸터가 맡는다. */
  if (freshness) {
    tickerItems.push({
      /* [950] "실거래 기준 9.2" 와 "7월 평균" 이 나란히 흐르면 모순으로 읽힌다 —
         이 날짜는 신고분 적재일이지 평균의 기준월이 아니다. 라벨로 구분한다. */
      label: "실거래 신고분 적재",
      value: String(freshness),
      href: "/tx",
      kind: "macro",
    });
  }

  return (
    <>
      <Header />

      {/* id 는 layout.tsx 의 "본문 바로가기" 스킵 링크(href="#main-content") 목적지다.
          이 페이지만 PageShell 을 안 쓰고 <main> 을 직접 그리면서 id 를 빠뜨렸던 탓에,
          globals.css 가 .sr-only:focus 를 노출시켜 키보드 사용자에게 링크가 보이는데
          Enter 를 눌러도 아무 데도 안 가는 상태였다(홈이 첫 Tab 대상이라 제일 잘 걸린다). */}
      <main
        id="main-content"
        className="mx-auto w-full max-w-[1240px] flex-1 px-3.5 pb-32 pt-3.5 md:px-5 md:pb-16 md:pt-5"
      >
        {/* 이 문서의 유일한 H1. 시각 히어로는 뷰포트별로 두 벌이 다 그려지고
            로그인하면 둘 다 숨는다 — 그래서 제목을 히어로에 맡기면 h1 이
            2개였다가 0개가 된다. 여기 하나만 두고, 히어로는 <p> 로 그린다.
            (sr-only 는 globals.css 에서 :focus 때만 드러나는데 h1 은 포커스
             대상이 아니라 항상 숨은 채로 있는다.) */}
        <h1 className="sr-only">{HOME_PAGE_H1}</h1>

        {/* 개인화 대형 블록(PersonalHome)은 소유자 지시(2026-08-16 "팝업형식
            또는 제거")로 내렸다 — 새 홈(검색·KPI·칩)이 개인화 조각을 이미
            흡수했고, 남은 핵심(작성 중 노트 복귀)만 우하단 팝업으로 남는다. */}
        <ResumeDraftPopup />

        {/* ================= 모바일 — 검색 포털 + 상황판 (#408 A+B 조합) ================= */}
        <section className="flex flex-col gap-2.5 md:hidden">
          {/* 검색이 첫인상 (시안 B). 질문 한 줄 + 대형 검색 + 실기록 칩.

              [2026-08-28] min-h-[42dvh] + justify-center 를 걷어냈다.
              안에 든 것(제목·검색창)은 다 합쳐 140px 남짓인데 화면 높이의 42%를
              **미리 잡아 두고** 그 안에서 가운데 정렬을 했다. 남는 높이는 위아래
              빈칸으로 갈라져, 좁은 창에서는 헤더와 제목 사이·칩과 티커 사이에
              큰 여백 두 덩이가 생겼다(소유자 캡처).

              옛 주석은 "로그인하면 globals.css 가 min-height 를 접는다"고 적혀
              있었지만 `.home-search-hero` 규칙은 CSS 에 존재하지 않는다 —
              접히는 일이 없었고, 그래서 항상 42dvh 를 먹고 있었다.
              지금은 내용 높이대로 서고 여백은 패딩으로만 준다. */}
          <div className="flex flex-col gap-3 pb-3 pt-5">
            <p className="rise-in t-display text-center text-ink">
              어느 단지가 궁금하세요?
            </p>
            {/* [950] 무엇이 다른 서비스인지 한 줄(홈 비판 ①) — 히어로 블록 없이 보조문만 */}
            <p className="rise-in -mt-1 text-center t-sub text-text-2">{HOME_HERO_SUBLINE_SHORT}</p>
            <div className="rise-in-1">
              <HomeHeroSearch regionChips={heroRegionChips} />
            </div>
            <HomeCoverageLine coverage={coverage} publicNotes={data.publicNotesTotal} className="rise-in-1" />
          </div>

          {/* #408 시세 티커 — 소유자 캡처 지시(2026-08-17): 헤더 밑이 아니라
              검색 아래·상황판 위로. 검색이 첫인상, 숫자 밴드가 상황판의 머리가 된다. */}
          {tickerItems.length > 0 && (
            <div className="rise-in-2">
              <HomeTicker items={tickerItems} />
            </div>
          )}

          {/* 홈의 주제 — 한 문장. (A03)
              예전에는 KPI 4칸을 나란히 놨는데, 넷을 동시에 말하면 무엇이 중요한지
              사라진다. 가장 큰 변화 하나를 문장으로 말하고 나머지는 그 아래 작게. */}
          <div className="rise-in-2">
            <HomeTodayLine
              region={kpiRegion}
              temp={kpiTemp}
              saleIndex={saleIndexSeoul}
              baseRate={baseRate}
              loanRate={loanRate}
              publicNotes={data.publicNotesTotal}
            />
          </div>

          {/* 개인 영역 — 시장 사실과 **분리**한다. (A01)
              내 임장 레벨은 시장 지표가 아니라 나의 상태다. 예전엔 KPI 4번째 칸에
              있어서 앞의 셋(지역 평균·온도·거래량)과 같은 종류로 읽혔다. */}
          <HomeEngagementCard />
          <HomeLevelKpi />

          {/* [OPT-47] 내 워치 단지 최근 거래 브리핑 — 같은 원칙(클라이언트 섬·ISR 유지) */}
          <HomeWatchlistBrief />

          <Link
            href={HOME_CTA_NOTE.href}
            className="btn-primary glow press rise-in-3 rounded-xl p-3 text-center text-[15px]"
          >
            {HOME_CTA_NOTE.label}
          </Link>

          {/* [946 리브랜딩 ⑤] 슬로건 띠 — 한지 + 세리프 한 줄, CTA 바로 아래 */}
          <BrandSloganBand className="rise-in-3" />

          {/* 관심지역 실지도 — 스크롤 아래로 이동 (시안 B) */}
          <div data-reveal="">
            <HomeMiniMap regions={mapRegions} className="h-[208px]" />
          </div>

          {/* "지금 어디부터 할까요?"(JourneyBanner) 는 홈에서 제거했다
              (소유자 지시 2026-08-26). 기록 → AI → 지도 흐름은 주 버튼
              "임장노트 쓰기" 가 이미 시작하고, 같은 말을 두 번 하면 홈의
              주제가 다시 흐려진다. */}

          {/* 도구는 넷을 나열하지 않고 **하나를 이유와 함께** 추천한다. (A06·A07)
              넷을 늘어놓는 건 고르라는 뜻인데, 처음 온 사람은 고를 근거가 없었다. */}
          <div data-reveal="">
            <HomeToolPick />
          </div>

          {/* 공개 노트 증거 (모바일) */}
          <div data-reveal="" className="card flex flex-col gap-2 rounded-2xl px-4 py-4">
            <div className="flex items-center justify-between">
              <h2 className="t-section text-ink">공개 임장노트</h2>
              <Link
                href="/notes"
                className="text-[12px] text-text-3 transition-colors hover:text-primary"
              >
                더보기
              </Link>
            </div>
            {notes.length === 0 ? (
              failed.notes ? (
                <p className="t-sub text-text-3">목록을 지금 불러오지 못했어요.</p>
              ) : (
                <EmptyState
                  icon="notebook-pen"
                  title="아직 공개된 임장노트가 없어요"
                  desc="첫 노트를 남기면 여기에 소개됩니다."
                  action={{ label: "첫 공개 노트 남기기", href: "/notes/new" }}
                />
              )
            ) : (
              notes.map((n, i) => (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className={`-mx-1.5 flex items-center justify-between gap-3 rounded-lg px-1.5 py-[7px] t-body no-underline transition-colors hover:bg-[rgba(29,79,216,.05)] ${
                    i < notes.length - 1 ? "border-b border-divider" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {/* [950] 누가 쓴 노트인지(홈 비판 ⑥) — Lab 데이터 노트와 이웃 노트를 구분 */}
                    <span className={`shrink-0 rounded px-1 py-px t-caption font-extrabold ${n.kind === "lab" ? "bg-[rgba(0,0,0,.05)] text-text-3" : "bg-primary-soft text-primary"}`}>
                      {n.kind === "lab" ? "Lab 데이터" : "이웃"}
                    </span>
                    <span className="truncate font-semibold text-text-1">{n.title}</span>
                  </span>
                  <span
                    title="현장 체크 5개 항목 평균 × 20 (100점 만점)"
                    className={`shrink-0 rounded-md px-1.5 py-0.5 t-caption font-extrabold ${n.hot ? "bg-primary-soft text-primary" : "bg-[rgba(0,0,0,.045)] text-text-3"}`}
                  >
                    {n.score}
                  </span>
                </Link>
              ))
            )}
            {allLabNotes && <p className="m-0 t-caption text-text-3">{LAB_NOTES_CAPTION}</p>}
          </div>

          <div data-reveal="">
            <HomeAiGateway briefing={data.briefing} exampleNoteId={notes[0]?.id ?? null} />
          </div>

          <div data-reveal="" className="flex flex-col gap-3">
            {/* 소제목을 눈에도 보이게. (A10)
                sr-only 면 스크린리더만 주제를 안다 — 화면을 보는 사람에게
                구역이 그냥 카드 더미로 보이던 이유다. */}
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="t-section text-ink">지역 시세</h2>
              <Link href="/map" className="t-sub font-bold text-primary no-underline">
                지도에서 전체 보기 ›
              </Link>
            </div>
            {regions.length === 0 ? (
              failed.regions ? (
                <ErrorState
                  title="지역 시세를 지금 불러오지 못했어요"
                  desc="데이터가 없는 게 아니라 조회가 실패했어요. 잠시 후 다시 열어 주세요."
                  action={{ label: "지도에서 찾아보기", href: "/map" }}
                />
              ) : (
                <EmptyState
                  icon="map"
                  title="지역 시세를 아직 불러오지 못했어요"
                  desc="실거래 스냅샷이 준비되면 여기에 표시됩니다."
                  action={{ label: "지도에서 찾아보기", href: "/map" }}
                />
              )
            ) : (
              regions.slice(0, 2).map((r) => (
                <div
                  key={r.id}
                  className="card tile flex items-center justify-between rounded-2xl px-4 py-3.5"
                >
                  <div>
                    <div className="t-body font-bold text-ink">{r.name}</div>
                    <div className="t-sub text-text-3">{r.meta}</div>
                  </div>
                  <div className="text-right">
                    <div className="t-num t-section text-ink">{r.price}</div>
                    <div className={`t-sub ${deltaClass[r.tone]}`}>{r.delta}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 허브 밀도 축소 — 다이제스트·모임·안전 등 한 카드로 */}
          <div data-reveal="" className="card flex flex-col gap-2 rounded-2xl px-4 py-4">
            <h2 className="text-[13px] font-extrabold text-ink">더 알아보기</h2>
            <Link
              href="/digest"
              className="flex items-center justify-between gap-2 py-1.5 t-body no-underline"
            >
              <span className="min-w-0">
                <span className="block font-bold text-text-1">
                  주간 다이제스트{digestWeekLabel ? ` · ${digestWeekLabel}` : ""}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-text-3">
                  {digestTeaser}
                </span>
              </span>
              <span className="shrink-0 font-extrabold text-primary">›</span>
            </Link>
            {/* 분석 도구 행은 위 컴팩트 스트립 신설로 중복이 돼 자료실로 교체 —
                크리에이터 판매 루프(유료 리포트)의 홈 발견 경로가 없었다. */}
            <Link
              href="/town/library"
              className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
            >
              자료실 · 임장 리포트 <span className="text-primary">›</span>
            </Link>
            {/* 수익모델·팀 서사 동선(#홈비판) — 리포트 판매와 만든 사람 이야기 */}
            <Link
              href="/creators"
              className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
            >
              크리에이터 입점 · 리포트 판매 <span className="text-primary">›</span>
            </Link>
            <Link
              href="/town/groups"
              className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
            >
              임장 모임 <span className="text-primary">›</span>
            </Link>
            <Link
              href="/about"
              className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
            >
              내집나우 이야기 <span className="text-primary">›</span>
            </Link>
            <Link
              href="/safety"
              className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
            >
              전세 안전 진단 <span className="text-primary">›</span>
            </Link>
            {/* 동네이야기는 목록의 죽은 라벨이 아니라 **살아 있는 입구**여야 한다. (A18)
                주간 다이제스트 행이 티저를 다는 것과 같은 규칙 — 지금 저기 무엇이
                있는지 한 줄 보여야 눌러 볼 이유가 생긴다. 글이 없으면 없다고 쓴다. */}
            <Link href="/town" className="flex flex-col gap-0.5 py-1.5 no-underline">
              <span className="flex items-center justify-between t-body font-semibold text-text-1">
                동네이야기 <span className="text-primary">›</span>
              </span>
              <span className="truncate t-sub text-text-3">
                {failed.posts
                  ? "지금 불러오지 못했어요"
                  : posts.length > 0
                    ? posts[0].title
                    : news.length > 0
                      ? `뉴스 · ${news[0].title}`
                      : "아직 올라온 글이 없어요 — 첫 글을 남겨 보세요"}
              </span>
            </Link>
            {/* [950] 수익모델이 홈에 없다는 지적(투자자 ④) — 무엇이 유료인지 한 줄로 잇는다.
                수익 약속 표현은 쓰지 않는다(푸터 고지와 같은 원칙). */}
            <Link
              href="/subscription"
              className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
            >
              구독 안내 · 기록·지도는 무료, 유료는 AI 분석 깊이·월 한도 확대 <span className="text-primary">›</span>
            </Link>
          </div>

          {/* H3 광고 슬롯 — 등록 배너 없으면 하우스 광고, 그것도 없으면 아무것도 안 그림.
              이 페이지는 revalidate=300 공유 캐시라 보는 사람의 플랜을 알 수 없다.
              그래서 plan={null} — 특정 플랜 겨냥 배너는 여기서 제외되고, 유료 플랜의
              광고 제거는 AdSlot 안의 AdFreeGate 가 클라이언트에서 처리한다(캐시 유지). */}
          <AdSlot placement="home_feed" seed={0} plan={null} />
        </section>

        {/* ================= 데스크탑 홈 ================= */}
        <section className="hidden md:block">
          {/* #408 A+B — 히어로 카피 없음. 질문 한 줄 + 대형 검색이 첫인상.
              소유자 캡처 지시(2026-08-16): 검색은 **페이지 전폭의 정중앙** —
              사이드바 열 밖으로 빼고, 사이드바는 KPI 줄부터 시작한다.
              2026-08-17 지시: 티커를 검색 아래로 내리고 검색은 위로 —
              py-9→py-5 로 죄어 첫 화면 밀집도를 올린다. */}
          <div className="rise-in flex flex-col justify-center gap-3 py-5">
            <p className="t-display text-center text-ink">
              어느 단지가 궁금하세요?
            </p>
            {/* [950] 무엇이 다른 서비스인지 한 줄(홈 비판 ①) */}
            <p className="-mt-1 text-center t-sub text-text-2">{HOME_HERO_SUBLINE_SHORT}</p>
            <HomeHeroSearch regionChips={heroRegionChips} />
            <HomeCoverageLine coverage={coverage} publicNotes={data.publicNotesTotal} />
          </div>

          {/* #408 시세 티커 — 소유자 캡처 지시(2026-08-17): 헤더 밑이 아니라
              검색 아래·KPI 위 전폭 밴드로. 검색(질문)이 먼저, 숫자(상황판)가 다음. */}
          {tickerItems.length > 0 && (
            <div className="rise-in-1 mb-4">
              <HomeTicker items={tickerItems} />
            </div>
          )}

          {/* [946 리브랜딩 ⑤] 슬로건 띠 — 티커 아래 전폭 */}
          <BrandSloganBand className="rise-in-1 mb-4" />

          {/* 이하 2열 — 본문(KPI부터) | 사이드바 (윗선이 같다) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* data-autotrim: 조건부 블록이 빠져도 그 자리가 남지 않는다 (globals.css 3.5) */}
          <div data-autotrim="" className="flex flex-col gap-4">
            {/* 홈의 주제 — 한 문장. 그 아래 시장 지표 3칸이 뒷받침한다. (A03) */}
            <div className="rise-in-1">
              {/* KPI 3칸을 여기서 뺐다(2026-08-26). HomeTodayLine 안의 보조 지표 줄이
                  같은 숫자(시장 온도·거래 건수·매매지수)를 이미 말한다 — 한 화면에
                  같은 사실 두 벌은 소유자가 지적한 "주제가 안 보인다"의 전형이다. */}
              <HomeTodayLine
              region={kpiRegion}
              temp={kpiTemp}
              saleIndex={saleIndexSeoul}
              baseRate={baseRate}
              loanRate={loanRate}
              publicNotes={data.publicNotesTotal}
            />
            </div>

            {/* [개선 #11·12·29] 로그인 사용자의 매일 루프 (게스트에겐 미렌더) */}
            <HomeEngagementCard />
            {/* 내 진행 — 시장 지표와 분리한다 (A01) */}
            <div className="rise-in-1">
              <HomeLevelKpi />
            </div>

            {/* 지도 | 도구 추천 — "보고 → 파고" 동선 (시안 A). 도구 스트립은
                지도 오른쪽 세로 스택으로 이동, 노트 CTA 가 스택을 닫는다. */}
            {/* 지도가 주인공이다 — 도구 열이 지도를 좁히던 300px 를 260px 로. (A14)
                도구는 넷 나열 대신 근거 있는 하나(A06·A07), 그 아래 주 행동 하나(A04). */}
            {/* 지도가 본문 전체 폭을 쓴다 (소유자 지시 2026-08-26).
                오른쪽 260px 도구 열은 항목 하나짜리 카드라 지도만 좁히고 있었다 —
                도구는 모바일 홈과 /analysis 허브가 맡는다.
                주 행동(임장노트 쓰기)은 지도 아래 전체 폭 막대로 남긴다. */}
            <div className="rise-in-1 flex flex-col gap-3">
              <HomeMiniMap regions={mapRegions} className="h-[360px]" />
              <Link
                href={HOME_CTA_NOTE.href}
                className="btn-primary btn-cta press rounded-2xl p-3.5 text-center t-section"
              >
                {HOME_CTA_NOTE.label}
              </Link>
            </div>


            {/* 공개 노트 · 동네이야기 — 행 클릭 가능 (증거) */}
            <div data-reveal="" className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="card tile flex flex-col gap-2 rounded-2xl px-5 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="accent-underline t-section text-ink">
                    공개 임장노트
                  </h2>
                  <Link
                    href="/notes"
                    className="text-[12px] text-text-3 transition-colors hover:text-primary"
                  >
                    더보기
                  </Link>
                </div>
                {notes.length === 0 ? (
                  failed.notes ? (
                    <ErrorState
                      title="공개 임장노트를 지금 불러오지 못했어요"
                      desc="노트가 없는 게 아니라 조회가 실패했어요. 잠시 후 다시 열어 주세요."
                      action={{ label: "임장노트 보기", href: "/notes" }}
                    />
                  ) : (
                    <EmptyState
                      icon="notebook-pen"
                      title="아직 공개된 임장노트가 없어요"
                      desc="첫 노트를 남기면 여기에 소개됩니다."
                      action={{ label: "첫 공개 노트 남기기", href: "/notes/new" }}
                    />
                  )
                ) : (
                  notes.map((n, i) => (
                    <Link
                      key={n.id}
                      href={`/notes/${n.id}`}
                      className={`-mx-1.5 flex items-center justify-between gap-3 rounded-lg px-1.5 py-[7px] t-body no-underline transition-colors hover:bg-[rgba(29,79,216,.05)] ${
                        i < notes.length - 1 ? "border-b border-divider" : ""
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={`shrink-0 rounded px-1 py-px t-caption font-extrabold ${n.kind === "lab" ? "bg-[rgba(0,0,0,.05)] text-text-3" : "bg-primary-soft text-primary"}`}>
                          {n.kind === "lab" ? "Lab 데이터" : "이웃"}
                        </span>
                        <span className="truncate font-semibold text-text-1">{n.title}</span>
                      </span>
                      <span
                        title="현장 체크 5개 항목 평균 × 20 (100점 만점)"
                        className={`shrink-0 rounded-md px-1.5 py-0.5 t-caption font-extrabold ${n.hot ? "bg-primary-soft text-primary" : "bg-[rgba(0,0,0,.045)] text-text-3"}`}
                      >
                        {n.score}
                      </span>
                    </Link>
                  ))
                )}
                {allLabNotes && <p className="m-0 t-caption text-text-3">{LAB_NOTES_CAPTION}</p>}
              </div>
              <div className="card tile flex flex-col gap-2 rounded-2xl px-5 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="accent-underline t-section text-ink">
                    동네이야기 · 자료
                  </h2>
                  <Link
                    href="/town"
                    className="text-[12px] text-text-3 transition-colors hover:text-primary"
                  >
                    더보기
                  </Link>
                </div>
                {posts.length === 0 ? (
                  failed.posts ? (
                    <ErrorState
                      title="동네이야기를 지금 불러오지 못했어요"
                      desc="글이 없는 게 아니라 조회가 실패했어요. 잠시 후 다시 열어 주세요."
                      action={{ label: "동네이야기 보기", href: "/town" }}
                    />
                  ) : news.length > 0 ? (
                    /* [950] 빈 방 대신 읽을거리(홈 비판 ⑧) — 자동수집 뉴스 3건을 뉴스라고
                       적어서 보여 주고, 첫 글 부담은 한 줄짜리 낮은 문턱으로 남긴다.
                       사람 글이 생기면 위 posts 분기가 그 자리를 다시 가져간다. */
                    <>
                      {news.map((n, i) => (
                        <Link
                          key={n.id}
                          href={`/town/news/${n.id}`}
                          className={`-mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-[7px] t-body no-underline transition-colors hover:bg-[rgba(29,79,216,.05)] ${
                            i < news.length - 1 ? "border-b border-divider" : ""
                          }`}
                        >
                          <span className="shrink-0 rounded bg-[rgba(0,0,0,.05)] px-1 py-px t-caption font-extrabold text-text-3">
                            뉴스
                          </span>
                          <span className="min-w-0 truncate font-semibold text-text-1">{n.title}</span>
                          {n.source && (
                            <span className="ml-auto shrink-0 text-[12px] text-text-3">{n.source}</span>
                          )}
                        </Link>
                      ))}
                      <Link
                        href="/town/write"
                        className="mt-1 text-[12px] font-bold text-primary no-underline"
                      >
                        다녀온 동네 한 줄 남기기 ›
                      </Link>
                    </>
                  ) : (
                    <EmptyState
                      icon="messages-square"
                      title="아직 이웃 글이 없어요"
                      desc="임장 다녀온 동네 한 줄이면 충분합니다."
                      action={{ label: "한 줄 남기기", href: "/town/write" }}
                    />
                  )
                ) : (
                  posts.map((p, i) => (
                    <Link
                      key={p.id}
                      href={`/town/news/${p.id}`}
                      className={`-mx-1.5 block rounded-lg px-1.5 py-[7px] t-body font-semibold text-text-1 no-underline transition-colors hover:bg-[rgba(29,79,216,.05)] hover:text-primary ${
                        i < posts.length - 1 ? "border-b border-divider" : ""
                      }`}
                    >
                      {p.rank} {p.title}{" "}
                      <span className="font-normal text-text-3">댓글 {p.comments}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
            {/* 지역 시세 카드 4열 — 라운드 확대 + 호버 리프트 */}
            {/* 소제목을 눈에도 보이게. (A10)
                sr-only 면 스크린리더만 주제를 안다 — 화면을 보는 사람에게
                구역이 그냥 카드 더미로 보이던 이유다. */}
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="t-section text-ink">지역 시세</h2>
              <Link href="/map" className="t-sub font-bold text-primary no-underline">
                지도에서 전체 보기 ›
              </Link>
            </div>
            {regions.length === 0 ? (
              failed.regions ? (
                <ErrorState
                  className="rise-in-2"
                  title="지역 시세를 지금 불러오지 못했어요"
                  desc="데이터가 없는 게 아니라 조회가 실패했어요. 잠시 후 다시 열어 주세요."
                  action={{ label: "지도에서 찾아보기", href: "/map" }}
                />
              ) : (
                <EmptyState
                  className="rise-in-2"
                  icon="map"
                  title="지역 시세를 아직 불러오지 못했어요"
                  desc="국토교통부 실거래 스냅샷이 적재되면 이 자리에 지역별 평균가와 변동률이 표시됩니다."
                  action={{ label: "지도에서 찾아보기", href: "/map" }}
                />
              )
            ) : (
              /* 지역 시세 카드 — 스파크라인(실데이터)·카운트업·지도 딥링크 (#파란영역 고도화) */
              <RegionPulseCards regions={regions.slice(0, 4)} />
            )}

            {/* 데이터 신선도 캡션(#21) — market_ingest_log 최근 성공 기준, null이면 미표시 */}
            {freshness && (
              <p className="t-caption -mt-2 text-text-3">
                실거래 기준: {freshness} (국토교통부)
              </p>
            )}

          </div>

          {/* 사이드바 — AI 시작 + 허브 묶음.
              웹4 — 긴 좌측 컬럼을 스크롤하는 동안 우측이 먼저 끝나 빈 벽이
              됐다. sticky 로 따라오게 한다. top 76px = 헤더(48px 스크롤 시)
              + 상단 여백. self-start 필수 — 그리드 기본 stretch 상태에서는
              aside 높이가 행 전체라 sticky 가 작동하지 않는다. */}
          <aside data-autotrim="" className="flex flex-col gap-3 lg:sticky lg:top-[76px] lg:self-start">
            <div className="rise-in-1">
              <HomeAiGateway briefing={data.briefing} exampleNoteId={notes[0]?.id ?? null} />
            </div>

            {/* 시장 온도 위젯은 #409 로 제거 — 티커·KPI 칸이 같은 스냅샷을
                이미 말하고, 상세는 KPI 칸이 /analysis/temperature 로 잇는다. */}

            <div className="rise-in-2 card flex flex-col gap-2 rounded-2xl px-5 py-4">
              <h2 className="accent-underline text-[13px] font-extrabold text-ink">
                더 알아보기
              </h2>
              <Link
                href="/digest"
                className="flex flex-col gap-0.5 py-1.5 no-underline"
              >
                <span className="flex items-center justify-between t-body font-bold text-text-1">
                  주간 다이제스트{digestWeekLabel ? ` · ${digestWeekLabel}` : ""}
                  <span className="text-primary">›</span>
                </span>
                <span className="truncate text-[12px] text-text-3">{digestTeaser}</span>
              </Link>
              <Link
                href="/safety"
                className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
              >
                전세 안전 진단
                <span className="text-primary">›</span>
              </Link>
              <Link
                href="/town/experts"
                className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
              >
                전문가 찾아보기
                <span className="text-primary">›</span>
              </Link>
              <Link
                href="/town/experts/join"
                className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
              >
                전문가로 참여 · 자격 인증
                <span className="text-primary">›</span>
              </Link>
              {/* 자료실 — 유료 리포트 판매 루프의 홈 발견 경로 (전에는 없었다) */}
              <Link
                href="/town/library"
                className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
              >
                자료실 · 임장 리포트
                <span className="text-primary">›</span>
              </Link>
              {/* 수익모델·팀 서사 동선(#홈비판) */}
              <Link
                href="/creators"
                className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
              >
                크리에이터 입점 · 리포트 판매
                <span className="text-primary">›</span>
              </Link>
              <Link
                href="/town/groups"
                className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
              >
                임장 모임
                <span className="text-primary">›</span>
              </Link>
              <Link
                href="/about"
                className="flex justify-between py-1.5 t-body font-semibold text-text-1 no-underline"
              >
                내집나우 이야기
                <span className="text-primary">›</span>
              </Link>
              {/* [950] 수익모델 동선(투자자 ④) — 수익 약속 표현 없음 */}
              <Link
                href="/subscription"
                className="flex flex-col gap-0.5 py-1.5 no-underline"
              >
                <span className="flex items-center justify-between t-body font-semibold text-text-1">
                  구독 안내
                  <span className="text-primary">›</span>
                </span>
                <span className="truncate text-[12px] text-text-3">
                  기록·지도는 무료 · 유료는 AI 분석 깊이·월 한도 확대
                </span>
              </Link>
              {meetings.length > 0 && (
                <ul className="mt-0.5 flex flex-col gap-1 border-t border-divider pt-2">
                  {meetings.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/town/groups/${m.id}`}
                        className="block truncate text-[12px] text-text-3 no-underline hover:text-primary"
                      >
                        {m.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {meetings.length === 0 && failed.meetings && (
                <p className="text-[12px] text-text-3">모임 목록을 지금 불러오지 못했어요.</p>
              )}
              {reports.length > 0 && (
                <ul className="mt-0.5 flex flex-col gap-1 border-t border-divider pt-2">
                  {reports.map((r) => (
                    <li key={r.id}>
                      {/* 리포트 1건을 여는 페이지는 아직 없다 — 그래서 목록이
                          있는 자리(#reports 앵커)로 보낸다. 예전엔 맨
                          `/town/library` 였고, 그 페이지는 표를 읽지도 않은 채
                          "유료·단지 리포트는 아직 없어요"를 하드코딩으로 띄우고
                          있었다. 홈은 제목·가격을 보여 주는데 눌러서 간 곳은
                          없다고 말하는 상태였다(지금은 그 페이지도 읽는다). */}
                      <Link
                        href="/town/library#reports"
                        className="flex justify-between gap-2 text-[12px] no-underline hover:text-primary"
                      >
                        <span className="truncate font-semibold text-text-1">{r.title}</span>
                        <span className="shrink-0 text-text-3">{r.priceLabel}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* P1-10: AdSense 점선 플레이스홀더는 제거된 상태 유지 — 광고 미송출 시 아무것도
                렌더하지 않는다. (외부 실광고는 layout의 AdSenseLoader Auto ads가 담당)
                H3: 여기 슬롯은 어드민 등록 배너 → 하우스 광고 순으로 채우고, 둘 다 없으면
                역시 아무것도 그리지 않는다. seed 를 모바일(0)과 다르게 줘서 같은 방문에
                같은 문구가 두 번 잡히지 않도록 한다. */}
            <AdSlot placement="home_feed" seed={1} plan={null} className="rise-in-4" />
            {/* 애드센스 데스크탑 유닛 — 사이드바 말미(콘텐츠 아래 빈공간).
                키·슬롯 미설정/광고 없는 플랜이면 아무것도 렌더하지 않는다. */}
            <AdSenseUnit />
          </aside>
          </div>
        </section>
      </main>

      {/* P0-3: 공통 푸터 컴포넌트 — 사업자 고지·약관 링크·면책, 모바일 포함 */}
      <Footer />

      <TabBar />

      {/* 클로즈 베타 안내 — 30일에 한 번, 쿠키 동의 배너가 걷힌 뒤에만 뜬다 */}
      <BetaNoticeModal />
    </>
  );
}
