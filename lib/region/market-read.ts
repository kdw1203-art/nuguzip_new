import "server-only";

/* [개선 #7, 2026-08-22] 지역 시장 읽기 — 프로그래매틱 SEO 의 본문 계층.
 *
 * 목적: /region/[id] 250곳이 "표와 차트만 있는 얇은 페이지"로 평가받지 않게,
 * 이미 로드된 실데이터(12개월 지수·월별 거래량·입주 예정·전세가율)를
 * **지역마다 다른 문장**으로 서술한다. 규칙:
 *   - 모든 수치는 호출부가 실제로 읽어 온 값에서만 나온다(추가 조회 0).
 *   - 값이 없으면 그 문장을 아예 만들지 않는다(빈칸을 채우는 표현 금지).
 *   - 해석은 산술 사실의 서술까지만("12개월 중 최고점은 3월") — 전망·권유 금지.
 * FAQ 는 검색 스니펫 자산이다 — 답이 데이터에 있을 때만 질문을 만든다.
 */

export type SeriesPoint = { period: string; value: number };
export type VolumePoint = { month: string; count: number };

export type MarketRead = {
  paragraphs: string[];
  faq: Array<{ q: string; a: string }>;
};

function ym(period: string): string {
  // "2026-07" | "202607" | "2026-07-01" → "2026년 7월"
  const d = period.replace(/[^0-9]/g, "");
  if (d.length < 6) return period;
  return `${d.slice(0, 4)}년 ${Number(d.slice(4, 6))}월`;
}

function pct(a: number, b: number): number {
  return ((a - b) / b) * 100;
}

export function buildMarketRead(input: {
  name: string;
  series: SeriesPoint[];
  volume: VolumePoint[];
  /** 24개월 조회분 입주 예정 (세대수 null 가능) */
  supply: Array<{ households: number | null }>;
  supplyCapped: boolean;
  jeonseRatio?: number;
  avgSaleLabel?: string | null;
  periodLabel: string;
}): MarketRead {
  const { name, series, volume } = input;
  const paragraphs: string[] = [];
  const faq: Array<{ q: string; a: string }> = [];

  /* ── 1. 12개월 지수 추세 ── */
  if (series.length >= 6) {
    const first = series[0];
    const last = series[series.length - 1];
    const chg = pct(last.value, first.value);
    const peak = series.reduce((m, s) => (s.value > m.value ? s : m), series[0]);
    const trough = series.reduce((m, s) => (s.value < m.value ? s : m), series[0]);
    const tail = series.slice(-3);
    const tailDir =
      tail.length === 3
        ? tail[2].value > tail[1].value && tail[1].value > tail[0].value
          ? "3개월 연속 오름세"
          : tail[2].value < tail[1].value && tail[1].value < tail[0].value
            ? "3개월 연속 내림세"
            : "등락이 섞인 흐름"
        : null;
    const dirWord = Math.abs(chg) < 0.05 ? "보합" : chg > 0 ? "상승" : "하락";
    const sentences = [
      `${name} 아파트 매매가격지수는 ${ym(first.period)} 이후 12개월 동안 ${
        dirWord === "보합" ? "사실상 보합" : `${Math.abs(chg).toFixed(1)}% ${dirWord}`
      }했습니다(한국부동산원 지수 기준).`,
    ];
    if (peak.period !== trough.period) {
      sentences.push(
        `이 기간 지수가 가장 높았던 달은 ${ym(peak.period)}, 가장 낮았던 달은 ${ym(trough.period)}입니다.`,
      );
    }
    if (tailDir) sentences.push(`최근 석 달은 ${tailDir}입니다.`);
    paragraphs.push(sentences.join(" "));

    faq.push({
      q: `${name} 아파트값은 1년 새 얼마나 움직였나요?`,
      a: `한국부동산원 매매가격지수 기준으로 ${ym(first.period)}부터 ${ym(last.period)}까지 ${
        Math.abs(chg) < 0.05 ? "사실상 보합" : `약 ${Math.abs(chg).toFixed(1)}% ${chg > 0 ? "상승" : "하락"}`
      }했습니다.`,
    });
  }

  /* ── 2. 거래량 흐름 ── */
  if (volume.length >= 4) {
    const latest = volume[volume.length - 1];
    const prev = volume[volume.length - 2];
    const avg = volume.reduce((a, v) => a + v.count, 0) / volume.length;
    const sentences: string[] = [];
    if (prev.count > 0) {
      const vchg = pct(latest.count, prev.count);
      sentences.push(
        `거래는 ${ym(latest.month)} ${latest.count.toLocaleString("ko-KR")}건으로 전월(${prev.count.toLocaleString(
          "ko-KR",
        )}건) 대비 ${Math.abs(vchg) < 1 ? "비슷한 수준" : `${Math.abs(vchg).toFixed(0)}% ${vchg > 0 ? "늘었" : "줄었"}습니다`}.`,
      );
    } else {
      sentences.push(`거래는 ${ym(latest.month)} ${latest.count.toLocaleString("ko-KR")}건입니다.`);
    }
    if (avg > 0) {
      const rel = latest.count / avg;
      sentences.push(
        `최근 ${volume.length}개월 월평균(${Math.round(avg).toLocaleString("ko-KR")}건)과 견주면 ${
          rel >= 1.3 ? "활발한" : rel <= 0.7 ? "한산한" : "평균 언저리의"
        } 달이었습니다(국토교통부 신고 기준, 신고 지연분은 이후 반영될 수 있음).`,
      );
    }
    paragraphs.push(sentences.join(" "));

    faq.push({
      q: `요즘 ${name} 아파트 거래는 활발한가요?`,
      a: `${ym(latest.month)} 신고 매매는 ${latest.count.toLocaleString("ko-KR")}건으로, 최근 ${
        volume.length
      }개월 월평균 ${Math.round(avg).toLocaleString("ko-KR")}건과 비교해 판단할 수 있습니다.`,
    });
  }

  /* ── 3. 전세가율 ── */
  if (input.jeonseRatio !== undefined && Number.isFinite(input.jeonseRatio)) {
    const r = input.jeonseRatio;
    paragraphs.push(
      `전세가율은 ${r.toFixed(1)}%입니다. 전세가율은 매매가 대비 전세가의 비율로, 높을수록 매매가와 전세가의 차이(갭)가 작다는 뜻입니다.`,
    );
  }

  /* ── 4. 입주 예정 공급 ── */
  const withHouseholds = input.supply.filter(
    (s): s is { households: number } => typeof s.households === "number" && s.households > 0,
  );
  if (withHouseholds.length > 0) {
    const total = withHouseholds.reduce((a, s) => a + s.households, 0);
    paragraphs.push(
      `입주 예정 물량은 확인된 단지 ${input.supply.length}${input.supplyCapped ? "곳 이상" : "곳"}, 세대수가 공개된 단지 기준 합계 ${total.toLocaleString(
        "ko-KR",
      )}세대입니다. 입주가 몰리는 시기에는 전세 공급이 늘어 가격에 영향을 줄 수 있습니다.`,
    );
    faq.push({
      q: `${name} 입주 예정 물량은 어느 정도인가요?`,
      a: `확인된 입주 예정 단지는 ${input.supply.length}${input.supplyCapped ? "곳 이상" : "곳"}이며, 세대수가 공개된 단지 합계는 약 ${total.toLocaleString("ko-KR")}세대입니다.`,
    });
  }

  /* ── FAQ 머리 질문 — 평균가 (데이터 있을 때만) ── */
  if (input.avgSaleLabel) {
    faq.unshift({
      q: `${name} 아파트 평균 매매가는 얼마인가요?`,
      a: `${input.periodLabel} 기준 평균 매매가는 ${input.avgSaleLabel}입니다. 단지·면적에 따라 차이가 크므로 단지별 실거래를 함께 확인하세요.`,
    });
  }

  return { paragraphs, faq: faq.slice(0, 4) };
}
