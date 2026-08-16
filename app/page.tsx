import Link from "next/link";
import { Header } from "./components/Header";
import { Icon } from "./components/Icon";
import { TabBar } from "./components/TabBar";
import { AIPanel } from "./components/AIPanel";
import { PersonalHome } from "./components/PersonalHome";
import { EmptyState, ErrorState } from "./components/ui/EmptyState";
import { JourneyBanner } from "./components/JourneyBanner";
import { MarketTempWidget } from "./components/MarketTempWidget";
import { BetaNoticeModal } from "./components/BetaNoticeModal";
import { HomeMiniMap } from "./components/HomeMiniMap";
import { AdSlot } from "./components/ads/AdSlot";
import { AdSenseUnit } from "./components/ads/AdSenseUnit";
import { Footer } from "./components/Footer";
import { loadNewHomeData } from "@/lib/newui/home-data";
import { compactDelta } from "@/lib/newui/delta-label";
import { formatAsOfLabel } from "@/lib/newui/as-of-label";
import { getBaseRate } from "@/lib/market/base-rate";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { getWeeklyDigest } from "@/lib/newui/digest";
import { logger } from "@/lib/log";
import type { Metadata } from "next";
import type { DeltaTone, HomeBriefing } from "@/lib/newui/home-data";
import {
  HOME_AI_BRIEFING_LABEL,
  HOME_AI_GATEWAY_BODY,
  HOME_AI_GATEWAY_TITLE,
  HOME_CTA_AI,
  HOME_CTA_MAP,
  HOME_CTA_NOTE,
  HOME_FUNNEL_STEPS,
  HOME_HERO_BADGE,
  HOME_HERO_DESKTOP_EMPHASIS,
  HOME_HERO_DESKTOP_LEAD,
  HOME_HERO_DESKTOP_TAIL,
  HOME_HERO_MOBILE_EMPHASIS,
  HOME_HERO_MOBILE_LINE1,
  HOME_HERO_MOBILE_TAIL,
  HOME_HERO_SUBLINE,
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

/* 실거래 분석 도구 진입 — 데스크탑 3열 스트립·모바일 컴팩트 스트립이 공유.
   전부 실데이터 연동 도구(#380·#381·타이밍)인데 모바일에서는 "더 알아보기"의
   글자 링크 하나뿐이라 사실상 아는 사람만 썼다. */
const ANALYSIS_TOOLS = [
  {
    href: "/analysis/price",
    icon: "bar",
    t: "면적대별 실거래",
    short: "면적대 실거래",
    d: "평단가·지역 분위",
  },
  {
    href: "/analysis/timing",
    icon: "trending-up",
    t: "시세·타이밍",
    short: "시세 타이밍",
    d: "12개월 추세·온도",
  },
  {
    href: "/analysis/scenario",
    icon: "calculator",
    t: "대출 시나리오",
    short: "대출 시나리오",
    d: "실금리 DSR·스트레스",
  },
] as const;

/* G10 / 사실 우선: 여기 있던 5개 예시 폴백을 삭제했다.
   - MOCK_REGIONS: "강남구 32.5억 ▼4.2%" — 실존 자치구에 지어낸 시세·변동률
   - MOCK_NOTES:   "공작아파트 302동 78점" — 존재하지 않는 노트(클릭 시 죽은 링크)
   - MOCK_POSTS:   "청년 82.6% 세입자 시대…" — 지어낸 통계가 박힌 가짜 헤드라인
   - MOCK_MEETINGS:"과천지식정보타운 · 토 10:00 · 4/6" — 실제 장소약 없는 모임(사람이 나갈 수 있다)
   - MOCK_REPORTS: "관양동 재건축 흐름 분석 · 9,900원" — 팔지 않는 상품
   "예시" 배지를 붙여도 홈 첫 화면에서는 실데이터와 같은 카드 모양으로 읽힌다.
   데이터가 없으면 없다고 말하고, 채우는 행동(CTA)으로 안내한다. */

const deltaClass: Record<DeltaTone, string> = {
  down: "delta-down",
  up: "delta-up",
  flat: "delta-flat",
};

/** 기록 → AI → 지도 단계 하이라이트 (네비 아님) */
function FunnelSteps({ className = "" }: { className?: string }) {
  return (
    <ol
      className={`flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold text-text-3 ${className}`}
      aria-label="서비스 흐름"
    >
      {HOME_FUNNEL_STEPS.map((step, i) => (
        <li key={step} className="flex items-center gap-1.5">
          {i > 0 && <span className="font-semibold text-line" aria-hidden>→</span>}
          <span className="rounded-full bg-[rgba(29,79,216,.08)] px-2.5 py-1 text-primary">
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** AI 시작 행동 + 시장 브리핑(참고) 강등 */
function HomeAiGateway({ briefing }: { briefing: HomeBriefing | null }) {
  return (
    <AIPanel
      title={HOME_AI_GATEWAY_TITLE}
      cta={{ href: HOME_CTA_AI.href, label: HOME_CTA_AI.label }}
    >
      <p className="m-0">{HOME_AI_GATEWAY_BODY}</p>
      <div className="mt-2 border-t border-white/15 pt-2">
        <div className="mb-1 text-[10px] font-extrabold tracking-wide text-ai-muted">
          {HOME_AI_BRIEFING_LABEL}
        </div>
        {briefing ? (
          <>
            {briefing.text}
            <span className="ml-1.5 inline-flex items-center rounded border border-white/20 px-1 py-px align-middle text-[9px] font-semibold text-ai-muted">
              {briefing.asOfLabel}
            </span>
          </>
        ) : (
          <>오늘 브리핑을 아직 만들지 못했어요. 실거래 데이터가 갱신되면 표시됩니다.</>
        )}
      </div>
    </AIPanel>
  );
}

/** 시세 KPI — 히어로 밖 얇은 스트립 (포털 티커처럼 주인공 되지 않게) */
function MarketStrip({
  saleIndexSeoul,
  baseRate,
  loanRate,
  publicNotes,
  activityToday,
  marketAsOf,
  baseRateAsOf,
  loanRateAsOf,
  compact,
}: {
  saleIndexSeoul: string;
  baseRate: string;
  /**
   * 금감원 월 공시 주담대 최저금리. **null 이면 이 칸을 아예 그리지 않는다.**
   *
   * 다른 지표처럼 페이지 쪽에서 미리 "—" 로 바꿔 넘기면, 여기서는 "못 구한 값"과
   * "정말 그렇게 생긴 값"을 구분할 수 없다. 자리를 뺄지 말지를 이 컴포넌트가
   * 판단해야 하므로 null 을 null 그대로 받는다.
   */
  loanRate: string | null;
  /** 누적 공개 임장노트 수(예: "12건"). "오늘 새 노트"는 활동 적은 날 구조적으로
   *  0이라 신규 방문자에게 빈 사이트 인상을 줘서, 의미 있는 누적 실카운트로 바꿨다. */
  publicNotes: string;
  activityToday: string;
  /** 실거래 적재 기준일 "2026.08.05" — 없으면 그 조각을 빼고 쓴다 */
  marketAsOf: string | null;
  /** 한국은행 기준금리 기준시점 "2026.08.04" */
  baseRateAsOf: string | null;
  /** 금감원 대출금리 공시 기준시점 "2026.06" */
  loanRateAsOf: string | null;
  compact?: boolean;
}) {
  /* 기준시점 캡션. 숫자마다 출처와 주기가 달라 하나의 날짜로 묶을 수 없다 —
     그래서 있는 것만 각각 이름 붙여 나열하고, 못 구한 건 아예 안 쓴다.
     (이 스트립은 [data-static-hero] 가 아니다. 히어로에 있던 기준시점 줄은
      로그인하면 히어로째로 숨어서, 모바일 로그인 사용자에게는 기준시점 없는
      숫자만 남아 있었다. 캡션이 숫자 옆에 붙어 있어야 하는 이유다.) */
  const asOfParts = [
    marketAsOf ? `매매지수 ${marketAsOf}` : null,
    baseRateAsOf ? `기준금리 ${baseRateAsOf}` : null,
    loanRateAsOf ? `대출금리 ${loanRateAsOf}` : null,
  ].filter((s): s is string => s !== null);
  const asOfCaption = asOfParts.length > 0 ? `${asOfParts.join(" · ")} 기준` : null;

  /* 대출금리는 금감원 월 공시(finlife)에 붙어야 나오는 값인데, 운영에 발급키가
     아직 없어서 **여태 한 번도 값이 있었던 적이 없다**(오늘 실측: 모바일 카드
     "대출금리 —", 데스크톱 "기준 / 대출금리 = 2.75% / —"). 게다가 모바일에서는
     그 영구 빈칸이 세 장 중 **유일하게 강조색이 칠해진 카드**였다 — 화면에서
     제일 눈에 띄는 자리가 계속 비어 있었던 셈이다.

     배치 4에서 기준시점 캡션에 세운 규칙을 그대로 적용한다: **값이 없으면
     자리를 남기지 않는다.** 없는 걸 "—" 로 계속 보여 주는 건 정직하긴 해도,
     고칠 수 없는 빈칸을 매일 보여 주는 것과 같다. 공시키가 들어오면 값과 함께
     자리도 저절로 돌아온다(이 분기는 데이터만 보고 갈린다). */
  const loanRateLabel = loanRate;

  /* "미조회 항목은 —로 표시됩니다" 는 **실제로 — 가 있을 때만** 쓴다.
     항상 붙어 있으면 아무도 안 읽는 상용구가 되고, 정작 뭔가를 못 읽은 날에도
     평소와 똑같아 보여서 신호 구실을 못 한다. */
  const legend = "미조회 항목은 “—”로 표시됩니다";

  if (compact) {
    const cards = [
      { label: "매매지수 서울", value: saleIndexSeoul, accent: false },
      { label: "기준금리", value: baseRate, accent: false },
      ...(loanRateLabel !== null
        ? [{ label: "대출금리", value: loanRateLabel, accent: true }]
        : []),
    ];
    const hasMissing = cards.some((c) => c.value === "—");
    const caption = [asOfCaption, hasMissing ? legend : null]
      .filter((s): s is string => s !== null)
      .join(" · ");
    return (
      <div className="flex flex-col gap-1.5">
        <h2 className="sr-only">주요 지표</h2>
        <div className="flex gap-2">
          {cards.map((s) => (
            /* 최적화 4 — 모바일 KPI 3장 밀도: 패딩·숫자 1단계 축소(라벨 유지) */
            <div key={s.label} className="glass min-w-0 flex-1 rounded-[13px] px-2.5 py-2">
              <div className="whitespace-nowrap text-[11px] text-text-3">{s.label}</div>
              <div className={`t-num text-[15px] ${s.accent ? "text-primary" : "text-ink"}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
        {caption ? (
          <p className="text-[10px] leading-[1.5] text-text-3">{caption}</p>
        ) : null}
      </div>
    );
  }

  /* 데스크톱은 칸 수(4)를 유지한다 — 대출금리를 못 구했을 때 칸을 지우는 게
     아니라 **라벨과 값에서 그 조각만 뺀다**. "기준 / 대출금리 = 2.75% / —" 가
     "기준금리 = 2.75%" 가 되는 것이고, 그리드가 3칸으로 무너지지 않는다. */
  const rateCell = loanRateLabel !== null
    ? {
        label: "기준 / 대출금리",
        value: (
          <>
            {baseRate} / <span className="text-primary">{loanRateLabel}</span>
          </>
        ),
      }
    : { label: "기준금리", value: <>{baseRate}</> };

  /* loanRateLabel 은 이 목록에 넣지 않는다 — 방어적으로 보이지만 **절대 안 걸리는
     조건**이다. home-data.ts:520-530 을 따라가 보면 이 값은 `null` 이거나
     `"2.98%"` 꼴이지 "—" 가 되는 경로가 없다. 걸릴 리 없는 조건을 남겨 두면
     다음에 읽는 사람이 "대출금리가 —일 때도 안내가 뜬다" 고 믿는다. */
  const desktopMissing = [saleIndexSeoul, baseRate, publicNotes, activityToday].includes("—");
  const desktopCaption = [asOfCaption, desktopMissing ? legend : null]
    .filter((s): s is string => s !== null)
    .join(" · ");

  return (
    <div className="flex w-full flex-col gap-1.5">
      <h2 className="sr-only">주요 지표</h2>
      <div className="grid w-full grid-cols-2 gap-2.5 xl:grid-cols-4">
        {[
          { label: "매매지수 서울", value: <>{saleIndexSeoul}</>, accent: false },
          { ...rateCell, accent: false },
          {
            label: "공개 임장노트",
            value: <span className="text-primary">{publicNotes}</span>,
            accent: true,
          },
          {
            label: "오늘 활동",
            value: <>{activityToday}</>,
            accent: true,
          },
        ].map((s, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[rgba(255,255,255,.7)] bg-white/70 px-4 py-3 backdrop-blur-sm"
          >
            <div className="text-[10px] text-text-3">{s.label}</div>
            <div className="t-num mt-0.5 text-[15px] text-ink">{s.value}</div>
          </div>
        ))}
      </div>
      {desktopCaption ? (
        <p className="text-[10px] leading-[1.5] text-text-3">{desktopCaption}</p>
      ) : null}
    </div>
  );
}

export default async function Home() {
  /* 4개 조회는 서로 의존이 없다 — 직렬로 기다리면 콜드/만료 렌더가 네 조회의
     시간을 전부 합산해 지불한다(`/` 는 300초 타임아웃 목록의 최상단이었다).
     한 Promise.all 로 임계 경로를 가장 느린 하나로 줄인다. */
  const [data, freshness, digest, baseRateData] = await Promise.all([
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
  const posts = data.posts;
  const meetings = data.meetings;
  const reports = data.reports;
  /* 빈 배열이 "아직 없음"인지 "조회 실패"인지 구분하는 값.
     이게 없던 시절에는 DB 가 잠깐 죽으면 홈이 "아직 올라온 글이 없어요"라고
     말했다 — 글은 있는데. 조회 실패는 데이터 없음이 아니다. */
  const failed = data.failed;

  // 사실 기반 원칙: 실데이터 없는 수치는 허위 값 대신 "—" 표기
  const saleIndexSeoul = data.saleIndexSeoul ?? "—";
  /* 여기서 "—" 로 바꾸지 않는다 — MarketStrip 이 "칸을 뺄지"를 정해야 해서
     null 을 그대로 넘긴다. 사유는 MarketStrip 의 loanRate prop 주석. */
  const loanRate = data.loanRate;
  const publicNotes = data.publicNotesTotal !== null ? `${data.publicNotesTotal}건` : "—";
  const baseRate = baseRateData?.label ?? "—";
  /* "명"이 아니라 "건". 이 숫자는 사람 수가 아니라 오늘 일어난 행위 이벤트
     수다 — 사람으로 셀 수 없는 이유는 lib/newui/home-data.ts 의
     loadActivityToday() 주석에 실측과 함께 적어 두었다. */
  const activityToday = data.activityToday !== null ? `${data.activityToday}건` : "—";
  /* 지표 3종의 기준시점. 여태 화면에 한 번도 나온 적이 없었다 —
     getBaseRate() 는 cycle 을 읽어 오고도 버렸고(오늘 실측: 2026-08-04),
     대출금리는 월 공시(2026-06)라 두 값이 두 달 차이 나는데도 "기준 / 대출금리"
     한 칸에 붙어 같은 시점처럼 읽혔다. */
  const baseRateAsOf = formatAsOfLabel(baseRateData?.cycle ?? null);
  const loanRateAsOf = formatAsOfLabel(data.loanRateAsOf);

  // 홈 미니지도 마커용 시세 지역 (좌표 매핑은 HomeMiniMap 내부) — 실데이터만 마커로 표시
  const mapRegions = regions.slice(0, 4);

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

        {/* S13-13a 홈 이원화 — 로그인 시에만 개인화 섹션 렌더 + 아래 정적 히어로(data-static-hero) 숨김 */}
        <PersonalHome />

        {/* ================= 모바일 히어로 — 한 직업: 임장→AI→지도 ================= */}
        <section className="flex flex-col gap-2.5 md:hidden">
          {/* 시각 카피(문서 제목 아님 — 위 sr-only h1 참고) */}
          <p
            data-static-hero
            className="rise-in mt-2 text-[24px] font-extrabold leading-[1.25] tracking-[-0.6px] text-ink"
          >
            {HOME_HERO_MOBILE_LINE1}
            <br />
            <span className="text-gradient">{HOME_HERO_MOBILE_EMPHASIS}</span>
            {HOME_HERO_MOBILE_TAIL}
          </p>
          <p data-static-hero className="rise-in-1 text-sm text-text-2">
            {HOME_HERO_SUBLINE}
          </p>
          {/* 고도화 7 — 첫 화면에 오늘의 실데이터 한 줄. 값이 있을 때만 그린다
              (조회 실패 시 이 줄 자체가 없다 — 낡은 날짜를 지어내지 않는다). */}
          {freshness && (
            <p data-static-hero className="rise-in-1 text-[11px] text-text-3">
              실거래 데이터 {freshness} 기준 · 국토교통부 신고분
            </p>
          )}
          {/* 모바일 실측 14 — 히어로 부제("3분 기록 → AI 정리 → 지도 비교")와
              같은 3단계를 칩으로 한 번 더 그려 첫 화면이 같은 말을 두 번 했다.
              모바일에서는 칩 행을 내리고 부제와 아래 여정 배너가 역할을 나눈다. */}
          <Link
            href={HOME_CTA_NOTE.href}
            data-static-hero
            className="btn-primary glow press rise-in-2 rounded-xl p-3 text-center text-[15px] md:rounded-2xl md:p-[15px] md:text-base"
          >
            {HOME_CTA_NOTE.label}
          </Link>
          <div data-static-hero className="rise-in-3 flex gap-2">
            <Link
              href={HOME_CTA_MAP.href}
              className="glass press flex-1 rounded-xl p-[11px] text-center text-[13px] font-bold text-text-1"
            >
              {HOME_CTA_MAP.label}
            </Link>
            <Link
              href={HOME_CTA_AI.href}
              className="press flex-1 rounded-xl bg-[rgba(29,79,216,.1)] p-[11px] text-center text-[13px] font-bold text-primary"
            >
              {HOME_CTA_AI.label}
            </Link>
          </div>

          {/* 관심지역 실지도 — 루프 증명(비교) */}
          <div className="rise-in-4">
            <HomeMiniMap regions={mapRegions} className="h-[208px]" />
          </div>

          {/* 스크롤 1단 이후: 여정·시세·피드 (첫 CTA 희석 방지) */}
          <div data-reveal="">
            <JourneyBanner />
          </div>

          <div data-reveal="">
            <MarketStrip
              compact
              saleIndexSeoul={saleIndexSeoul}
              baseRate={baseRate}
              loanRate={loanRate}
              publicNotes={publicNotes}
              activityToday={activityToday}
              marketAsOf={freshness}
              baseRateAsOf={baseRateAsOf}
              loanRateAsOf={loanRateAsOf}
            />
          </div>

          {/* 고도화 9 — 주간 시장 온도 요약 (실측 스냅샷 · 실패/기록 없음이면 미렌더) */}
          <div data-reveal="">
            <MarketTempWidget />
          </div>

          {/* 실거래 분석 도구 — 데스크탑에만 있던 진입문을 모바일에도.
              시세 지표(위) 바로 다음 자리: 숫자를 본 김에 도구로 더 파게 한다. */}
          <div data-reveal="" className="grid grid-cols-3 gap-2">
            <h2 className="sr-only">실거래 분석 도구</h2>
            {ANALYSIS_TOOLS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="card press flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center no-underline"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Icon name={t.icon} size={15} />
                </span>
                <span className="text-[11px] font-bold leading-tight text-ink">{t.short}</span>
              </Link>
            ))}
          </div>

          {/* 공개 노트 증거 (모바일) */}
          <div data-reveal="" className="card flex flex-col gap-2 rounded-2xl px-4 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-ink">공개 임장노트</h2>
              <Link
                href="/notes"
                className="text-[11px] text-text-3 transition-colors hover:text-primary"
              >
                더보기
              </Link>
            </div>
            {notes.length === 0 ? (
              failed.notes ? (
                <p className="text-xs text-text-3">목록을 지금 불러오지 못했어요.</p>
              ) : (
                <EmptyState
                  icon="notebook-pen"
                  title="아직 공개된 임장노트가 없어요"
                  desc="첫 노트를 남기면 여기에 소개됩니다."
                  action={{ label: "임장노트 쓰기", href: "/notes/new" }}
                />
              )
            ) : (
              notes.map((n, i) => (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className={`flex items-center justify-between gap-3 py-[7px] text-xs no-underline ${
                    i < notes.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <span className="truncate font-semibold text-text-1">{n.title}</span>
                  <span
                    className={`shrink-0 font-extrabold ${n.hot ? "text-primary" : "text-text-3"}`}
                  >
                    {n.score}
                  </span>
                </Link>
              ))
            )}
          </div>

          <div data-reveal="">
            <HomeAiGateway briefing={data.briefing} />
          </div>

          <div data-reveal="" className="flex flex-col gap-3">
            <h2 className="sr-only">지역 시세</h2>
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
                  className="card card-hover flex items-center justify-between rounded-2xl px-4 py-3.5"
                >
                  <div>
                    <div className="text-sm font-bold text-ink">{r.name}</div>
                    <div className="text-xs text-text-3">{r.meta}</div>
                  </div>
                  <div className="text-right">
                    <div className="t-num text-base text-ink">{r.price}</div>
                    <div className={`text-xs ${deltaClass[r.tone]}`}>{r.delta}</div>
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
              className="flex items-center justify-between gap-2 py-1.5 text-xs no-underline"
            >
              <span className="min-w-0">
                <span className="block font-bold text-text-1">
                  주간 다이제스트{digestWeekLabel ? ` · ${digestWeekLabel}` : ""}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-text-3">
                  {digestTeaser}
                </span>
              </span>
              <span className="shrink-0 font-extrabold text-primary">›</span>
            </Link>
            {/* 분석 도구 행은 위 컴팩트 스트립 신설로 중복이 돼 자료실로 교체 —
                크리에이터 판매 루프(유료 리포트)의 홈 발견 경로가 없었다. */}
            <Link
              href="/town/library"
              className="flex justify-between py-1.5 text-xs font-semibold text-text-1 no-underline"
            >
              자료실 · 임장 리포트 <span className="text-primary">›</span>
            </Link>
            <Link
              href="/town/groups"
              className="flex justify-between py-1.5 text-xs font-semibold text-text-1 no-underline"
            >
              임장 모임 <span className="text-primary">›</span>
            </Link>
            <Link
              href="/safety"
              className="flex justify-between py-1.5 text-xs font-semibold text-text-1 no-underline"
            >
              전세 안전 진단 <span className="text-primary">›</span>
            </Link>
            <Link
              href="/town"
              className="flex justify-between py-1.5 text-xs font-semibold text-text-1 no-underline"
            >
              동네이야기 <span className="text-primary">›</span>
            </Link>
          </div>

          {/* H3 광고 슬롯 — 등록 배너 없으면 하우스 광고, 그것도 없으면 아무것도 안 그림.
              이 페이지는 revalidate=300 공유 캐시라 보는 사람의 플랜을 알 수 없다.
              그래서 plan={null} — 특정 플랜 겨냥 배너는 여기서 제외되고, 유료 플랜의
              광고 제거는 AdSlot 안의 AdFreeGate 가 클라이언트에서 처리한다(캐시 유지). */}
          <AdSlot placement="home_feed" seed={0} plan={null} />
        </section>

        {/* ================= 데스크탑 홈 ================= */}
        <section className="hidden grid-cols-1 gap-4 md:grid lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-4">
            {/* 히어로 — KPI 제거, CTA 3종 + 루프 증명 */}
            <div
              data-static-hero
              className="rise-in bento bento-tint sheen flex flex-col items-start justify-between gap-6 px-7 py-7 xl:flex-row xl:items-center"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex flex-col gap-3">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[rgba(29,79,216,.08)] px-3 py-1 text-[11px] font-extrabold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary float-slow" />{" "}
                  {HOME_HERO_BADGE}
                </span>
                {/* 시각 카피(문서 제목 아님 — 위 sr-only h1 참고) */}
                <p className="text-[30px] font-extrabold leading-[1.22] tracking-[-0.6px] text-ink">
                  {HOME_HERO_DESKTOP_LEAD}{" "}
                  <span className="text-gradient">{HOME_HERO_DESKTOP_EMPHASIS}</span>
                  {HOME_HERO_DESKTOP_TAIL}
                </p>
                <p className="text-sm text-text-2">{HOME_HERO_SUBLINE}</p>
                <FunnelSteps />
                <div className="mt-1 flex flex-wrap gap-2">
                  <Link
                    href={HOME_CTA_NOTE.href}
                    className="btn-primary btn-cta press rounded-xl px-5 py-2.5 text-[13px]"
                  >
                    {HOME_CTA_NOTE.label}
                  </Link>
                  <Link
                    href={HOME_CTA_MAP.href}
                    className="btn-ghost press rounded-xl px-5 py-2.5 text-[13px]"
                  >
                    {HOME_CTA_MAP.label}
                  </Link>
                  <Link
                    href={HOME_CTA_AI.href}
                    className="press rounded-xl bg-[rgba(29,79,216,.1)] px-5 py-2.5 text-[13px] font-bold text-primary"
                  >
                    {HOME_CTA_AI.label}
                  </Link>
                </div>
              </div>
              <div className="w-full shrink-0 xl:w-[340px]">
                <HomeMiniMap regions={mapRegions} className="h-[200px]" />
              </div>
            </div>

            <div className="rise-in-1">
              <MarketStrip
                saleIndexSeoul={saleIndexSeoul}
                baseRate={baseRate}
                loanRate={loanRate}
                publicNotes={publicNotes}
                activityToday={activityToday}
                marketAsOf={freshness}
                baseRateAsOf={baseRateAsOf}
                loanRateAsOf={loanRateAsOf}
              />
            </div>

            <div className="rise-in-1">
              <JourneyBanner />
            </div>

            {/* 실거래 분석 도구 진입 — 리밸런싱: 기록(노트) 다음의 두 번째
                가치인 '검증(분석)'을 첫 화면에 노출한다. 아이콘 칩으로 텍스트만
                있던 카드에 시각 앵커를 준다(항목 정의는 ANALYSIS_TOOLS). */}
            <div className="rise-in-1 grid grid-cols-3 gap-3">
              {ANALYSIS_TOOLS.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className="card card-hover flex items-center gap-3 rounded-2xl px-4 py-3 no-underline"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Icon name={t.icon} size={17} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] font-extrabold text-ink">{t.t}</span>
                    <span className="truncate text-[11px] text-text-3">{t.d}</span>
                  </span>
                </Link>
              ))}
            </div>

            {/* 공개 노트 · 동네이야기 — 행 클릭 가능 (증거) */}
            <div data-reveal="" className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="card card-hover flex flex-col gap-2 rounded-2xl px-5 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="accent-underline text-sm font-extrabold text-ink">
                    공개 임장노트
                  </h2>
                  <Link
                    href="/notes"
                    className="text-[11px] text-text-3 transition-colors hover:text-primary"
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
                      action={{ label: "임장노트 쓰기", href: "/notes/new" }}
                    />
                  )
                ) : (
                  notes.map((n, i) => (
                    <Link
                      key={n.id}
                      href={`/notes/${n.id}`}
                      className={`flex items-center justify-between gap-3 py-[7px] text-xs no-underline transition-colors hover:text-primary ${
                        i < notes.length - 1 ? "border-b border-[#f0f3f8]" : ""
                      }`}
                    >
                      <span className="truncate font-semibold text-text-1">{n.title}</span>
                      <span
                        className={`shrink-0 font-extrabold ${n.hot ? "text-primary" : "text-text-3"}`}
                      >
                        {n.score}
                      </span>
                    </Link>
                  ))
                )}
              </div>
              <div className="card card-hover flex flex-col gap-2 rounded-2xl px-5 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="accent-underline text-sm font-extrabold text-ink">
                    동네이야기 · 자료
                  </h2>
                  <Link
                    href="/town"
                    className="text-[11px] text-text-3 transition-colors hover:text-primary"
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
                  ) : (
                    <EmptyState
                      icon="messages-square"
                      title="아직 올라온 글이 없어요"
                      desc="동네 이야기를 먼저 시작해 보세요."
                      action={{ label: "글쓰기", href: "/town/write" }}
                    />
                  )
                ) : (
                  posts.map((p, i) => (
                    <Link
                      key={p.id}
                      href={`/town/news/${p.id}`}
                      className={`py-[7px] text-xs font-semibold text-text-1 no-underline transition-colors hover:text-primary ${
                        i < posts.length - 1 ? "border-b border-[#f0f3f8]" : ""
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
            <h2 className="sr-only">지역 시세</h2>
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
              <div className="rise-in-2 grid grid-cols-2 gap-3 xl:grid-cols-4">
                {regions.slice(0, 4).map((r) => (
                  <div key={r.id} className="card card-hover rounded-2xl px-4 py-4">
                    <div className="text-xs text-text-3">
                      {r.name} · {r.meta.split("· ")[1] ?? r.meta}
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="t-num text-[19px] text-ink">{r.price}</span>
                      <span className={`text-[11px] ${deltaClass[r.tone]}`}>
                        {compactDelta(r.delta)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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
          <aside className="flex flex-col gap-3 lg:sticky lg:top-[76px] lg:self-start">
            <div className="rise-in-1">
              <HomeAiGateway briefing={data.briefing} />
            </div>

            {/* 고도화 9 — 주간 시장 온도 요약 (실측 스냅샷 · 실패/기록 없음이면 미렌더) */}
            <div className="rise-in-1">
              <MarketTempWidget />
            </div>

            <div className="rise-in-2 card flex flex-col gap-2 rounded-2xl px-5 py-4">
              <h2 className="accent-underline text-[13px] font-extrabold text-ink">
                더 알아보기
              </h2>
              <Link
                href="/digest"
                className="flex flex-col gap-0.5 py-1.5 no-underline"
              >
                <span className="flex items-center justify-between text-xs font-bold text-text-1">
                  주간 다이제스트{digestWeekLabel ? ` · ${digestWeekLabel}` : ""}
                  <span className="text-primary">›</span>
                </span>
                <span className="truncate text-[11px] text-text-3">{digestTeaser}</span>
              </Link>
              <Link
                href="/safety"
                className="flex justify-between py-1.5 text-xs font-semibold text-text-1 no-underline"
              >
                전세 안전 진단
                <span className="text-primary">›</span>
              </Link>
              <Link
                href="/town/experts"
                className="flex justify-between py-1.5 text-xs font-semibold text-text-1 no-underline"
              >
                전문가 찾아보기
                <span className="text-primary">›</span>
              </Link>
              {/* 자료실 — 유료 리포트 판매 루프의 홈 발견 경로 (전에는 없었다) */}
              <Link
                href="/town/library"
                className="flex justify-between py-1.5 text-xs font-semibold text-text-1 no-underline"
              >
                자료실 · 임장 리포트
                <span className="text-primary">›</span>
              </Link>
              <Link
                href="/town/groups"
                className="flex justify-between py-1.5 text-xs font-semibold text-text-1 no-underline"
              >
                임장 모임
                <span className="text-primary">›</span>
              </Link>
              {meetings.length > 0 && (
                <ul className="mt-0.5 flex flex-col gap-1 border-t border-[#f0f3f8] pt-2">
                  {meetings.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/town/groups/${m.id}`}
                        className="block truncate text-[11px] text-text-3 no-underline hover:text-primary"
                      >
                        {m.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {meetings.length === 0 && failed.meetings && (
                <p className="text-[11px] text-text-3">모임 목록을 지금 불러오지 못했어요.</p>
              )}
              {reports.length > 0 && (
                <ul className="mt-0.5 flex flex-col gap-1 border-t border-[#f0f3f8] pt-2">
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
                        className="flex justify-between gap-2 text-[11px] no-underline hover:text-primary"
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
