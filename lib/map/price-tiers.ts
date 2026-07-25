/**
 * C1 — 지도 시세 색상 오버레이 구간표(단일 정본).
 *
 * ── 왜 "고정 절대 구간"인가 ────────────────────────────────────
 * 화면에 보이는 것들끼리 상대적으로 색을 매기면(뷰포트 상대 스케일) 같은 단지가
 * 지도를 옮길 때마다 색이 바뀐다. 김포만 띄우면 김포에서 제일 비싼 곳이 "빨강"이
 * 되고, 서울을 같이 띄우면 같은 곳이 "노랑"이 된다. 색이 사실을 말하지 않고
 * 화면 구성을 말하게 되는 것이라, 여기서는 전국 공통 절대 구간을 쓴다.
 *
 * ── 경계값 근거 ────────────────────────────────────────────────
 * 지오코딩된 508개 단지의 실거래 평단가 분포(2026-07 기준)를 재어 잡았다.
 *   2,000만원 미만 54개 · 2,000~3,500 135개 · 3,500~5,000 159개 ·
 *   5,000~7,000 87개 · 7,000만원 이상 73개
 * 지도가 실제로 색을 칠하는 단위인 그리드 셀(0.05°, 동 줌) 기준으로도
 * 73개 셀이 11/21/17/14/10 으로 갈려, 한 색으로 뭉개지지 않는다.
 * 어느 구간도 비어 있지 않고, 경계는 사람이 외우기 쉬운 값으로 반올림했다.
 * 데이터가 늘어 분포가 크게 달라지면 이 주석의 실측치와 함께 갱신할 것.
 *
 * ── 사실 우선 ──────────────────────────────────────────────────
 * 실거래가 없는 칸은 색을 칠하지 않는다. 회색 + "데이터 없음"이다.
 * 색을 비워 두는 편이, 없는 시세를 그럴듯한 색으로 채우는 것보다 정확하다.
 */

export type PriceTier = {
  slug: string;
  /** 하한(만원/평, 포함) */
  minManwon: number;
  /** 상한(만원/평, 미만). Infinity = 상한 없음 */
  maxManwon: number;
  /** 범례 표기 */
  label: string;
  /** 마커 배경색 */
  color: string;
  /** 배경 위 글자색 — 배경 명도에 맞춰 대비를 확보한다 */
  textColor: string;
};

/** 실거래가 없는 칸 — 색 대신 중립 회색 */
export const NO_DATA_COLOR = "#8b95a1";
export const NO_DATA_TEXT_COLOR = "#ffffff";
export const NO_DATA_LABEL = "데이터 없음";

/**
 * 낮은 값 → 높은 값 순. ColorBrewer YlOrRd 계열(명도가 단조 감소해
 * 색각 이상에서도 순서가 유지된다)에 글자 대비만 맞춰 조정했다.
 */
export const PRICE_TIERS: readonly PriceTier[] = [
  {
    slug: "t1",
    minManwon: 0,
    maxManwon: 2000,
    label: "2,000만원 미만",
    color: "#fed976",
    textColor: "#6b4a00",
  },
  {
    slug: "t2",
    minManwon: 2000,
    maxManwon: 3500,
    label: "2,000~3,500만원",
    color: "#feb24c",
    textColor: "#5c3300",
  },
  {
    slug: "t3",
    minManwon: 3500,
    maxManwon: 5000,
    label: "3,500~5,000만원",
    color: "#fd8d3c",
    textColor: "#4d2200",
  },
  {
    slug: "t4",
    minManwon: 5000,
    maxManwon: 7000,
    label: "5,000~7,000만원",
    color: "#f03b20",
    textColor: "#ffffff",
  },
  {
    slug: "t5",
    minManwon: 7000,
    maxManwon: Number.POSITIVE_INFINITY,
    label: "7,000만원 이상",
    color: "#bd0026",
    textColor: "#ffffff",
  },
];

/** 평단가(만원/평) → 구간. 값이 없거나 0 이하면 null(= 데이터 없음). */
export function findPriceTier(manwonPerPyeong: number | null | undefined): PriceTier | null {
  if (manwonPerPyeong == null) return null;
  if (!Number.isFinite(manwonPerPyeong) || manwonPerPyeong <= 0) return null;
  return (
    PRICE_TIERS.find((t) => manwonPerPyeong >= t.minManwon && manwonPerPyeong < t.maxManwon) ??
    null
  );
}

/** 마커 배경색 — 데이터가 없으면 중립 회색 */
export function tierColor(manwonPerPyeong: number | null | undefined): string {
  return findPriceTier(manwonPerPyeong)?.color ?? NO_DATA_COLOR;
}

/** 마커 글자색 — 배경색과 짝을 이룬다 */
export function tierTextColor(manwonPerPyeong: number | null | undefined): string {
  return findPriceTier(manwonPerPyeong)?.textColor ?? NO_DATA_TEXT_COLOR;
}

/** 평단가 라벨 — "4,020만/평". 값이 없으면 null(호출부가 "데이터 없음"을 고른다). */
export function pyeongPriceLabel(manwonPerPyeong: number | null | undefined): string | null {
  if (manwonPerPyeong == null) return null;
  if (!Number.isFinite(manwonPerPyeong) || manwonPerPyeong <= 0) return null;
  return `${Math.round(manwonPerPyeong).toLocaleString("ko-KR")}만/평`;
}

/** 원/평 → 만원/평. 소수점은 버린다(표시 단위가 만원이라 의미가 없다). */
export function krwPerPyeongToManwon(krwPerPyeong: number | null | undefined): number | null {
  if (krwPerPyeong == null) return null;
  if (!Number.isFinite(krwPerPyeong) || krwPerPyeong <= 0) return null;
  return Math.round(krwPerPyeong / 10_000);
}
