/**
 * D17 — 맞춤 단지·지역 추천 데이터 헬퍼 (서버 전용).
 *
 * 새 조회 인프라를 만들지 않고 기존 서버 스토어만 재사용한다:
 * - `getOnboardingPersonalization()` (lib/onboarding/personalization) → 관심지역·예산·목적
 * - `getAllRegionSnapshots()`       (lib/market/store)                → 후보 지역 시세 스냅샷
 * - `regionIdForName()`             (lib/region/catalog)              → 관심지역명 → 내부 지역 id
 *
 * 모든 조회는 실패/빈 데이터 시 안전하게 빈 결과를 반환한다(graceful, DB 쓰기 없음).
 * service-role 미설정 환경(이 저장소)에서는 스냅샷이 비어 자연스럽게 "예시 + 안내" 상태가 된다.
 *
 * 룰 기반 랭킹(설명 가능):
 *   score = 관심지역 매칭(+100) + 예산 적합도(+50/+20/−30) + 목적별 흐름(±) + 거래 유동성(+)
 *   각 항목은 사람이 읽을 수 있는 "추천 이유" 문구로 함께 반환한다.
 */
import "server-only";
import {
  getOnboardingPersonalization,
  type OnboardingBudget,
  type PurposeId,
} from "@/lib/onboarding/personalization";
import { getAllRegionSnapshots } from "@/lib/market/store";
import { regionIdForName } from "@/lib/region/catalog";
import { SEOUL_DISTRICTS } from "@/lib/map/seoul-districts";
import type { RegionMarketSnapshot } from "@/lib/market/types";
import { logger } from "@/lib/log";

const MAX_ITEMS = 6;
const EOK = 100_000_000;

export type DeltaTone = "up" | "down" | "flat";

/** 추천 카드 한 장 (지역 단위). */
export interface RecItem {
  regionId: string;
  /** 지역명 (예: "마포구") */
  name: string;
  /** 시/도 힌트 (예: "서울") — 없으면 "" */
  city: string;
  /** 평균 매매 시세 라벨 (예: "10.4억") — 시세 데이터 없으면 null */
  priceLabel: string | null;
  /** 전월 대비 라벨 (예: "▼ 0.2%") */
  delta: string;
  tone: DeltaTone;
  /** 최근 거래량(호) — 없으면 null */
  tradeCount: number | null;
  /** 사람이 읽을 수 있는 추천 이유 문구들 (최대 4개) */
  reasons: string[];
  /** 내부 랭킹 점수 (디버그·정렬용) */
  score: number;
  /** 예시(더미) 카드 여부 — 실데이터가 아니면 true */
  example?: boolean;
}

export interface PersonalizationSummary {
  regions: string[];
  budget: OnboardingBudget | null;
  purpose: PurposeId | null;
}

export interface RecommendResult {
  /** 실데이터 기반 추천(최대 6). 신호/데이터 부족 시 빈 배열 → 페이지가 예시 상태 렌더 */
  items: RecItem[];
  /** 개인화 설정(관심지역·예산·목적) — 미설정 시 null */
  personalization: PersonalizationSummary | null;
  /** 후보 지역 시세 스냅샷이 1건이라도 있었는지 (안내 문구 분기용) */
  hasMarketData: boolean;
}

export const EMPTY_RESULT: RecommendResult = {
  items: [],
  personalization: null,
  hasMarketData: false,
};

/* ── 표시 헬퍼 ───────────────────────────────────────────── */

const SEOUL_IDS = new Set(SEOUL_DISTRICTS.map((d) => d.id));

/** 원 단위 평균가 → "10.4억" (홈 카드와 동일한 표기) */
function formatEok(won: number): string {
  const eok = won / EOK;
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

/** "마포구"·"남양주시" → "마포"·"남양주" (관심지역 이유 표기용) */
function shortName(name: string): string {
  return name.replace(/(특별시|광역시|자치시|자치도)$/, "").replace(/(구|시|군)$/, "") || name;
}

/** 관심지역명("서울 마포구")에서 시/도 토큰("서울") 추출 — 공백 있을 때만 */
function cityToken(interestName: string): string {
  const parts = interestName.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[0] : "";
}

/** 예산(억) → 원 범위. 상·하한 모두 없으면 null(예산 신호 없음) */
function budgetWonBounds(budget: OnboardingBudget): { lo: number; hi: number } | null {
  const lo = budget.min != null ? budget.min * EOK : null;
  const hi = budget.max != null ? budget.max * EOK : null;
  if (lo == null && hi == null) return null;
  return { lo: lo ?? 0, hi: hi ?? Number.POSITIVE_INFINITY };
}

/** 스냅샷의 목적별 유효 시세(매매/전세) 추정 */
function effectivePrice(snap: RegionMarketSnapshot, budget: OnboardingBudget | null): number | null {
  const sale = snap.avgSale ?? snap.medianSale;
  if (typeof sale !== "number" || sale <= 0) return null;
  if (budget?.type === "jeonse" && typeof snap.jeonseRatio === "number" && snap.jeonseRatio > 0) {
    return sale * (snap.jeonseRatio / 100);
  }
  return sale;
}

/* ── 랭킹 ─────────────────────────────────────────────────── */

interface ScoreInput {
  snap: RegionMarketSnapshot;
  interestedIds: Set<string>;
  interestCityById: Map<string, string>;
  budget: OnboardingBudget | null;
  purpose: PurposeId | null;
}

/** 한 후보 지역의 점수·이유·가격 라벨 계산 */
function scoreCandidate({
  snap,
  interestedIds,
  interestCityById,
  budget,
  purpose,
}: ScoreInput): RecItem {
  const reasons: string[] = [];
  let score = 0;

  // 1) 관심지역 매칭 (가장 강한 신호)
  const isInterest = interestedIds.has(snap.regionId);
  if (isInterest) {
    score += 100;
    reasons.push(`관심지역 ${shortName(snap.regionName)}`);
  }

  // 2) 예산 적합도
  const priced = effectivePrice(snap, budget);
  const bounds = budget ? budgetWonBounds(budget) : null;
  if (bounds && priced != null) {
    if (priced >= bounds.lo && priced <= bounds.hi) {
      score += 50;
      reasons.push("예산 이내");
    } else {
      const nearest = priced < bounds.lo ? bounds.lo : bounds.hi;
      const rel = Number.isFinite(nearest) ? Math.abs(priced - nearest) / nearest : 1;
      if (rel <= 0.15) {
        score += 20;
        reasons.push("예산 근접");
      } else {
        score -= 30; // 예산 크게 벗어남 → 하위로
      }
    }
  }

  // 3) 목적별 시세 흐름 (실거주/전세: 하락 선호 · 투자: 상승 선호)
  const change = snap.saleChangeMonthly;
  if (typeof change === "number" && Number.isFinite(change)) {
    const mag = Math.min(Math.abs(change), 2);
    if (purpose === "invest") {
      if (change > 0) score += mag * 8;
    } else {
      // live · jeonse · 미설정 → 하락(저가 매수 기회) 가점
      if (change < 0) score += mag * 8;
    }
    if (change < -0.1) reasons.push("최근 하락 흐름");
    else if (change > 0.1) reasons.push("최근 상승 흐름");
  }

  // 4) 거래 유동성
  const tradeCount =
    typeof snap.tradeCount === "number" && snap.tradeCount > 0 ? Math.round(snap.tradeCount) : null;
  if (tradeCount != null) {
    score += Math.min(tradeCount / 20, 10);
    reasons.push(`최근 거래 ${tradeCount.toLocaleString("ko-KR")}건`);
  }

  const { delta, tone } = deltaOf(snap.saleChangeMonthly);
  const sale = snap.avgSale ?? snap.medianSale;
  const city =
    interestCityById.get(snap.regionId) || (SEOUL_IDS.has(snap.regionId) ? "서울" : "");

  return {
    regionId: snap.regionId,
    name: snap.regionName,
    city,
    priceLabel: typeof sale === "number" && sale > 0 ? formatEok(sale) : null,
    delta,
    tone,
    tradeCount,
    reasons: reasons.slice(0, 4),
    score,
  };
}

/* ── 진입점 ───────────────────────────────────────────────── */

export async function loadRecommendations(email: string): Promise<RecommendResult> {
  try {
    const [personalization, snapshots] = await Promise.all([
      getOnboardingPersonalization(email).catch(() => null),
      getAllRegionSnapshots().catch(() => new Map<string, RegionMarketSnapshot>()),
    ]);

    const summary: PersonalizationSummary | null = personalization
      ? {
          regions: personalization.regions,
          budget: personalization.budget,
          purpose: personalization.purpose,
        }
      : null;

    const candidates = [...snapshots.values()];
    const hasMarketData = candidates.length > 0;

    // 개인화 신호 해석
    const interestedIds = new Set<string>();
    const interestCityById = new Map<string, string>();
    for (const name of personalization?.regions ?? []) {
      const id = regionIdForName(name);
      if (!id) continue;
      interestedIds.add(id);
      const city = cityToken(name);
      if (city) interestCityById.set(id, city);
    }
    const budget = personalization?.budget ?? null;
    const purpose = personalization?.purpose ?? null;
    const hasInterest = interestedIds.size > 0;
    const hasBudget = !!(budget && budgetWonBounds(budget));

    // 후보 풀 결정 (신호가 있어야 "맞춤" — 아니면 빈 배열 → 예시 상태)
    let pool: RegionMarketSnapshot[];
    if (!hasInterest && !hasBudget) {
      pool = [];
    } else if (hasInterest && !hasBudget) {
      // 예산 없이 관심지역만 → 관심지역 시세가 쌓인 곳만 추천(임의 지역 금지)
      pool = candidates.filter((s) => interestedIds.has(s.regionId));
    } else {
      // 예산이 있으면 전체 지역을 예산·흐름 기준으로 랭킹(관심지역은 가점으로 상단 고정)
      pool = candidates;
    }

    const items = pool
      .map((snap) => scoreCandidate({ snap, interestedIds, interestCityById, budget, purpose }))
      .filter((it) => it.reasons.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ITEMS);

    return { items, personalization: summary, hasMarketData };
  } catch (e) {
    logger.error("[recommend] loadRecommendations", e);
    return EMPTY_RESULT;
  }
}

/** 실데이터 0건일 때 노출할 단일 "예시" 카드 (더미데이터 정책: 예시 1건만). */
export const EXAMPLE_ITEM: RecItem = {
  regionId: "mapo",
  name: "마포구",
  city: "서울",
  priceLabel: "10.4억",
  delta: "▼ 0.2%",
  tone: "down",
  tradeCount: 76,
  reasons: ["관심지역 마포", "예산 이내", "최근 3개월 거래 증가"],
  score: 0,
  example: true,
};
