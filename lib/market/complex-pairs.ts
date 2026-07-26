import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import {
  findComplexTxRegionByTransactionName,
  type ComplexTxRegion,
} from "@/lib/market/complex-transactions";

/**
 * N10 — "단지 A vs 단지 B" 비교 랜딩의 화이트리스트 로더.
 *
 * ── 이 파일이 조합을 만들지 않는다 ──────────────────────────────────────
 * 비교 페이지는 자동 생성으로 순식간에 수만 장이 되고, 그 대부분은 근거가 될
 * 거래가 없다. 기획 문서의 경계가 "거래가 얇은 조합의 비교 페이지 양산 금지"다.
 * 그래서 조합을 코드가 조립하지 않고 **DB 가 허락한 것만 읽는다**:
 * market_agg.complex_pair_mv 에 행이 있는 조합만 페이지가 되고, 나머지는 404 다.
 * 통과 기준(같은 동 · 양쪽 12개월 20건 이상 · 동별 거래 상위 3개 단지)은
 * supabase/migrations/20260726120000_complex_pair_source.sql 에 적혀 있다.
 *
 * ── 정렬을 JS 가 정하지 않는 이유 ──────────────────────────────────────
 * MV 는 `complex_a < complex_b` 로 조합마다 방향을 하나만 남긴다. 그 비교는
 * Postgres 콜레이션이고, JS 의 `<` 는 UTF-16 코드유닛 순서다. 단지명에는 영문·
 * 숫자·괄호·공백이 섞여 있어 두 순서가 갈릴 수 있다. 그래서 조회는 **두 방향을
 * 모두 받아들이고**(`.in()` 두 번), 정규 URL 은 조회로 돌아온 행이 정한다.
 * 이렇게 해야 콜레이션이 무엇이든 정규 주소가 하나로 수렴한다.
 *
 * ── getServiceSupabase() 가 아니라 getReadOnlySupabase() 인 이유 (2026-07-26 사고) ──
 * 이 파일은 처음에 getServiceSupabase() 를 썼고, 그 때문에 운영 /complex/compare 가
 * 배포 직후부터 한 시간 내내 이렇게 나갔다:
 *
 *   "비교 조합 목록을 불러오지 못했습니다.
 *    비교할 단지가 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻입니다."
 *
 * DB 는 멀쩡했다(service_role 로 count → 669). 런타임 로그에도 오류가 한 줄도 없었다.
 * 실패한 건 **빌드**다. /complex/compare 는 `revalidate = 3600` 이라 배포 산출물에
 * 프리렌더되는데, 프로덕션 빌드를 돌리는 GitHub Actions 의 `vercel build --prod`
 * 환경에는 SUPABASE_SERVICE_ROLE_KEY 가 없다. 클라이언트가 null → 로더가 던짐 →
 * **실패 화면이 HTML 에 그대로 구워져** 다음 재검증까지 모든 방문자·크롤러에게 나갔다.
 *
 * lib/market/tx-bands.ts 주석에 같은 사고가 이미 두 번 적혀 있고, 거기서 얻은 결론이
 * getReadOnlySupabase() 다 — Service Role 이 있으면 그대로 쓰고(운영 런타임 동작 불변)
 * 없을 때만 publishable 키로 폴백한다. 폴백이 실제로 읽으려면 anon 이 MV 와 뷰 양쪽에
 * SELECT 를 들고 있어야 한다(security_invoker = on 이라 바깥 뷰 GRANT 만으로는 안 된다).
 * 그 권한은 supabase/migrations/20260726140000_public_read_for_build_prerender.sql 에 있다.
 */

export interface ComplexPair {
  region: ComplexTxRegion;
  /** market_transactions 표기 그대로 — 로그·진단용 */
  regionName: string;
  /** 법정동 (주소에서 추출) */
  dong: string;
  /** 정규 순서 앞쪽 단지 */
  complexA: string;
  complexB: string;
  /** 최근 12개월 매매 신고 건수 */
  tradeCountA: number;
  tradeCountB: number;
  /** A + B — 사이트맵 정렬 기준 */
  pairTradeCount: number;
  /** 둘 중 더 최근인 계약월 yyyymm */
  lastContractYm: string | null;
  /** 둘 중 더 최근인 데이터 수집 시각 */
  lastDataAt: Date | null;
}

type SourceRow = {
  region_name: string | null;
  dong: string | null;
  complex_a: string | null;
  complex_b: string | null;
  trade_count_a: number | null;
  trade_count_b: number | null;
  pair_trade_count: number | null;
  last_contract_ym: string | null;
  last_data_at: string | null;
};

const SELECT =
  "region_name, dong, complex_a, complex_b, trade_count_a, trade_count_b, pair_trade_count, last_contract_ym, last_data_at";

function toPair(row: SourceRow): ComplexPair | null {
  if (!row.region_name || !row.dong || !row.complex_a || !row.complex_b) return null;
  // 내부 지역으로 되짚을 수 없는 표기는 버린다 — 링크·라벨을 만들 수 없고,
  // 억지로 붙이면 다른 지역 데이터가 이 페이지에 실린다.
  const region = findComplexTxRegionByTransactionName(row.region_name);
  if (!region) return null;
  const at = row.last_data_at ? new Date(row.last_data_at) : null;
  return {
    region,
    regionName: row.region_name,
    dong: row.dong,
    complexA: row.complex_a,
    complexB: row.complex_b,
    tradeCountA: Number(row.trade_count_a ?? 0),
    tradeCountB: Number(row.trade_count_b ?? 0),
    pairTradeCount: Number(row.pair_trade_count ?? 0),
    lastContractYm: row.last_contract_ym,
    lastDataAt: at && !Number.isNaN(at.getTime()) ? at : null,
  };
}

/* ---------- slug ---------- */

/** slug = encodeURIComponent(A) + "--" + encodeURIComponent(B) + "--" + regionId */
export function buildComplexPairSlug(
  complexA: string,
  complexB: string,
  regionId: string,
): string {
  return `${encodeURIComponent(complexA)}--${encodeURIComponent(complexB)}--${regionId}`;
}

export function complexPairPath(pair: ComplexPair): string {
  return `/complex/compare/${buildComplexPairSlug(pair.complexA, pair.complexB, pair.region.id)}`;
}

/**
 * slug 파싱 — 뒤에서부터 두 번 `--` 로 자른다(parseComplexTxSlug 와 같은 규칙).
 * 단지명에 `--` 가 들어가면 파싱이 어긋나므로 그런 단지는 MV 단계에서 이미
 * 제외돼 있다. 여기서는 형태만 본다.
 */
export function parseComplexPairSlug(
  rawSlug: string,
): { first: string; second: string; regionId: string } | null {
  let slug = rawSlug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    /* 그대로 사용 */
  }
  const sepRegion = slug.lastIndexOf("--");
  if (sepRegion <= 0 || sepRegion >= slug.length - 2) return null;
  const regionId = slug.slice(sepRegion + 2);
  if (!/^[a-z0-9-]+$/.test(regionId)) return null;

  const names = slug.slice(0, sepRegion);
  const sepName = names.lastIndexOf("--");
  if (sepName <= 0 || sepName >= names.length - 2) return null;

  const decode = (v: string): string => {
    try {
      return decodeURIComponent(v).trim();
    } catch {
      return v.trim();
    }
  };
  const first = decode(names.slice(0, sepName));
  const second = decode(names.slice(sepName + 2));
  if (!first || !second || first === second) return null;
  return { first, second, regionId };
}

/* ---------- 집계 창 ---------- */

/**
 * MV 와 **같은 창**을 JS 에서 다시 만든다.
 * SQL: `contract_ym >= to_char((now() at time zone 'Asia/Seoul') - interval '12 months','YYYYMM')`
 *
 * 왜 굳이 맞추나: 화면의 "최근 12개월 N건"과 월별 그래프의 막대 합이 다르면
 * 둘 중 하나는 거짓말이다. lib/market/complex-transactions.ts 의 summarizeMonthly 는
 * (지금−11개월)부터 12칸을 그리는 다른 창이라 여기서는 쓰지 않는다.
 */
export function pairWindowStartYm(): string {
  // 서버는 UTC 다 — KST 로 옮긴 뒤 UTC 게터로 읽으면 KST 달력이 된다.
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 12, 1));
  return `${start.getUTCFullYear()}${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 창의 계약월 목록 (오름차순). 시작월부터 이번 달까지 — 경계 포함이라 13칸이다. */
export function pairWindowMonths(): string[] {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const out: string[] = [];
  for (let back = 12; back >= 0; back -= 1) {
    const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - back, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/* ---------- 조회 ---------- */

/**
 * 조합 하나를 화이트리스트에서 찾는다. 순서는 어느 쪽이어도 되고, 돌아온 행의
 * complexA/complexB 가 정규 순서다.
 *
 * 조회 실패(권한·타임아웃)와 "그런 조합이 없다"를 구분하기 위해 실패는 던진다.
 * 호출부가 잡아서 404 로 바꾸면 크롤러에게 "영구히 없음"이라 말하게 되므로,
 * 페이지 쪽에서 두 경우를 다르게 다룬다.
 */
export async function findComplexPair(
  region: ComplexTxRegion,
  nameX: string,
  nameY: string,
): Promise<ComplexPair | null> {
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error("complex_pair_source: Supabase 읽기 키가 하나도 없어 조회할 수 없습니다.");
  }

  const { transactionRegionCandidates } = await import("@/lib/market/complex-transactions");
  const { data, error } = await sb
    .from("complex_pair_source")
    .select(SELECT)
    .in("region_name", transactionRegionCandidates(region))
    // 두 방향을 모두 받는다 — 정규 순서는 Postgres 콜레이션이 정하고,
    // 그 결과가 곧 canonical URL 이 된다.
    .in("complex_a", [nameX, nameY])
    .in("complex_b", [nameX, nameY])
    .limit(2);

  if (error) {
    throw new Error(
      `complex_pair_source 조회 실패 — ${error.message}${error.code ? ` [${error.code}]` : ""}`,
    );
  }
  for (const row of (data ?? []) as SourceRow[]) {
    const pair = toPair(row);
    if (pair) return pair;
  }
  return null;
}

/** PostgREST 기본 max-rows(1000) 이하로 끊어 읽는다. */
const PAGE_SIZE = 1000;

/**
 * 전체 조합 목록 (사이트맵·허브용). 정렬은 거래 합계 내림차순 + 이름 오름차순으로
 * **결정적**이어야 한다 — 페이지네이션 중 정렬이 흔들리면 행이 겹치거나 빠진다.
 *
 * 조회 실패는 던진다. 잘린 사이트맵은 빈 사이트맵보다 나쁘다(크롤러에게 나머지가
 * 존재하지 않는다고 적극적으로 거짓말하는 셈이다).
 */
export async function listComplexPairs(max = 10_000): Promise<ComplexPair[]> {
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error("complex_pair_source: Supabase 읽기 키가 하나도 없어 조회할 수 없습니다.");
  }

  const out: ComplexPair[] = [];
  let from = 0;
  const maxPages = Math.ceil(max / PAGE_SIZE) + 5;

  for (let page = 0; page < maxPages && from < max; page += 1) {
    const to = Math.min(from + PAGE_SIZE, max) - 1;
    const { data, error } = await sb
      .from("complex_pair_source")
      .select(SELECT)
      .order("pair_trade_count", { ascending: false })
      .order("region_name", { ascending: true })
      .order("complex_a", { ascending: true })
      .order("complex_b", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(
        `complex_pair_source 조회 실패 (page ${page}, range ${from}-${to}, 지금까지 ${out.length}개) — ` +
          `${error.message}${error.code ? ` [${error.code}]` : ""}`,
      );
    }
    const rows = (data ?? []) as SourceRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const pair = toPair(row);
      if (pair) out.push(pair);
    }
    // 받은 만큼만 전진 — "요청보다 적으면 마지막"으로 판단하면 서버의 max-rows 가
    // PAGE_SIZE 보다 작을 때 첫 페이지에서 조용히 잘린다.
    from += rows.length;
  }
  return out;
}
