import "server-only";

import { encodeComplexId } from "@/lib/complex/complex-store";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * G6 — 사이트맵 URL 수집 (단지).
 *
 * ── 왜 새로 만들었나 ────────────────────────────────────────────
 * app/sitemap.ts 는 `searchComplexes("", undefined, 2000)` 로 단지 URL 을 모았다.
 * 그런데 그 함수는 내부 조회를 `.limit(800)` 으로 묶어 두었기 때문에 2000 을 넘겨도
 * 800행(중복 제거 후 수백 개)보다 많이 나올 수 없었다. 게다가 `contract_ym desc`
 * 정렬이라 "최근 거래된 단지"만 걸렸다. 실제 단지는 5,147개인데 그중 대부분이
 * 사이트맵에 없었다 — 색인 자체가 안 되는 페이지가 4천 개 넘게 있었다는 뜻이다.
 *
 * PostgREST 는 GROUP BY 를 못 하므로 집계는 뷰(public.complex_sitemap_source)로
 * 내렸다. 뷰는 `security_invoker = on` 이라 원본 테이블의 RLS 가 그대로 적용된다.
 *
 * ── lastModified 를 사실로 ─────────────────────────────────────
 * 기존 코드는 모든 URL 에 `lastModified: new Date()` 를 찍었다. "방금 바뀌었다"를
 * 매 크롤마다 전 URL 에 대해 주장하는 것이고, 전부 거짓이면 크롤러는 이 신호를
 * 통째로 무시한다. 그래서 진짜로 바뀐 시점만 적는다.
 *
 * 뷰의 last_data_at = max(created_at) 이다. updated_at 이 아닌 이유는 ETL 이 매
 * 실행마다 전 행을 upsert 해서 updated_at 이 한 날짜로 일괄로 밀리기 때문이다
 * (확인: trade 전 행의 updated_at 이 2026-07-17 하루에 몰려 있음). created_at 은
 * 행이 처음 들어온 시각이라 행마다 유지되고, 단지별 최대값은 곧 "이 단지 페이지가
 * 마지막으로 새 정보를 얻은 시점"이다.
 */

/** 사이트맵 1파일당 URL 상한 (sitemaps.org·Google 공통). 넘으면 파일 전체가 거부된다. */
export const SITEMAP_URL_LIMIT = 50_000;

/** PostgREST 한 번에 가져올 행 수 — 기본 max-rows(1000)를 넘지 않게 맞춘다 */
const PAGE_SIZE = 1000;

export type ComplexSitemapEntry = {
  /** /complex/[id] 의 id — base64url(region_name + SEP + complex_name) */
  id: string;
  /** 이 단지 데이터가 마지막으로 들어온 시각. 값이 없으면 undefined(주장하지 않음) */
  lastModified?: Date;
  /** 매매 실거래 건수 — 상한 초과 시 무엇을 남길지 정하는 기준 */
  tradeCount: number;
};

type SourceRow = {
  region_name: string | null;
  complex_name: string | null;
  last_data_at: string | null;
  trade_count: number | null;
};

/**
 * 실거래가 1건이라도 있는 모든 단지의 사이트맵 항목.
 *
 * 정렬은 거래 건수 내림차순 + 이름 오름차순으로 **결정적**이어야 한다. 페이지네이션
 * 중 정렬이 흔들리면 같은 행이 두 번 나오거나 아예 빠진다.
 *
 * 조회 실패 시 빈 배열 — 사이트맵 전체를 죽이지 않는다.
 */
export async function listComplexSitemapEntries(
  max = SITEMAP_URL_LIMIT,
): Promise<ComplexSitemapEntry[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];

  const out: ComplexSitemapEntry[] = [];
  let from = 0;
  // 페이지 수 상한 — 서버가 예상 밖으로 적게 돌려줘도 무한 루프로 가지 않게 한다.
  const maxPages = Math.ceil(max / PAGE_SIZE) + 5;

  for (let page = 0; page < maxPages && from < max; page += 1) {
    const to = Math.min(from + PAGE_SIZE, max) - 1;
    const { data, error } = await sb
      .from("complex_sitemap_source")
      .select("region_name, complex_name, last_data_at, trade_count")
      .order("trade_count", { ascending: false })
      .order("region_name", { ascending: true })
      .order("complex_name", { ascending: true })
      .range(from, to);

    if (error) break;
    const rows = (data ?? []) as SourceRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.region_name || !row.complex_name) continue;
      const at = row.last_data_at ? new Date(row.last_data_at) : null;
      out.push({
        id: encodeComplexId(row.region_name, row.complex_name),
        lastModified: at && !Number.isNaN(at.getTime()) ? at : undefined,
        tradeCount: Number(row.trade_count ?? 0),
      });
    }

    // 받은 만큼만 전진한다. "요청한 개수보다 적으면 마지막 페이지"로 판단하면
    // PostgREST 의 max-rows 설정이 PAGE_SIZE 보다 작을 때 첫 페이지에서 멈춰
    // 조용히 잘려 나간다 — 지금 고치려는 버그와 똑같은 모양이 된다.
    from += rows.length;
  }
  return out;
}

/* ---------- A5: 지역 × 구간(면적대·가격대) 랜딩 ---------- */

export type BandSitemapEntry = {
  /** 사이트맵에 그대로 넣을 경로 — 이미 URL 인코딩되어 있다 */
  path: string;
  lastModified?: Date;
  /** 지역 허브(true)인지 구간 랜딩(false)인지 — priority 를 다르게 준다 */
  isHub: boolean;
};

/**
 * /tx 계열 URL 목록 — 지역 허브 + 그 아래 면적대·가격대 랜딩.
 *
 * 거래 10건 미만 셀은 애초에 페이지가 없으므로(tx-bands.listBandCells) 여기에도
 * 나오지 않는다. 사이트맵에 있는데 404 인 URL 은 색인 신뢰도를 깎는다.
 *
 * 경로에 한글이 들어가므로 encodeURIComponent 로 감싼다. sitemaps.org 규격상
 * URL 은 이스케이프된 형태여야 하고, 크롤러가 raw UTF-8 을 받아 주더라도
 * 규격을 지키는 쪽이 안전하다.
 *
 * lastModified 는 뷰의 last_data_at(= max(created_at))이다. 그 셀에 마지막으로
 * 새 거래가 들어온 시각이라는 확인된 사실이며, 없으면 적지 않는다.
 */
export async function listBandSitemapEntries(): Promise<BandSitemapEntry[]> {
  const { listTxRegions } = await import("@/lib/market/tx-bands");
  const regions = await listTxRegions();
  const out: BandSitemapEntry[] = [];

  for (const region of regions) {
    const slug = encodeURIComponent(region.slug);
    out.push({
      path: `/tx/${slug}`,
      ...(region.lastDataAt ? { lastModified: region.lastDataAt } : {}),
      isHub: true,
    });
    for (const cell of [...region.areaCells, ...region.priceCells]) {
      out.push({
        path: `/tx/${slug}/${cell.kind}/${cell.bandSlug}`,
        ...(cell.lastDataAt ? { lastModified: cell.lastDataAt } : {}),
        isHub: false,
      });
    }
  }
  return out;
}

/**
 * "YYYYMM" → 그 달 1일(UTC). 형식이 아니면 undefined.
 *
 * 지역 스냅샷(market_region_price)에는 갱신 시각이 사실상 없다 — updated_at 은
 * 61개 지역이 전부 같은 날짜로 밀려 있어 "언제 바뀌었나"를 말해주지 않는다.
 * 대신 period 는 "이 숫자가 몇 월 자료인가"라는 확인된 사실이므로 그것만 적는다.
 * 실제 갱신 시점보다 이르게(보수적으로) 잡히지만, 없는 최신성을 지어내지 않는다.
 */
export function periodToDate(period: string | undefined | null): Date | undefined {
  if (!period) return undefined;
  const m = /^(\d{4})(\d{2})$/.exec(period.trim());
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return undefined;
  const d = new Date(Date.UTC(year, month - 1, 1));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * URL 상한 가드. 넘치면 잘라내되 **조용히** 넘어가지 않는다.
 *
 * 사이트맵이 50,000 을 넘으면 검색엔진이 파일을 통째로 거부하므로, 넘치는 순간은
 * "인덱스 분할이 필요해진 시점"이다. 그때가 언제인지 로그에 남겨야 알 수 있다.
 */
export function capSitemapUrls<T>(entries: T[], limit = SITEMAP_URL_LIMIT): T[] {
  if (entries.length <= limit) return entries;
  console.warn(
    `[sitemap] URL ${entries.length}개가 1파일 상한 ${limit}개를 넘어 ${
      entries.length - limit
    }개를 잘랐습니다. sitemap 인덱스 분할(chunkSitemap)이 필요합니다.`,
  );
  return entries.slice(0, limit);
}

/** 인덱스 분할용 — 상한 넘칠 때 /sitemap/[n].xml 로 쪼개기 위한 준비물 */
export function chunkSitemap<T>(entries: T[], size = SITEMAP_URL_LIMIT): T[][] {
  if (size <= 0) return [entries];
  const chunks: T[][] = [];
  for (let i = 0; i < entries.length; i += size) chunks.push(entries.slice(i, i + size));
  return chunks.length > 0 ? chunks : [[]];
}
