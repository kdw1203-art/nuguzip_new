/**
 * 새 디자인 홈(`app/page.tsx`) 전용 데이터 헬퍼.
 *
 * 구 코드베이스의 서버 함수를 그대로 사용한다:
 * - `loadHomeData()`            → 동네이야기 게시글·모임·리포트·통계 (lib/landing/data)
 * - `getAllRegionSnapshots()`   → 지역 시세 카드 (market_region_price, lib/market/store)
 * - `market_price_indices`      → 매매가격지수(REB 서울, 직접 select — 읽기 전용)
 * - `getRegionSeries()`         → 매매가격지수 폴백 (market_region_series, lib/market/store)
 * - `market_region_monthly`     → AI 시장 브리핑 (최근 월 등락 집계, 1시간 캐시)
 * - `platform_activity_events`  → 오늘 활동 건수(KST 오늘, 계측 이벤트 제외)
 * - `listPublicNoteCards()`     → 공개 임장노트 (inspection_notes, 카드 컬럼만 — 본문 제외)
 * - `getMortgageRates()`        → 주담대 금리 (금융감독원 finlife, lib/finance/mortgage-rates)
 *
 * 모든 조회는 실패/빈 데이터 시 null·빈 배열을 반환하고, 페이지 쪽에서
 * 기존 목업 값으로 폴백한다. DB 쓰기 없음.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { loadHomeData, type HomeData, EMPTY_HOME_DATA } from "@/lib/landing/data";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getAllRegionSnapshots, getRegionSeries } from "@/lib/market/store";
import type { RegionMarketSnapshot } from "@/lib/market/types";
import {
  listPublicNoteCards,
  inspectionAverageScore,
  type PublicNoteCard,
} from "@/lib/inspection/store-db";
import { getMortgageRates } from "@/lib/finance/mortgage-rates";
import { DELTA_UNKNOWN } from "@/lib/newui/delta-label";
import { logger } from "@/lib/log";

export type DeltaTone = "up" | "down" | "flat";

export interface HomeRegionCard {
  id: string;
  name: string;
  /** 예: "서울 · 37건" */
  meta: string;
  /** 예: "32.5억" */
  price: string;
  /** 예: "▼ 4.2%" */
  delta: string;
  tone: DeltaTone;
}

export interface HomeNoteItem {
  id: string;
  title: string;
  /** 예: "78점" */
  score: string;
  hot: boolean;
}

export interface HomePostItem {
  id: string;
  rank: number;
  title: string;
  comments: number;
}

export interface HomeMeetingItem {
  id: string;
  /** 예: "과천지식정보타운 · 07/26(토) · 4/6" */
  label: string;
}

export interface HomeReportItem {
  id: string;
  title: string;
  /** 예: "9,900원" */
  priceLabel: string;
}

export interface HomeBriefing {
  /** 예: "서울 주요 구 6곳 중 4곳 하락, 평균 ▼4.9%" */
  text: string;
  /** 예: "기준일 2026.07" */
  asOfLabel: string;
}

export interface NewHomeData {
  /** 최신 서울(강남 대표) 매매가격지수 — 데이터 없으면 null */
  saleIndexSeoul: string | null;
  /** 은행권 변동금리 하단 (예: "3.62%") — 실공시 아닐 때 null */
  loanRate: string | null;
  /**
   * 위 loanRate 의 **공시 기준시점**(금감원 finlife `dcls_month`, "YYYY-MM").
   * loanRate 가 null 이면 같이 null 이다 — 값 없는 기준시점은 남기지 않는다.
   * 화면에서 이 값이 필요한 이유: 옆 칸의 기준금리는 일 단위(예: 2026.08.04)로
   * 갱신되는데 이 금리는 월 공시라, 둘을 나란히 놓으면 두 달 차이 나는 숫자가
   * 같은 시점처럼 읽힌다.
   */
  loanRateAsOf: string | null;
  /** KST 오늘 등록된 공개 임장노트 수(정확 카운트) — 조회 실패 시 null */
  notesToday: number | null;
  /**
   * 누적 공개 임장노트 수 — 홈 지표 카드용. "오늘 새 노트"(notesToday)는 활동이
   * 적은 날 구조적으로 0이라 신규 방문자에게 "빈 사이트" 인상을 준다(제품 리뷰
   * 실측). 누적 공개 노트 수는 같은 사실 위에서 더 의미 있는 값이며 0이 아니다.
   * 지어낸 수가 아니라 실카운트다 — 조회 실패 시 null.
   */
  publicNotesTotal: number | null;
  /** AI 시장 브리핑 — market_region_monthly 최근 등락 기반, 생성 불가 시 null */
  briefing: HomeBriefing | null;
  /**
   * KST 오늘의 행위 이벤트 수(계측 전용 이벤트 제외) — 조회 실패 시 null.
   * **사람 수가 아니다.** 왜 사람으로 세지 않는지는 loadActivityToday() 주석 참고.
   */
  activityToday: number | null;
  regions: HomeRegionCard[];
  notes: HomeNoteItem[];
  posts: HomePostItem[];
  meetings: HomeMeetingItem[];
  reports: HomeReportItem[];
  /**
   * 조회 자체가 실패한 섹션. 빈 배열이 "아직 없음"인지 "못 불러옴"인지는
   * 배열만 봐서는 구분이 안 된다 — 화면이 둘을 다르게 말하려면 이 값이 필요하다.
   * 예전에는 전부 `.catch(() => [])` 라, DB 가 죽으면 홈이 "아직 올라온 글이
   * 없어요"라고 말했다. 글은 있는데 그렇게 말한 것이다.
   */
  failed: {
    regions: boolean;
    notes: boolean;
    posts: boolean;
    meetings: boolean;
    reports: boolean;
  };
}

export const EMPTY_NEW_HOME_DATA: NewHomeData = {
  saleIndexSeoul: null,
  loanRate: null,
  loanRateAsOf: null,
  notesToday: null,
  publicNotesTotal: null,
  briefing: null,
  activityToday: null,
  regions: [],
  notes: [],
  posts: [],
  meetings: [],
  reports: [],
  /* 이 상수가 쓰이는 경로는 "로더가 통째로 실패했다" 하나뿐이다.
     그러니 전 섹션이 실패다 — 빈 데이터가 아니다. */
  failed: {
    regions: true,
    notes: true,
    posts: true,
    meetings: true,
    reports: true,
  },
};

/** 홈 시세 카드로 보여줄 지역 (내부 region id — seoul-districts 기준) */
const CARD_REGIONS: Array<{ id: string; name: string; city: string }> = [
  { id: "gangnam", name: "강남구", city: "서울" },
  { id: "mapo", name: "마포구", city: "서울" },
  { id: "songpa", name: "송파구", city: "서울" },
  { id: "namyangju", name: "남양주", city: "경기" },
];

/** 원 단위 평균 매매가 → "32.5억" 형식 */
function formatEok(won: number): string {
  const eok = won / 100_000_000;
  const s = eok >= 10 ? eok.toFixed(1) : eok.toFixed(2);
  return `${s.replace(/\.?0+$/, "")}억`;
}

/* 캡처 개선(2026-08-04) — 관심지역 행별 시세 칩이 이 포맷터를 재사용한다.
   포맷 규칙을 /api/home/personal 에 복사하면 홈 카드와 다른 숫자 얼굴이 된다. */
export function formatRegionPriceEok(won: number): string {
  return formatEok(won);
}
export function deltaOfChangePct(changePct: number | undefined): {
  delta: string;
  tone: DeltaTone;
} {
  return deltaOf(changePct);
}

function deltaOf(changePct: number | undefined): { delta: string; tone: DeltaTone } {
  if (typeof changePct !== "number" || !Number.isFinite(changePct)) {
    /* 예전엔 "— 0.0%" 였다. 변동률을 못 구한 지역과 정말로 보합인 지역이
       화면에서 **완전히 같은 모양**(회색 0.0%)이라, 모른다는 사실이 "변동
       없음"이라는 없는 사실로 바뀌어 있었다. 지도 말풍선도 이 문자열에서
       숫자를 뽑아 momPct=0 으로 썼다. 모르면 모른다고 적는다. */
    return { delta: DELTA_UNKNOWN, tone: "flat" };
  }
  const arrow = changePct > 0 ? "▲" : changePct < 0 ? "▼" : "—";
  const tone: DeltaTone = changePct > 0.1 ? "up" : changePct < -0.1 ? "down" : "flat";
  return { delta: `${arrow} ${Math.abs(changePct).toFixed(1)}%`, tone };
}

/** 0~5 평균 점수 → 100점 만점 라벨 */
function noteScoreOf(note: PublicNoteCard): number {
  return Math.round(inspectionAverageScore(note.scores) * 20);
}

/* KST(UTC+9 고정·서머타임 없음) 오늘 0시의 UTC 시각.
   서버는 UTC 로 돌기 때문에 "오늘"을 서버 로컬로 재면 한국 시간 0~9시 사이에
   등록된 것이 전부 "어제"로 빠진다(lib/points/store-db.ts 의 kstDateString 과
   같은 이유). 홈의 "오늘" 두 숫자는 이 경계를 쓴다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstStartOfTodayIso(now: Date = new Date()): string {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const kstMidnight = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
  );
  return new Date(kstMidnight - KST_OFFSET_MS).toISOString();
}

/** "3.62~5.13%" → 3.62 */
function parseRateMin(range: string): number | null {
  const m = /([0-9]+(?:\.[0-9]+)?)/.exec(range);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

async function loadSaleIndexSeoul(): Promise<string | null> {
  // 1순위: market_price_indices (REB 서울 아파트 매매지수, 월 단위 적재)
  try {
    const sb = getReadOnlySupabase();
    if (sb) {
      const { data, error } = await sb
        .from("market_price_indices")
        .select("value, month")
        .eq("index_type", "reb_apt_sale")
        .eq("region_code", "SEOUL")
        .not("value", "is", null)
        .order("month", { ascending: false })
        .limit(1);
      if (!error && Array.isArray(data) && data[0]) {
        const v = Number((data[0] as { value: unknown }).value);
        if (Number.isFinite(v) && v > 0) return v.toFixed(1);
      }
    }
  } catch (e) {
    logger.error("[loadSaleIndexSeoul:indices]", e);
  }
  // 폴백: 시도 단위 적재가 없으면 "서울" 지역 주간 시계열에서 최신값을 쓴다.
  for (const candidate of ["seoul", "서울"]) {
    const rows = await getRegionSeries(candidate, "sale_index", "weekly", 1).catch(() => []);
    const latest = rows[rows.length - 1];
    if (latest && Number.isFinite(latest.value)) return latest.value.toFixed(2);
  }
  /* 여기까지 왔으면 서울 지수는 없는 것이다 — null("—") 로 둔다.
     예전엔 강남·마포·송파 3개 구 주간 지수를 평균해 돌려줬는데, 홈 KPI 는
     이 값을 "매매지수 서울" 라벨로 띄운다. 3개 구 평균은 서울 지수가 아니고,
     라벨에는 아무 단서도 없었다 — 평균을 지역 지표로 위장하는 것도
     지어낸 값이다 (facilities "전체/25" 제거와 같은 판단). */
  return null;
}

/* ---------- AI 시장 브리핑 (market_region_monthly, 1시간 캐시) ---------- */

interface MonthlyTrendRow {
  region_name: string | null;
  month: string | null;
  trend_delta_pct: number | string | null;
}

async function computeBriefing(): Promise<HomeBriefing | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("market_region_monthly")
    .select("region_name, month, trend_delta_pct")
    .eq("deal_type", "trade")
    .eq("property_type", "apartment")
    .like("region_name", "서울%")
    .order("month", { ascending: false })
    .limit(80);
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const rows = data as MonthlyTrendRow[];
  const latestMonth = rows[0]?.month;
  if (!latestMonth || !/^\d{6}$/.test(latestMonth)) return null;

  const deltas = new Map<string, number>();
  for (const r of rows) {
    if (r.month !== latestMonth || !r.region_name) continue;
    const d = Number(r.trend_delta_pct);
    if (!Number.isFinite(d) || deltas.has(r.region_name)) continue;
    deltas.set(r.region_name, d);
  }
  const n = deltas.size;
  if (n === 0) return null;

  const values = [...deltas.values()];
  const falling = values.filter((d) => d < -0.1).length;
  const rising = values.filter((d) => d > 0.1).length;
  const avg = values.reduce((a, b) => a + b, 0) / n;
  const arrow = avg > 0.05 ? "▲" : avg < -0.05 ? "▼" : "—";

  const lead =
    falling >= rising
      ? `서울 주요 구 ${n}곳 중 ${falling}곳 하락`
      : `서울 주요 구 ${n}곳 중 ${rising}곳 상승`;
  const avgLabel =
    arrow === "—" ? "평균 보합" : `평균 ${arrow}${Math.abs(avg).toFixed(1)}%`;
  const text = `${lead}, ${avgLabel}`;
  const asOfLabel = `기준일 ${latestMonth.slice(0, 4)}.${latestMonth.slice(4, 6)}`;
  return { text, asOfLabel };
}

const loadBriefingCached = unstable_cache(
  async () => {
    try {
      return await computeBriefing();
    } catch (e) {
      logger.error("[computeBriefing]", e);
      return null;
    }
  },
  ["newui-home-briefing"],
  { revalidate: 3600 },
);

/* ---------- 오늘 활동 (platform_activity_events, KST 오늘) ---------- */

/**
 * 예전 이름은 `loadActiveNow` 였고 화면에는 **"접속 중 N명"** 으로 나갔다.
 * 그 숫자는 사람 수가 아니었다.
 *
 * ── 무엇이 틀렸나 (2026-08-06 실측) ────────────────────────────────────
 * 그 함수는 최근 15분 행을 최대 5,000건 끌어와 `metadata.session_id ?? user_email
 * ?? row.id` 로 중복을 제거했다. 그런데 표 전체 8,261행 중 `session_id` 가 있는
 * 행은 **4건**뿐이고, 이메일이 있는 행은 1,620건이다. 나머지는 전부 `row.id` 로
 * 떨어진다 — **행 하나가 사람 한 명**이 된다는 뜻이다. 게다가 최근 14일 이벤트의
 * 사실상 전량이 `viewport_group_change`(창 크기 그룹이 바뀔 때 쏘는 계측)이라,
 * 15분 최대 버킷은 **이벤트 153건 / 전부 비로그인 / 로그인 이메일 최대 2개**였다.
 * 즉 화면에는 "접속 중 153명"이 뜰 수 있었고, 실제 사람은 한두 명이었다.
 *
 * ── 왜 "사람 수"로 고치지 않았나 ──────────────────────────────────────
 * 사람을 세려면 브라우저마다 붙는 방문자 키가 있어야 한다. 이 저장소는 그 키
 * (`page_view_events.session_key`·`visitor_key`)를 **분석 동의 뒤에서만** 수집하기로
 * 이미 정해 두었다(app/api/metrics/pageview/route.ts). 그리고 그 표는 오늘 기준
 * 총 55행 — 최근 15분 0행이다. 동의 없이 새 식별자를 심으면 그 결정을 뒤집는 것이고,
 * 동의된 표만 쓰면 이번엔 100배 과소집계가 된다. **정직하게 셀 수 없는 숫자는
 * 세는 척하지 않는다** — 그래서 라벨을 데이터에 맞췄다.
 *
 * 지금 세는 것: KST 오늘 0시 이후의 **행위 이벤트 수**. 계측 전용 이벤트는 뺀다
 * (창 크기 변화는 사용자가 한 일이 아니다). `head: true` 정확 카운트라 행을
 * 한 건도 가져오지 않는다 — 5,000행 상한(최적화 6)도 함께 사라진다.
 */

/** 사람의 행위가 아니라 계측 자체인 이벤트 — "활동"에서 뺀다. */
const INSTRUMENTATION_EVENTS = ["viewport_group_change"] as const;

async function loadActivityToday(): Promise<number | null> {
  // 이벤트 테이블은 select 정책이 없어 Service Role 로만 조회 가능
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { count, error } = await sb
    .from("platform_activity_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", kstStartOfTodayIso())
    .not("event_name", "in", `(${INSTRUMENTATION_EVENTS.join(",")})`);
  /* 조회 실패는 0건이 아니다 — null 로 올려 화면이 "—"로 말하게 한다. */
  if (error || typeof count !== "number") return null;
  return count;
}

/* ---------- 오늘 새 노트 (inspection_notes, KST 오늘) ---------- */

/**
 * 예전에는 `listPublicNotes(10)` 가 돌려준 10건 중 오늘 것을 세었다. 홈 목록에
 * 3건만 쓰려고 10건만 받아오는 조회였으므로, **오늘 11건이 올라와도 화면은 영원히
 * 10건**이었다. 목록용 조회와 카운트용 조회는 다른 질문이다.
 */
async function countPublicNotesToday(): Promise<number | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const { count, error } = await sb
    .from("inspection_notes")
    .select("id", { count: "exact", head: true })
    .eq("is_public", true)
    .gte("created_at", kstStartOfTodayIso());
  if (error || typeof count !== "number") return null;
  return count;
}

/** 누적 공개 임장노트 수 — 홈 지표 카드용(오늘 0이어도 의미 있는 실카운트). */
async function countPublicNotesTotal(): Promise<number | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const { count, error } = await sb
    .from("inspection_notes")
    .select("id", { count: "exact", head: true })
    .eq("is_public", true);
  if (error || typeof count !== "number") return null;
  return count;
}

/* ---------- 지역 시세 카드 (스냅샷 → 카드) ---------- */

/** 스냅샷 맵에서 홈 지역 시세 카드를 만든다. DB 접근 없음(순수 변환). */
function buildRegionCards(
  snapshots: Map<string, RegionMarketSnapshot>,
): HomeRegionCard[] {
  const regions: HomeRegionCard[] = [];
  for (const target of CARD_REGIONS) {
    const snap = snapshots.get(target.id);
    if (!snap) continue;
    const priceWon = snap.avgSale ?? snap.medianSale;
    if (typeof priceWon !== "number" || priceWon <= 0) continue;
    const { delta, tone } = deltaOf(snap.saleChangeMonthly ?? snap.saleChangeWeekly);
    const trade =
      typeof snap.tradeCount === "number" && snap.tradeCount > 0
        ? ` · ${Math.round(snap.tradeCount).toLocaleString("ko-KR")}건`
        : "";
    regions.push({
      id: target.id,
      name: target.name,
      meta: `${target.city}${trade}`,
      price: formatEok(priceWon),
      delta,
      tone,
    });
  }
  return regions;
}

/**
 * 최적화 27 — **지역 시세 카드만** 필요한 소비자를 위한 최소 로더.
 *
 * `/api/home/personal` 은 관심지역 1건을 매칭하려고 `loadNewHomeData()` 를
 * 통째로 불렀다. 그 함수는 7갈래를 병렬로 돌리는데, 여기서 실제로 쓰이는 건
 * `getAllRegionSnapshots()` 하나뿐이고 나머지는 전부 버려졌다. 그중 넷은
 * 캐시가 없어 **로그인 홈 방문마다** 실제로 DB 를 때렸다:
 *   · listPublicNoteCards(10) — inspection_notes (당시엔 select("*") 였다 — 최적화 8)
 *   · loadActiveNow()      — platform_activity_events 최대 5,000행(metadata 포함)
 *   · loadSaleIndexSeoul() — market_price_indices 조회
 *   · getMortgageRates()   — public_data_cache 조회
 * 지역 카드는 스냅샷 맵의 순수 변환이므로 나머지를 부를 이유가 없다.
 *
 * 실패와 "카드 0장"을 구분해야 해서 `null` 을 실패로 쓴다 — 빈 배열로 뭉개면
 * 호출부가 조회 실패를 "해당 지역 없음"으로 오인한다.
 */
export async function loadHomeRegionCards(): Promise<HomeRegionCard[] | null> {
  try {
    const snapshots = await getAllRegionSnapshots();
    /* 0건은 준비 중이 아니라 조회 이상이다 — loadNewHomeDataInternal 과 동일 판정 */
    if (snapshots.size === 0) return null;
    return buildRegionCards(snapshots);
  } catch (err) {
    logger.error("[loadHomeRegionCards] 지역 스냅샷 조회 실패", err);
    return null;
  }
}

async function loadNewHomeDataInternal(): Promise<NewHomeData> {
  /* 실패를 삼키되 "삼켰다는 사실"은 남긴다. 아래 failed 로 화면까지 전달된다. */
  let regionsFailed = false;
  let notesFailed = false;
  const [
    home,
    snapshots,
    publicNotes,
    saleIndexSeoul,
    mortgage,
    briefing,
    activityToday,
    notesToday,
    publicNotesTotal,
  ] = await Promise.all([
      loadHomeData().catch((err): HomeData => {
        logger.error("[loadNewHomeData] loadHomeData 실패", err);
        return EMPTY_HOME_DATA;
      }),
      getAllRegionSnapshots().catch((err) => {
        logger.error("[loadNewHomeData] 지역 스냅샷 조회 실패", err);
        regionsFailed = true;
        return new Map<string, never>();
      }),
      /* 최적화 30 — 홈은 최대 3건만 쓴다. 50행(전 컬럼)을 끌어오던 것을 10행으로.
         (여유분은 비공개 전환 등 후처리 필터 대비)
         최적화 8 — 그 10행이 `select("*")` 였다. 오늘 실측(공개노트 8건):
         전 컬럼 143,707B 중 body_md 만 77,943B, metadata 15,524B, check_items
         7,434B … 반면 홈이 실제로 쓰는 건 id·title·apt_name·점수 5개뿐이라
         1,439B 다. 100배를 받아서 99%를 버리고 있었다. 카드용 조회로 바꾼다. */
      listPublicNoteCards(10).catch((err): PublicNoteCard[] => {
        logger.error("[loadNewHomeData] 공개 임장노트 조회 실패", err);
        notesFailed = true;
        return [];
      }),
      loadSaleIndexSeoul().catch(() => null),
      getMortgageRates().catch(() => null),
      loadBriefingCached().catch((): HomeBriefing | null => null),
      loadActivityToday().catch((): number | null => null),
      countPublicNotesToday().catch((): number | null => null),
      countPublicNotesTotal().catch((): number | null => null),
    ]);

  // ── 지역 시세 카드 (market_region_price 스냅샷) ──
  /* 스냅샷 0건은 "데이터 준비 중"이 아니라 조회 이상이다(키 부재·ETL 재적재
     창 — 운영에서 이 표가 정말로 빈 적은 없다). 예전엔 이 경우 EmptyState
     ("준비되면 표시됩니다")로 나가 실패가 준비 중으로 위장됐다(2026-08-04
     소유자 캡처). 실패로 분류해 "지금 불러오지 못했어요"로 말한다. */
  if (!regionsFailed && snapshots.size === 0) regionsFailed = true;
  const regions = buildRegionCards(snapshots);

  // ── 공개 임장노트 (inspection_notes) ──
  const notes: HomeNoteItem[] = publicNotes.slice(0, 3).map((n) => {
    const score = noteScoreOf(n);
    return {
      id: n.id,
      title: n.aptName && !n.title.includes(n.aptName) ? `${n.aptName} — ${n.title}` : n.title,
      score: `${score}점`,
      hot: score >= 75,
    };
  });
  /* notesToday 는 위 Promise.all 의 countPublicNotesToday() 결과다 — 목록(3건)과
     같은 조회에서 세지 않는다. 목록은 10건만 받아오므로 오늘 11건째부터는
     영원히 10건으로 굳었다. */

  // ── 동네이야기 인기글 (posts 테이블, loadHomeData 정렬 그대로) ──
  const posts: HomePostItem[] = home.posts.slice(0, 3).map((p, i) => ({
    id: p.id,
    rank: i + 1,
    title: p.title,
    comments: p.commentCount,
  }));

  // ── 임장 모임 · 전문가 리포트 (사이드바) ──
  const meetings: HomeMeetingItem[] = home.meetings.slice(0, 2).map((m) => ({
    id: m.id,
    label: `${m.title} · ${m.scheduleLabel} · ${m.currentMembers}/${m.maxMembers}`,
  }));
  const reports: HomeReportItem[] = home.reports.slice(0, 2).map((r) => ({
    id: r.id,
    title: r.title,
    priceLabel: r.price > 0 ? `${r.price.toLocaleString("ko-KR")}원` : "무료",
  }));

  // ── 대출금리 (finlife 공시 — 실공시일 때만) ──
  let loanRate: string | null = null;
  /* 기준시점은 값이 실제로 만들어졌을 때만 붙인다 — 금리는 못 구했는데
     "2026.06 기준"만 남으면 없는 숫자에 날짜를 다는 꼴이 된다. */
  let loanRateAsOf: string | null = null;
  if (mortgage && mortgage.live) {
    const mins = mortgage.rates
      .map((r) => parseRateMin(r.variable))
      .filter((v): v is number => v !== null);
    if (mins.length > 0) {
      loanRate = `${Math.min(...mins).toFixed(2)}%`;
      loanRateAsOf = mortgage.asOf ?? null;
    }
  }

  return {
    saleIndexSeoul,
    loanRate,
    loanRateAsOf,
    notesToday,
    publicNotesTotal,
    briefing,
    activityToday,
    regions,
    notes,
    posts,
    meetings,
    reports,
    failed: {
      regions: regionsFailed,
      notes: notesFailed,
      posts: home.failedSources.includes("posts"),
      meetings: home.failedSources.includes("meetings"),
      reports: home.failedSources.includes("reports"),
    },
  };
}

/** 홈 RSC 가 어떤 오류에도 죽지 않도록 하는 안전 로더 */
export async function loadNewHomeData(): Promise<NewHomeData> {
  try {
    return await loadNewHomeDataInternal();
  } catch (err) {
    logger.error("[loadNewHomeData]", err);
    return EMPTY_NEW_HOME_DATA;
  }
}
