import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";
import {
  AREA_BANDS,
  PRICE_BANDS,
  type BandKind,
} from "@/lib/market/bands";

/**
 * A5 — 지역 × 구간(면적대·가격대) 실거래 집계 로더 (서버 전용).
 *
 * ── 데이터 출처 ─────────────────────────────────────────────────
 * public.tx_band_landing_source   : 지역×구간 요약 (건수·평균·중앙값·평단가 등)
 * public.tx_band_complex_source   : 지역×구간 안에서 단지별 요약
 * 둘 다 market_transactions(국토교통부 실거래) 위의 뷰이고 security_invoker = on
 * 이라 원본 RLS 가 그대로 적용된다. 매물 호가가 아니라 **신고된 실거래**다.
 *
 * ── 왜 전부 한 번에 읽나 ─────────────────────────────────────────
 * 요약 뷰는 지역 40 × (면적 5 + 가격 5) = 최대 400행 규모다(현재 384행).
 * 한 번에 읽어 모듈 캐시에 올려두는 편이 페이지마다 조건 조회를 던지는 것보다
 * 싸고, 지역 허브/인덱스에서 "이 지역에 어떤 구간 페이지가 있나"를 계산하기도 쉽다.
 * 단지 목록(tx_band_complex_source)은 수천 행이라 페이지에서 필요한 셀만 조회한다.
 *
 * ── 드리프트 방어 ───────────────────────────────────────────────
 * 구간 경계는 SQL(뷰)과 TS(lib/market/bands.ts) 양쪽에 있다. 뷰가 먼저 바뀌면
 * TS 가 모르는 band_key 가 내려오는데, 그런 행은 **버리고 경고를 남긴다**.
 * 라벨을 추측해서 붙이면 "60~85㎡ 페이지에 102㎡ 거래가 들어있는" 상태가 조용히
 * 만들어진다. 부동산 숫자에서 그건 버그가 아니라 허위 정보다.
 *
 * ── 왜 Service Role 이 아니라 읽기 전용 클라이언트인가 ──────────────
 * 이 로더는 `next build` 중에도 돈다(/tx 와 구간 랜딩이 prerender 라우트다).
 * 빌드 환경에 Service Role 키가 없으면 getServiceSupabase() 가 null 을 주고,
 * 그러면 빈 배열이 그대로 HTML 에 굳어 "실거래 데이터를 불러오지 못했습니다" 가
 * revalidate 주기 내내(1시간) 모든 방문자·크롤러에게 나간다. 실제로 그랬다.
 *
 * getReadOnlySupabase() 는 Service Role 이 있으면 그대로 쓰고(운영 런타임 동작 불변),
 * 없을 때만 publishable 키로 폴백한다. 폴백이 안전한 근거:
 *   - market_transactions 에 `market_transactions_public_read`(SELECT, qual=true)
 *     정책이 있고 anon 에 SELECT 권한이 있다 — 국토교통부 공개 실거래 자료다.
 *   - 두 뷰 모두 security_invoker = on 이라 원본 RLS 가 그대로 적용된다.
 *     즉 anon 으로 읽어도 열람 범위가 넓어지지 않는다(실측: 384행 / 13,944행).
 * 새로 열어 주는 권한이 아니라, 이미 공개된 집계를 빌드가 읽게 하는 것뿐이다.
 *
 * ── 그런데 이 폴백만으로는 부족했다 (기록) ──────────────────────────
 * 위 조치를 배포한 뒤에도 /tx 는 계속 비어 있었다. 권한 문제가 아니라 **시간**
 * 문제였기 때문이다. 두 뷰는 원래 요청마다 market_transactions(68,126행) 전체를
 * seq scan 하며 GROUP BY / percentile_cont / count(DISTINCT) 를 다시 계산했고,
 * anon 롤의 statement_timeout 은 3초다. 실측하니 anon 으로는 단순 count 조차
 * 3초를 넘겨 취소됐다 — 폴백은 붙었지만 그 폴백이 매번 타임아웃으로 죽고 있었다.
 *
 * 그래서 집계를 머티리얼라이즈드 뷰(market_agg 스키마)로 미리 계산해 두고,
 * 두 뷰의 본문을 `select * from <mv>` 로 바꿨다. 이름·컬럼·이 파일의 조회 코드는
 * 그대로다. 지금은 anon 으로도 즉시 384행 / 13,944행이 나온다.
 * 갱신은 lib/market/refresh-aggregates.ts 참고(인제스트 직후 + 하루 1회 크론).
 */

/** 페이지·사이트맵에 올릴 최소 거래 건수. 표본이 너무 작으면 평균이 숫자놀음이 된다. */
export const MIN_BAND_TX = 10;

/** 지역 슬러그 — 공백만 하이픈으로. 한글은 그대로 두고 URL 인코딩은 링크에서 처리. */
export function regionToSlug(regionName: string): string {
  return regionName.trim().replace(/\s+/g, "-");
}

export type BandCell = {
  regionName: string;
  regionSlug: string;
  kind: BandKind;
  bandSlug: string;
  bandLabel: string;
  txCount: number;
  complexCount: number;
  avgKrw: number;
  minKrw: number;
  maxKrw: number;
  medianKrw: number;
  avgAreaM2: number | null;
  avgPerPyeongKrw: number | null;
  /** 이 셀에 담긴 거래의 첫 달 "YYYYMM" */
  firstYm: string | null;
  /** 마지막 달 "YYYYMM" */
  latestYm: string | null;
  /** 이 셀 데이터가 마지막으로 적재된 시각 — 사이트맵 lastmod 근거 */
  lastDataAt: Date | null;
};

type CellRow = {
  region_name: string | null;
  band_kind: string | null;
  band_key: string | null;
  tx_count: number | null;
  complex_count: number | null;
  avg_krw: number | string | null;
  min_krw: number | string | null;
  max_krw: number | string | null;
  median_krw: number | string | null;
  avg_area_m2: number | string | null;
  avg_per_pyeong_krw: number | string | null;
  first_ym: string | null;
  latest_ym: string | null;
  last_data_at: string | null;
};

const LABEL_BY_KEY: Record<BandKind, Map<string, string>> = {
  area: new Map(AREA_BANDS.map((b) => [b.slug, b.label])),
  price: new Map(PRICE_BANDS.map((b) => [b.slug, b.label])),
};

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function numOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/* 모듈 캐시 — ISR 재검증 주기(1시간)보다 짧게 둔다 */
const CELL_TTL_MS = 10 * 60 * 1000;
let cellCache: { at: number; data: BandCell[] } | null = null;

/** 요약 뷰 전체(구간 미달 포함). 조회 실패 시 빈 배열 — 페이지를 죽이지 않는다. */
async function loadAllCells(): Promise<BandCell[]> {
  const now = Date.now();
  if (cellCache && now - cellCache.at < CELL_TTL_MS) return cellCache.data;

  const sb = getReadOnlySupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("tx_band_landing_source")
    .select(
      "region_name, band_kind, band_key, tx_count, complex_count, avg_krw, min_krw, max_krw, median_krw, avg_area_m2, avg_per_pyeong_krw, first_ym, latest_ym, last_data_at",
    )
    .order("tx_count", { ascending: false })
    .limit(1000);

  if (error) {
    logger.warn("[tx-bands] loadAllCells", error.message);
    return [];
  }

  const unknown = new Set<string>();
  const out: BandCell[] = [];
  for (const row of (data ?? []) as CellRow[]) {
    const region = row.region_name?.trim();
    const kind = row.band_kind;
    const key = row.band_key;
    if (!region || !key) continue;
    if (kind !== "area" && kind !== "price") {
      unknown.add(`kind=${String(kind)}`);
      continue;
    }
    const label = LABEL_BY_KEY[kind].get(key);
    if (!label) {
      unknown.add(`${kind}:${key}`);
      continue;
    }
    const at = row.last_data_at ? new Date(row.last_data_at) : null;
    out.push({
      regionName: region,
      regionSlug: regionToSlug(region),
      kind,
      bandSlug: key,
      bandLabel: label,
      txCount: num(row.tx_count),
      complexCount: num(row.complex_count),
      avgKrw: num(row.avg_krw),
      minKrw: num(row.min_krw),
      maxKrw: num(row.max_krw),
      medianKrw: num(row.median_krw),
      avgAreaM2: numOrNull(row.avg_area_m2),
      avgPerPyeongKrw: numOrNull(row.avg_per_pyeong_krw),
      firstYm: row.first_ym ?? null,
      latestYm: row.latest_ym ?? null,
      lastDataAt: at && !Number.isNaN(at.getTime()) ? at : null,
    });
  }

  if (unknown.size > 0) {
    logger.warn(
      `[tx-bands] lib/market/bands.ts 에 없는 band_key 를 버렸습니다: ${[...unknown].join(
        ", ",
      )}. 뷰(tx_band_landing_source)와 구간표가 어긋났습니다 — 양쪽을 맞추세요.`,
    );
  }

  cellCache = { at: now, data: out };
  return out;
}

/** 페이지를 만들 자격이 있는 셀(거래 minTx건 이상)만 */
export async function listBandCells(minTx = MIN_BAND_TX): Promise<BandCell[]> {
  const all = await loadAllCells();
  return all.filter((c) => c.txCount >= minTx);
}

export type TxRegionSummary = {
  name: string;
  slug: string;
  /** 면적대 셀 기준 총 거래 건수 = 그 지역 전체 매매 건수 */
  txCount: number;
  complexCount: number;
  areaCells: BandCell[];
  priceCells: BandCell[];
  firstYm: string | null;
  latestYm: string | null;
  lastDataAt: Date | null;
};

/**
 * 지역 목록 — 구간 셀이 하나라도 있는 지역만.
 *
 * 거래 건수는 **면적대 셀 합**으로 센다. 면적/가격 두 축은 같은 거래를 다르게 자른
 * 것이라 둘을 더하면 정확히 두 배가 된다. 다만 면적대는 area_m2 가 있는 거래만
 * 잡히므로(뷰에서 not null 조건) 가격대 합보다 약간 작을 수 있다 — 이 값은
 * "면적이 확인된 매매" 건수라는 뜻이고, 화면에도 그렇게 쓰지 않도록 라벨을 맞춘다.
 */
export async function listTxRegions(minTx = MIN_BAND_TX): Promise<TxRegionSummary[]> {
  const cells = await listBandCells(minTx);
  const map = new Map<string, TxRegionSummary>();

  for (const c of cells) {
    let r = map.get(c.regionName);
    if (!r) {
      r = {
        name: c.regionName,
        slug: c.regionSlug,
        txCount: 0,
        complexCount: 0,
        areaCells: [],
        priceCells: [],
        firstYm: null,
        latestYm: null,
        lastDataAt: null,
      };
      map.set(c.regionName, r);
    }
    if (c.kind === "area") {
      r.areaCells.push(c);
      r.txCount += c.txCount;
      r.complexCount = Math.max(r.complexCount, c.complexCount);
    } else {
      r.priceCells.push(c);
    }
    if (c.firstYm && (!r.firstYm || c.firstYm < r.firstYm)) r.firstYm = c.firstYm;
    if (c.latestYm && (!r.latestYm || c.latestYm > r.latestYm)) r.latestYm = c.latestYm;
    if (c.lastDataAt && (!r.lastDataAt || c.lastDataAt > r.lastDataAt)) r.lastDataAt = c.lastDataAt;
  }

  // 구간 순서는 정의 순서(좁은 면적 → 넓은 면적, 낮은 가격 → 높은 가격)로 고정한다.
  const areaOrder = new Map(AREA_BANDS.map((b, i) => [b.slug, i]));
  const priceOrder = new Map(PRICE_BANDS.map((b, i) => [b.slug, i]));
  for (const r of map.values()) {
    r.areaCells.sort((a, b) => (areaOrder.get(a.bandSlug) ?? 99) - (areaOrder.get(b.bandSlug) ?? 99));
    r.priceCells.sort(
      (a, b) => (priceOrder.get(a.bandSlug) ?? 99) - (priceOrder.get(b.bandSlug) ?? 99),
    );
  }

  return [...map.values()].sort((a, b) => b.txCount - a.txCount || a.name.localeCompare(b.name, "ko"));
}

/** 슬러그 → 지역 요약. DB 에 있는 지역만 통과시킨다(임의 문자열은 null → 404). */
export async function findTxRegionBySlug(slug: string): Promise<TxRegionSummary | null> {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    /* 인코딩이 깨졌으면 원문 그대로 비교 */
  }
  const target = decoded.trim();
  const regions = await listTxRegions();
  return regions.find((r) => r.slug === target || r.name === target) ?? null;
}

/**
 * 지역 시세 페이지(/region/[id])의 지역을 실거래 지역으로 잇는다.
 *
 * 두 테이블의 지역 표기가 다르다:
 *   market_region_price : "강남구" · "고양시 덕양구"
 *   market_transactions : "서울 강남구" · "고양 덕양구"
 * lib/market/store.ts 의 transactionNameCandidates 와 같은 규칙이다. 그 함수는
 * 모듈 내부용(export 안 됨)이라 여기서 같은 변환을 다시 쓰되, 결과를 **실제
 * 존재하는 지역 목록과 대조**해서만 링크를 만든다. 추측한 이름으로 링크를 걸면
 * 404 로 이어지는 내부 링크가 생긴다.
 */
export async function findTxRegionForMarketRegion(
  regionId: string,
  regionName: string,
): Promise<TxRegionSummary | null> {
  const name = regionName.trim();
  if (!name) return null;
  const candidates = new Set<string>([name]);
  if (name.includes(" ")) {
    candidates.add(name.replace("시 ", " "));
  } else if (name.endsWith("구")) {
    candidates.add(regionId.startsWith("incheon-") ? `인천 ${name}` : `서울 ${name}`);
  }
  const regions = await listTxRegions();
  for (const c of candidates) {
    const hit = regions.find((r) => r.name === c);
    if (hit) return hit;
  }
  return null;
}

/** 특정 셀 하나 */
export async function getBandCell(
  regionName: string,
  kind: BandKind,
  bandSlug: string,
): Promise<BandCell | null> {
  const cells = await listBandCells();
  return (
    cells.find((c) => c.regionName === regionName && c.kind === kind && c.bandSlug === bandSlug) ??
    null
  );
}

export type BandComplex = {
  name: string;
  txCount: number;
  avgKrw: number;
  minKrw: number;
  maxKrw: number;
  avgAreaM2: number | null;
  latestYm: string | null;
};

type ComplexRow = {
  complex_name: string | null;
  tx_count: number | null;
  avg_krw: number | string | null;
  max_krw: number | string | null;
  min_krw: number | string | null;
  avg_area_m2: number | string | null;
  latest_ym: string | null;
};

/** 셀 안의 단지 목록 — 거래 많은 순. 조회 실패 시 빈 배열. */
export async function listBandComplexes(
  regionName: string,
  kind: BandKind,
  bandSlug: string,
  limit = 30,
): Promise<BandComplex[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("tx_band_complex_source")
    .select("complex_name, tx_count, avg_krw, max_krw, min_krw, avg_area_m2, latest_ym")
    .eq("region_name", regionName)
    .eq("band_kind", kind)
    .eq("band_key", bandSlug)
    .order("tx_count", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    logger.warn("[tx-bands] listBandComplexes", error.message);
    return [];
  }

  return ((data ?? []) as ComplexRow[])
    .filter((r) => Boolean(r.complex_name))
    .map((r) => ({
      name: String(r.complex_name),
      txCount: num(r.tx_count),
      avgKrw: num(r.avg_krw),
      minKrw: num(r.min_krw),
      maxKrw: num(r.max_krw),
      avgAreaM2: numOrNull(r.avg_area_m2),
      latestYm: r.latest_ym ?? null,
    }));
}

/**
 * 한 지역에서 같은 종류의 다른 구간들(현재 구간 제외) — 페이지 간 내부 링크용.
 * 프로그래매틱 SEO 는 페이지를 만드는 것보다 서로 이어 주는 게 실제 색인을 좌우한다.
 */
export async function listSiblingBands(
  regionName: string,
  kind: BandKind,
  exceptSlug: string,
): Promise<BandCell[]> {
  const region = await listTxRegions();
  const r = region.find((x) => x.name === regionName);
  if (!r) return [];
  const cells = kind === "area" ? r.areaCells : r.priceCells;
  return cells.filter((c) => c.bandSlug !== exceptSlug);
}
