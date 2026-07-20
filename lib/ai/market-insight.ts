/**
 * AI 분석 공용: 지역 실시세 스냅샷 결합 + 규칙 기반 코멘트 + LLM 이원화 헬퍼 (서버 전용).
 *
 * - 스냅샷 출처: lib/market/store (market_region_price 읽기 전용, 1h 캐시)
 * - LLM: 기존 callLlmChat 재사용. 키/네트워크 부재 시 항상 규칙 기반으로 안전 강등.
 */

import { matchRegionByName } from "@/lib/market/region-code";
import { getAllRegionSnapshots } from "@/lib/market/store";
import { callLlmChat, type LlmMessage } from "@/lib/ai/llm-provider";
import { defaultModelIdFromEnv, getModelOption } from "@/lib/ai/llm-models";

export const AI_DISCLAIMER =
  "본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다";

/** JSON 직렬화 안전한 지역 실시세 요약 */
export type AnalysisRegionSnapshot = {
  regionId: string;
  regionName: string;
  /** yyyymm */
  period: string;
  source: string;
  /** 평균 매매가(원) */
  avgSaleWon: number | null;
  /** ㎡당 매매가(원) */
  perM2SaleWon: number | null;
  /** 전월 대비 매매 변동률(%) */
  saleChangeMonthly: number | null;
  /** 전세가율(%) */
  jeonseRatio: number | null;
  tradeCount: number | null;
};

/** 원 단위 → "8.4억" 표기 (10억 미만은 소수 2자리) */
export function formatEokWon(won: number): string {
  const eok = won / 100_000_000;
  const s = eok >= 10 ? eok.toFixed(1) : eok.toFixed(2);
  return `${s.replace(/\.?0+$/, "")}억`;
}

/** 지역명(자유 표기)으로 실시세 스냅샷 조회. 실패/미보유 시 null (graceful). */
export async function resolveRegionSnapshotByName(
  name: string,
  cityHint?: string,
): Promise<AnalysisRegionSnapshot | null> {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  try {
    const match = matchRegionByName(trimmed, cityHint);
    if (!match) return null;
    const map = await getAllRegionSnapshots();
    const snap = map.get(match.id);
    if (!snap) return null;
    return {
      regionId: snap.regionId,
      regionName: snap.regionName,
      period: snap.period,
      source: snap.source,
      avgSaleWon:
        typeof snap.avgSale === "number" && snap.avgSale > 0
          ? snap.avgSale
          : typeof snap.medianSale === "number" && snap.medianSale > 0
            ? snap.medianSale
            : null,
      perM2SaleWon:
        typeof snap.perM2Sale === "number" && snap.perM2Sale > 0 ? snap.perM2Sale : null,
      saleChangeMonthly:
        typeof snap.saleChangeMonthly === "number" ? snap.saleChangeMonthly : null,
      jeonseRatio: typeof snap.jeonseRatio === "number" ? snap.jeonseRatio : null,
      tradeCount: typeof snap.tradeCount === "number" ? snap.tradeCount : null,
    };
  } catch {
    return null;
  }
}

/** 스냅샷 → 한 줄 한국어 요약 ("강남구 2506 기준 평균 25.4억 · 전월 ▼0.4% · 전세가율 48%") */
export function describeSnapshot(snap: AnalysisRegionSnapshot): string {
  const parts: string[] = [`${snap.regionName} ${snap.period} 기준`];
  if (snap.avgSaleWon) parts.push(`평균 매매가 ${formatEokWon(snap.avgSaleWon)}`);
  if (snap.saleChangeMonthly !== null) {
    const arrow = snap.saleChangeMonthly > 0 ? "▲" : snap.saleChangeMonthly < 0 ? "▼" : "—";
    parts.push(`전월 대비 ${arrow}${Math.abs(snap.saleChangeMonthly).toFixed(1)}%`);
  }
  if (snap.jeonseRatio !== null) parts.push(`전세가율 ${snap.jeonseRatio.toFixed(0)}%`);
  return parts.join(" · ");
}

/** 스냅샷 델타 → 규칙 기반 강점/리스크/확인 항목 (임장노트 분석 병합용) */
export function marketBulletsFromSnapshot(snap: AnalysisRegionSnapshot): {
  strengths: string[];
  risks: string[];
  followUps: string[];
} {
  const strengths: string[] = [];
  const risks: string[] = [];
  const followUps: string[] = [];
  const chg = snap.saleChangeMonthly;
  if (chg !== null) {
    if (chg <= -0.3) {
      strengths.push(
        `${snap.regionName} 시세가 전월 대비 ${Math.abs(chg).toFixed(1)}% 조정 — 가격 협상 여지가 있는 구간`,
      );
      followUps.push("급매·실거래 최저가와 호가 격차 확인 (조정 구간 매수 조건 점검)");
    } else if (chg >= 0.3) {
      risks.push(
        `${snap.regionName} 시세가 전월 대비 ${chg.toFixed(1)}% 상승 — 추격 매수 부담 유의`,
      );
      followUps.push("최근 상승분이 실거래로 뒷받침되는지 거래량과 함께 확인");
    }
  }
  const jr = snap.jeonseRatio;
  if (jr !== null) {
    if (jr >= 70) {
      strengths.push(`전세가율 ${jr.toFixed(0)}% — 갭이 작아 하방 지지력이 상대적으로 높음`);
    } else if (jr <= 50) {
      risks.push(`전세가율 ${jr.toFixed(0)}% — 매매가 대비 전세가 낮아 갭 부담 큼`);
      followUps.push("전세 수요·입주 물량을 확인해 역전세 가능성 점검");
    }
  }
  if (snap.tradeCount !== null && snap.tradeCount > 0 && snap.tradeCount < 20) {
    followUps.push(`월 거래 ${Math.round(snap.tradeCount)}건 수준 — 유동성(환금성) 낮은 편, 매도 시나리오 점검`);
  }
  return { strengths, risks, followUps };
}

/**
 * LLM 텍스트 생성 시도. 키/네트워크 부재·오류 시 null (호출부가 규칙 기반으로 강등).
 */
export async function tryLlmText(
  system: string,
  user: string,
): Promise<{ text: string; engine: string } | null> {
  try {
    const option = getModelOption(defaultModelIdFromEnv());
    if (!option) return null;
    const messages: LlmMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    const res = await callLlmChat(option, messages);
    if (!res.ok) return null;
    return { text: res.text, engine: `${res.vendor}:${res.apiModel}` };
  } catch {
    return null;
  }
}
