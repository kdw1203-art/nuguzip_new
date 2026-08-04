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
 * 요약 뷰는 지역 × (면적 5 + 가격 5) 규모다 — **2026-08-04 실측 1,662행**
 * (그중 MIN_BAND_TX 를 넘겨 페이지 자격이 있는 셀 1,403개 · 지역 214곳).
 * 한 번에 읽어 모듈 캐시에 올려두는 편이 페이지마다 조건 조회를 던지는 것보다
 * 싸고, 지역 허브/인덱스에서 "이 지역에 어떤 구간 페이지가 있나"를 계산하기도 쉽다.
 * 단지 목록(tx_band_complex_source)은 2026-08-04 실측 71,114행이라 페이지에서
 * 필요한 셀만 조회한다.
 *
 * 이 파일에 적힌 행 수는 **기준시점과 함께** 적는다. 예전엔 "최대 400행(현재
 * 384행)" 이라고만 적혀 있었고, 그 숫자를 믿고 걸어 둔 `.limit(1000)` 이
 * 뷰가 1,662행으로 자란 뒤 셀 403개를 조용히 잘라먹었다(최적화 31).
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
 *     즉 anon 으로 읽어도 열람 범위가 넓어지지 않는다(anon·service_role 동일 —
 *     2026-08-04 실측 1,662행 / 71,114행).
 * 새로 열어 주는 권한이 아니라, 이미 공개된 집계를 빌드가 읽게 하는 것뿐이다.
 *
 * ── 그런데 이 폴백만으로는 부족했다 (기록) ──────────────────────────
 * 위 조치를 배포한 뒤에도 /tx 는 계속 비어 있었다. 권한 문제가 아니라 **시간**
 * 문제였기 때문이다. 두 뷰는 원래 요청마다 market_transactions(당시 68,126행 —
 * 2026-08-04 현재 708,720행, 힙 640MB) 전체를
 * seq scan 하며 GROUP BY / percentile_cont / count(DISTINCT) 를 다시 계산했고,
 * anon 롤의 statement_timeout 은 3초다. 실측하니 anon 으로는 단순 count 조차
 * 3초를 넘겨 취소됐다 — 폴백은 붙었지만 그 폴백이 매번 타임아웃으로 죽고 있었다.
 *
 * 그래서 집계를 머티리얼라이즈드 뷰(market_agg 스키마)로 미리 계산해 두고,
 * 두 뷰의 본문을 `select * from <mv>` 로 바꿨다. 이름·컬럼·이 파일의 조회 코드는
 * 그대로다. 갱신은 lib/market/refresh-aggregates.ts 참고(인제스트 직후 + 하루 1회 크론).
 *
 * ── 2026-07-26: 세 번째로 같은 화면이 비었다. 이번엔 권한이었다 ──────────────
 * MV 로 내린 뒤에도 /tx 는 다시 "실거래 데이터를 불러오지 못했습니다" 로 돌아갔고
 * /sitemap-tx.xml 은 503 이었다. DB 에 직접 물어본 결과:
 *
 *   set local role service_role;
 *   select count(*) from public.tx_band_landing_source;
 *   → ERROR: 42501: permission denied for materialized view tx_band_landing_mv
 *
 * 마이그레이션 20260725042708 이 취소거래 필터를 넣으려고 MV 3개를 drop+create 했는데,
 * DROP MATERIALIZED VIEW 가 GRANT 를 같이 버린다는 걸 놓치고 바깥 뷰에만 다시 GRANT 를
 * 줬다. 두 뷰는 security_invoker = on 이라 **호출 롤이 MV 자체에** SELECT 를 들고
 * 있어야 하므로, 뷰 GRANT 는 아무 효과가 없었다. 복구는 20260726061500.
 * 복구 후 실측: tx_band_landing_source 1,723행 · tx_band_complex_source 70,830행
 * (anon·service_role 동일).
 *
 * ── 그래서 이 파일은 더 이상 실패를 빈 배열로 바꾸지 않는다 ──────────────────
 * 하루를 잃은 이유는 화면이 틀렸기 때문이 아니라 **아무도 몰랐기 때문**이다.
 * 42501 은 로그에 한 줄만 찍혔어도 즉시 잡혔을 오류인데, `return []` 이 그것을
 * "이 지역엔 거래가 없다" 와 구별 불가능한 상태로 만들어 버렸다.
 * 이제 조회 실패는 예외로 올린다. 부르는 쪽이 "못 읽었다" 와 "없다" 를 반드시
 * 구분하도록 강제하는 것이 목적이다(app/tx/page.tsx 참고).
 * 배포 전 감지는 scripts/check-source-views.mjs 가 맡는다.
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

/**
 * 요약 뷰 전체(구간 미달 포함).
 *
 * 실패하면 **던진다**. 예전엔 `return []` 이었고, 그 빈 배열이 "이 지역엔 거래가
 * 없다" 와 똑같이 생겨서 42501 권한 오류가 하루 동안 화면에 "데이터 없음" 으로
 * 위장됐다(위 헤더 참고). 성공한 결과만 캐시에 올린다 — 실패를 10분간
 * 캐시하면 복구가 그만큼 늦어진다.
 */
async function loadAllCells(): Promise<BandCell[]> {
  const now = Date.now();
  if (cellCache && now - cellCache.at < CELL_TTL_MS) return cellCache.data;
  /* single-flight: generateMetadata 와 본문이 같은 요청 안에서 이 함수를 연달아
     부른다. DB 가 느릴 때 각자 45초 예산을 따로 태우면 한 페이지가 90초를
     지불한다(/tx/[region] digest 3295104896 의 정체). 진행 중인 조회가 있으면
     그 약속을 같이 기다린다 — 실패를 캐시하는 게 아니라(그건 복구를 늦춘다)
     "동시에 두 번 묻지 않는" 것뿐이다. */
  if (cellInflight) return cellInflight;
  cellInflight = loadAllCellsUncached().finally(() => {
    cellInflight = null;
  });
  return cellInflight;
}

let cellInflight: Promise<BandCell[]> | null = null;

async function loadAllCellsUncached(): Promise<BandCell[]> {
  const now = Date.now();
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error(
      "tx_band_landing_source 를 읽을 수단이 없습니다 — SUPABASE_SERVICE_ROLE_KEY 도 " +
        "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY 도 설정되지 않았습니다.",
    );
  }

  /* 최적화 31 — `.limit(1000)` 이었다. 뷰가 400행이던 시절엔 넉넉한 상한이었지만
     2026-08-04 실측은 1,662행이고, 그중 MIN_BAND_TX(10건) 를 넘겨 **페이지를 가질
     자격이 있는 셀이 1,403개**다. 즉 403개 셀(면적 266 · 가격 137)과 지역 24곳이
     조용히 잘려 나가고 있었다. tx_count 내림차순이라 잘린 쪽은 상한 이하가 아니라
     "1,000등 밖"(실측 컷 56건)이었을 뿐, 자격 미달이 아니다.

     이건 성능이 아니라 사실 문제다. 잘린 셀은 /tx 지역 허브 링크·구간 랜딩·
     사이트맵에서 통째로 사라지고, `getTxCoverage().totalTx` 는 주석에 "면적이
     확인된 매매 신고분 전량" 이라고 쓰여 있는데 실제로는 잘린 나머지의 합이라
     화면에 **틀린 총계**가 나간다(면적대 기준 7,133건 누락).

     그래서 상한을 올리는 대신 끝까지 읽는다. 정렬은 tx_count 만으론 동점이 많아
     페이지 경계에서 행이 겹치거나 새기 때문에, (region_name, band_kind, band_key)
     로 전순서를 만든다. 안전 상한(MAX_PAGES)에 닿으면 **조용히 자르지 않고**
     error 로그를 남긴다 — 이 함수가 고치려는 병이 바로 "조용한 절단"이다. */
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 40; // 40,000행 — 현재 1,662행 대비 24배 여유
  const rows: CellRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await sb
      .from("tx_band_landing_source")
      .select(
        "region_name, band_kind, band_key, tx_count, complex_count, avg_krw, min_krw, max_krw, median_krw, avg_area_m2, avg_per_pyeong_krw, first_ym, latest_ym, last_data_at",
      )
      .order("tx_count", { ascending: false })
      .order("region_name", { ascending: true })
      .order("band_kind", { ascending: true })
      .order("band_key", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      // code·hint 를 반드시 함께 올린다. 이번 사고에서 필요했던 정보가 정확히 이 둘이다
      // ("42501" · "GRANT SELECT ON market_agg.tx_band_landing_mv TO service_role").
      throw new Error(
        `tx_band_landing_source 조회 실패(페이지 ${page + 1}, offset ${from}) — ${error.message}` +
          `${error.code ? ` [${error.code}]` : ""}` +
          `${error.hint ? ` · 힌트: ${error.hint}` : ""}`,
      );
    }

    const batch = (data ?? []) as CellRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) {
      logger.error(
        `[tx-bands] tx_band_landing_source 가 ${MAX_PAGES * PAGE_SIZE}행 상한에 닿았습니다 — ` +
          "이 뒤의 구간 셀은 페이지·사이트맵에서 빠집니다. MAX_PAGES 를 올리세요.",
      );
    }
  }

  const unknown = new Set<string>();
  const out: BandCell[] = [];
  for (const row of rows) {
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
  /**
   * 면적대 셀 기준 거래 건수. **그 지역 전체 매매 건수가 아니다** — `minTx`(기본 10건)
   * 미만이라 페이지를 만들지 않은 구간의 거래는 여기서 빠진다. 화면에 "전체 신고분"
   * 처럼 쓰면 사실과 어긋난다. 전체 대비 커버리지는 `getTxCoverage()` 로 얻는다.
   */
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

export type TxCoverage = {
  /** 구간 페이지를 가진 지역 수 */
  regions: number;
  /** 구간(면적대, minTx 이상)에 실제로 정리된 거래 건수 */
  coveredTx: number;
  /** 같은 집계의 면적대 셀 전체 합 = 면적이 확인된 매매 신고분 전량 */
  totalTx: number;
};

/**
 * 커버리지 — "정리된 건수"와 "전체 신고분"을 분리해서 돌려준다.
 *
 * 왜 필요한가: `/tx` 는 지역 카드의 `txCount` 합을 그대로 "N건"으로 찍고 있었는데,
 * 그 합은 10건 미만이라 구간을 만들지 않은 거래가 빠진 값이다. 실측으로 21,789건이
 * 찍혔지만 같은 기간 면적대 셀 전체 합은 21,960건이었다 — 171건 차이. 숫자 자체는
 * 집계에서 나온 진짜 값이지만, 문장이 "실거래 신고분"을 가리키면 171건을 없는 것처럼
 * 만든다. 두 값을 같이 노출해 그 차이를 화면에서 드러낸다.
 *
 * 추가 쿼리는 없다. `loadAllCells()` 가 이미 필터 이전의 전체 셀을 캐시하고 있어
 * 필터링 여부만 다르게 집계한다.
 */
export async function getTxCoverage(minTx = MIN_BAND_TX): Promise<TxCoverage> {
  const all = await loadAllCells();
  const areaCells = all.filter((c) => c.kind === "area");
  const kept = areaCells.filter((c) => c.txCount >= minTx);
  return {
    regions: new Set(all.filter((c) => c.txCount >= minTx).map((c) => c.regionName)).size,
    coveredTx: kept.reduce((s, c) => s + c.txCount, 0),
    totalTx: areaCells.reduce((s, c) => s + c.txCount, 0),
  };
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

/** 셀 안의 단지 목록 — 거래 많은 순. 조회 실패 시 던진다(loadAllCells 와 같은 이유). */
export async function listBandComplexes(
  regionName: string,
  kind: BandKind,
  bandSlug: string,
  limit = 30,
): Promise<BandComplex[]> {
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error("tx_band_complex_source 를 읽을 수단이 없습니다 — Supabase 접속 정보 미설정.");
  }

  const { data, error } = await sb
    .from("tx_band_complex_source")
    .select("complex_name, tx_count, avg_krw, max_krw, min_krw, avg_area_m2, latest_ym")
    .eq("region_name", regionName)
    .eq("band_kind", kind)
    .eq("band_key", bandSlug)
    .order("tx_count", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    throw new Error(
      `tx_band_complex_source 조회 실패 (${regionName}/${kind}/${bandSlug}) — ${error.message}` +
        `${error.code ? ` [${error.code}]` : ""}` +
        `${error.hint ? ` · 힌트: ${error.hint}` : ""}`,
    );
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
