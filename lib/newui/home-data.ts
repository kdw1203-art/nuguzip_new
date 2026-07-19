/**
 * 새 디자인 홈(`app/page.tsx`) 전용 데이터 헬퍼.
 *
 * 구 코드베이스의 서버 함수를 그대로 사용한다:
 * - `loadHomeData()`            → 동네이야기 게시글·모임·리포트·통계 (lib/landing/data)
 * - `getAllRegionSnapshots()`   → 지역 시세 카드 (market_region_price, lib/market/store)
 * - `getRegionSeries()`         → 매매가격지수 (market_region_series, lib/market/store)
 * - `listPublicNotes()`         → 공개 임장노트 (inspection_notes, lib/inspection/store-db)
 * - `getMortgageRates()`        → 주담대 금리 (금융감독원 finlife, lib/finance/mortgage-rates)
 *
 * 모든 조회는 실패/빈 데이터 시 null·빈 배열을 반환하고, 페이지 쪽에서
 * 기존 목업 값으로 폴백한다. DB 쓰기 없음.
 */
import "server-only";
import { loadHomeData, type HomeData, EMPTY_HOME_DATA } from "@/lib/landing/data";
import { getAllRegionSnapshots, getRegionSeries } from "@/lib/market/store";
import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { getMortgageRates } from "@/lib/finance/mortgage-rates";
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

export interface NewHomeData {
  /** 최신 서울(강남 대표) 매매가격지수 — 데이터 없으면 null */
  saleIndexSeoul: string | null;
  /** 은행권 변동금리 하단 (예: "3.62%") — 실공시 아닐 때 null */
  loanRate: string | null;
  /** 오늘 등록된 공개 임장노트 수 — 공개 노트 데이터가 없으면 null */
  notesToday: number | null;
  regions: HomeRegionCard[];
  notes: HomeNoteItem[];
  posts: HomePostItem[];
  meetings: HomeMeetingItem[];
  reports: HomeReportItem[];
}

export const EMPTY_NEW_HOME_DATA: NewHomeData = {
  saleIndexSeoul: null,
  loanRate: null,
  notesToday: null,
  regions: [],
  notes: [],
  posts: [],
  meetings: [],
  reports: [],
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

function deltaOf(changePct: number | undefined): { delta: string; tone: DeltaTone } {
  if (typeof changePct !== "number" || !Number.isFinite(changePct)) {
    return { delta: "— 0.0%", tone: "flat" };
  }
  const arrow = changePct > 0 ? "▲" : changePct < 0 ? "▼" : "—";
  const tone: DeltaTone = changePct > 0.1 ? "up" : changePct < -0.1 ? "down" : "flat";
  return { delta: `${arrow} ${Math.abs(changePct).toFixed(1)}%`, tone };
}

/** 0~5 평균 점수 → 100점 만점 라벨 */
function noteScoreOf(note: InspectionNote): number {
  return Math.round(inspectionAverageScore(note.scores) * 20);
}

function isToday(iso: string): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && new Date(t).toDateString() === new Date().toDateString();
}

/** "3.62~5.13%" → 3.62 */
function parseRateMin(range: string): number | null {
  const m = /([0-9]+(?:\.[0-9]+)?)/.exec(range);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

async function loadSaleIndexSeoul(): Promise<string | null> {
  // 시도 단위 적재가 없어 서울 대표 지역(강남·마포·송파) 최신 주간 지수 평균으로 근사.
  for (const candidate of ["seoul", "서울"]) {
    const rows = await getRegionSeries(candidate, "sale_index", "weekly", 1).catch(() => []);
    const latest = rows[rows.length - 1];
    if (latest && Number.isFinite(latest.value)) return latest.value.toFixed(2);
  }
  const seoulIds = ["gangnam", "mapo", "songpa"];
  const values: number[] = [];
  for (const id of seoulIds) {
    const rows = await getRegionSeries(id, "sale_index", "weekly", 1).catch(() => []);
    const latest = rows[rows.length - 1];
    if (latest && Number.isFinite(latest.value)) values.push(latest.value);
  }
  if (values.length === 0) return null;
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
}

async function loadNewHomeDataInternal(): Promise<NewHomeData> {
  const [home, snapshots, publicNotes, saleIndexSeoul, mortgage] = await Promise.all([
    loadHomeData().catch((): HomeData => EMPTY_HOME_DATA),
    getAllRegionSnapshots().catch(() => new Map<string, never>()),
    listPublicNotes(50).catch((): InspectionNote[] => []),
    loadSaleIndexSeoul().catch(() => null),
    getMortgageRates().catch(() => null),
  ]);

  // ── 지역 시세 카드 (market_region_price 스냅샷) ──
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
  const notesToday = publicNotes.length
    ? publicNotes.filter((n) => isToday(n.createdAt)).length
    : null;

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
  if (mortgage && mortgage.live) {
    const mins = mortgage.rates
      .map((r) => parseRateMin(r.variable))
      .filter((v): v is number => v !== null);
    if (mins.length > 0) loanRate = `${Math.min(...mins).toFixed(2)}%`;
  }

  return { saleIndexSeoul, loanRate, notesToday, regions, notes, posts, meetings, reports };
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
