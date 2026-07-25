/**
 * A5 — 면적대·가격대 구간 정의 (단일 진실 공급원).
 *
 * ── 왜 따로 뺐나 ────────────────────────────────────────────────
 * 같은 면적 구간표가 두 곳에 글자 하나 다르지 않게 복사돼 있었다:
 *   - lib/complex/complex-store.ts  (getAreaBands, 만원 단위 반환)
 *   - lib/market/complex-transactions.ts (summarizeAreaBands, 원 단위 반환)
 * A5 는 이 구간을 URL 슬러그로까지 승격시킨다(/tx/[region]/area/60-85).
 * 세 번째 사본을 만들면 "페이지 제목은 85㎡인데 안에 담긴 거래는 84㎡ 기준"
 * 같은 사고가 조용히 일어난다. 그래서 여기 하나만 두고 둘 다 가져다 쓴다.
 *
 * app/map/map-client.tsx 에도 4구간짜리 다른 배열이 있지만 그건 지도 필터
 * 슬라이더용 UI 범위로 목적이 다르다 — 일부러 건드리지 않았다.
 *
 * ── SQL 과의 계약 ───────────────────────────────────────────────
 * 집계는 Postgres 뷰(public.tx_band_landing_source, tx_band_complex_source)가
 * 한다. PostgREST 가 GROUP BY 를 못 하기 때문이다. 즉 구간 경계가 SQL 과 TS
 * 양쪽에 존재한다 — 이건 위험하므로 규칙을 명시한다.
 *
 *   1) 경계를 바꾸려면 반드시 뷰와 이 파일을 같이 바꾼다.
 *   2) 한쪽만 바뀌면 TS 레지스트리에 없는 band_key 가 내려온다. 로더는 그런
 *      행을 **버리고 console.warn** 을 남긴다(lib/market/tx-bands.ts).
 *      페이지가 안 생기고 경고가 뜨는 쪽이, 틀린 라벨이 조용히 붙는 쪽보다 낫다.
 *
 * 경계는 모두 [min, max) 반열림 구간이다. 85.5㎡ 는 "85~102" 에 들어간다
 * (전용 84㎡ 가 60~85 에 남도록 한 기존 동작을 그대로 유지한 것).
 */

export type BandKind = "area" | "price";

export type AreaBand = {
  /** URL 슬러그 — 뷰의 band_key 와 같아야 한다 */
  slug: string;
  /** 화면 라벨 */
  label: string;
  /** 이상 (㎡) */
  min: number;
  /** 미만 (㎡) */
  max: number;
};

export type PriceBand = {
  /** URL 슬러그 — 뷰의 band_key 와 같아야 한다 */
  slug: string;
  /** 화면 라벨 */
  label: string;
  /** 이상 (원) */
  minKrw: number;
  /** 미만 (원) */
  maxKrw: number;
};

/** 전용면적 구간 — 뷰의 band_kind='area' 와 1:1 */
export const AREA_BANDS: readonly AreaBand[] = [
  { slug: "under-60", label: "~59㎡", min: 0, max: 60 },
  { slug: "60-85", label: "60~85㎡", min: 60, max: 85.5 },
  { slug: "85-102", label: "85~102㎡", min: 85.5, max: 102 },
  { slug: "102-135", label: "102~135㎡", min: 102, max: 135 },
  { slug: "over-135", label: "135㎡~", min: 135, max: Number.POSITIVE_INFINITY },
];

/** 거래금액 구간 — 뷰의 band_kind='price' 와 1:1 */
export const PRICE_BANDS: readonly PriceBand[] = [
  { slug: "under-3eok", label: "3억 미만", minKrw: 0, maxKrw: 3e8 },
  { slug: "3-6eok", label: "3~6억", minKrw: 3e8, maxKrw: 6e8 },
  { slug: "6-9eok", label: "6~9억", minKrw: 6e8, maxKrw: 9e8 },
  { slug: "9-15eok", label: "9~15억", minKrw: 9e8, maxKrw: 15e8 },
  { slug: "over-15eok", label: "15억 이상", minKrw: 15e8, maxKrw: Number.POSITIVE_INFINITY },
];

const AREA_BY_SLUG = new Map(AREA_BANDS.map((b) => [b.slug, b]));
const PRICE_BY_SLUG = new Map(PRICE_BANDS.map((b) => [b.slug, b]));

export function findAreaBand(slug: string): AreaBand | null {
  return AREA_BY_SLUG.get(slug) ?? null;
}

/**
 * 전용면적(㎡) → 해당 구간. 값이 없거나 0 이하면 null.
 *
 * `r.area_m2 >= band.min && r.area_m2 < band.max` 를 손으로 쓴 곳이 이미 세 군데
 * 있었다(complex-store · complex-transactions · 그리고 여기로 오기 전의 복사본).
 * 경계 판정은 이 파일이 단일 진실 공급원이라고 위에 적어 놓고 정작 판정식은
 * 흩어져 있으면, 경계를 옮길 때 한 곳을 빠뜨려도 아무 경고 없이 라벨만 어긋난다.
 */
export function areaBandOf(m2: number | null | undefined): AreaBand | null {
  if (m2 === null || m2 === undefined || !Number.isFinite(m2) || m2 <= 0) return null;
  return AREA_BANDS.find((b) => m2 >= b.min && m2 < b.max) ?? null;
}

export function findPriceBand(slug: string): PriceBand | null {
  return PRICE_BY_SLUG.get(slug) ?? null;
}

/** kind + slug → 라벨. 모르는 조합이면 null (호출부가 404 로 처리) */
export function bandLabel(kind: BandKind, slug: string): string | null {
  const b = kind === "area" ? findAreaBand(slug) : findPriceBand(slug);
  return b ? b.label : null;
}

/** kind 문자열 검증 — 라우트 파라미터를 그대로 신뢰하지 않기 위한 관문 */
export function isBandKind(value: string): value is BandKind {
  return value === "area" || value === "price";
}

/** 해당 종류의 슬러그 목록 (정적 경로 생성·허브 링크용) */
export function bandSlugs(kind: BandKind): string[] {
  return (kind === "area" ? AREA_BANDS : PRICE_BANDS).map((b) => b.slug);
}

export const BAND_KIND_LABEL: Record<BandKind, string> = {
  area: "면적대",
  price: "가격대",
};
