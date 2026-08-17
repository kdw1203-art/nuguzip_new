/* 지역 임장 가이드의 단지 집계 — 순수 함수 (전략 정본 §4-2 프로그래매틱 임장 랜딩).
 *
 * tx_band_complex_source 는 (지역 × 면적대 구간 × 단지) 행이라 같은 단지가
 * 구간별로 여러 행으로 나뉜다. 임장 후보 목록은 단지 단위가 필요해 여기서
 * 합친다. server-only 인 guide.ts 에서 분리한 이유: 유닛 테스트가 직접
 * 임포트할 수 있어야 해서다 (lib/coverage/email.ts 와 같은 패턴).
 */

export interface ComplexBandRow {
  name: string;
  txCount: number;
  /** 구간 평균가 (원). 0 이하는 "모름"으로 취급한다. */
  avgKrw: number;
  minKrw: number;
  maxKrw: number;
  /** "YYYYMM" — 이 구간에서 이 단지의 마지막 신고월 */
  latestYm: string | null;
}

export interface ImjangComplex {
  name: string;
  /** 면적대 구간에 정리된 매매 건수 합 (지역 전체 신고분이 아니다) */
  txCount: number;
  /** 거래량 가중 평균가 (원). 근거 없으면 0. */
  avgKrw: number;
  /** 확인된 최저·최고가 (원). 근거 없으면 0. */
  minKrw: number;
  maxKrw: number;
  latestYm: string | null;
}

/** 구간 행 → 단지 단위 합산, 거래 많은 순 상위 limit. */
export function aggregateComplexRows(rows: ComplexBandRow[], limit = 10): ImjangComplex[] {
  const map = new Map<string, ImjangComplex & { weightedSum: number; weightedTx: number }>();

  for (const r of rows) {
    const name = r.name.trim();
    if (!name || !(r.txCount > 0)) continue;
    let c = map.get(name);
    if (!c) {
      c = { name, txCount: 0, avgKrw: 0, minKrw: 0, maxKrw: 0, latestYm: null, weightedSum: 0, weightedTx: 0 };
      map.set(name, c);
    }
    c.txCount += r.txCount;
    /* 평균은 구간 평균의 거래량 가중합 — 0(모름) 구간은 가중치에서 제외해
       "모름"이 평균을 0 쪽으로 끌어내리지 않게 한다. */
    if (r.avgKrw > 0) {
      c.weightedSum += r.avgKrw * r.txCount;
      c.weightedTx += r.txCount;
    }
    if (r.minKrw > 0) c.minKrw = c.minKrw > 0 ? Math.min(c.minKrw, r.minKrw) : r.minKrw;
    if (r.maxKrw > 0) c.maxKrw = Math.max(c.maxKrw, r.maxKrw);
    if (r.latestYm && (!c.latestYm || r.latestYm > c.latestYm)) c.latestYm = r.latestYm;
  }

  return [...map.values()]
    .map(({ weightedSum, weightedTx, ...c }) => ({
      ...c,
      avgKrw: weightedTx > 0 ? Math.round(weightedSum / weightedTx) : 0,
    }))
    .sort((a, b) => b.txCount - a.txCount || a.name.localeCompare(b.name, "ko"))
    .slice(0, Math.max(1, limit));
}
