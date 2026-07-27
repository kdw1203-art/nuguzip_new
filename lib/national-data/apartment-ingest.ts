import "server-only";
/**
 * 전국 공동주택 단지 마스터 ETL
 * ─────────────────────────────────────────────────────────────────────
 * 국토교통부 공동주택 단지목록 API(AptListService2/getAptList)를 시군구 단위로
 * 페이징 조회해 `apartment_complexes` 테이블에 병합 upsert 한다.
 *
 * ── #150: 왜 적재 대상이 바뀌었나 ────────────────────────────────────
 * 이 모듈은 원래 `complexes` 테이블에 upsert 했다. **그 테이블은 운영 DB에 없다.**
 * PostgREST 는 없는 테이블에 대해 예외가 아니라 error 객체를 돌려주고, 아래 코드는
 * 그걸 logger.warn 으로만 남겼기 때문에 크론은 매번 200 OK 를 반환하면서
 * 한 행도 쓰지 않았다. 어드민 "데이터 신선도" 대시보드의 apt-master 카드는
 * 이미 apartment_complexes 를 보고 있었으므로, 카드가 안 움직이는 것이 유일한
 * 증상이었다 — 그리고 그건 "API 키가 없나 보다" 로 오인하기 딱 좋은 증상이다.
 *
 * ── 병합 upsert 인 이유(중요) ────────────────────────────────────────
 * apartment_complexes 의 source_key='k-apt-basic' 행 21,658건은 이미
 * roadAddress · heating · manageType · saleType · approvalDate 를 100% 채우고 있다.
 * 이 다섯 필드는 **단지 기본정보 API(AptBasisInfoService2/getAptsaleInfo)** 에서만
 * 나오고 여기서 쓰는 **단지 목록 API** 에는 아예 없다. 그래서 평범한 upsert 로
 * metadata 를 통째로 치환하면 21,658건의 난방·분양·관리 정보가 조용히 사라진다.
 * 그 사고를 코드 리뷰가 아니라 DB 가 막도록, 병합만 하는 RPC 를 통해서만 쓴다:
 *   public.upsert_apartment_complexes(rows jsonb)
 *   → metadata = 기존 || 신규, 신규의 null·빈 문자열 키는 병합 전에 제거.
 * (마이그레이션: upsert_apartment_complexes_merge)
 *
 * - 멱등: (source_key, external_id) 유니크 충돌 시 병합 → 재실행 안전.
 * - 환경 게이트: DATA_GO_KR 인증키 미설정 시 API가 mock/empty 를 반환하므로
 *   upsert 0건으로 안전하게 no-op 한다(예외 없음).
 * - 실패는 삼키지 않고 failed 카운트로 **올려보낸다** — 호출부(크론)가 이걸로
 *   market_ingest_log.status='error' 를 낼 수 있어야 하기 때문이다(F3/#147).
 */
import {
  fetchAptComplexDetail,
  fetchAptComplexList,
} from "@/lib/national-data/apartment-api";
import type { AptComplex, AptComplexDetail } from "@/lib/national-data/apartment-api";
import { getAllSido, getSigunguBySido } from "@/lib/national-data/region-codes";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { APT_MASTER_SOURCE_KEY } from "@/lib/complex/apartment-master";

const NUM_OF_ROWS = 100;
const MAX_PAGES = 20;
const UPSERT_BATCH = 200;

/* apartment_complexes.source_key — 이 ETL 이 소유하는 네임스페이스.
   값의 단일 출처는 lib/complex/apartment-master.ts 다(조회 측에서도 같은 값으로
   스코프해야 하는데, 그쪽이 이 ETL 모듈을 import 하면 공공데이터 API 클라이언트가
   페이지 번들에 딸려온다). 기존 import 경로를 깨지 않으려고 여기서 재export 한다. */
export { APT_MASTER_SOURCE_KEY };

/**
 * 전국 실제 시군구 코드 목록.
 * getAllSido().flatMap(getSigunguBySido) 에서 시도 레벨 행(sigungu === sido)과
 * "000"으로 끝나는 코드를 제외하고, sigunguCd 오름차순으로 정렬(결정적 순서).
 */
export function listAllSigunguCodes(): {
  sigunguCd: string;
  sido: string;
  sigungu: string;
}[] {
  return getAllSido()
    .flatMap(getSigunguBySido)
    .filter((i) => i.sigungu !== i.sido && !i.sigunguCd.endsWith("000"))
    .map((i) => ({ sigunguCd: i.sigunguCd, sido: i.sido, sigungu: i.sigungu }))
    .sort((a, b) => a.sigunguCd.localeCompare(b.sigunguCd));
}

/** 공백만 있는 값은 없는 값으로 본다(빈 문자열로 좋은 값을 덮지 않기 위해). */
function clean(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * 사용승인일 → YYYYMMDD.
 * 기존 행은 "19880116" 형태이고 complex-store 의 준공연도 추출이
 * `/^\d{8}$/` 로 검사한다(lib/complex/complex-store.ts). 8자리로 못 만들면
 * 키 자체를 넣지 않는다 — 형식이 어긋난 값은 준공연도를 조용히 null 로 만든다.
 */
function toApprovalDate(v: string | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

function toPositiveInt(v: string | undefined): number | null {
  const n = Number((v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** null 값을 제거한 얕은 객체 — RPC 도 한 번 더 걸러 주지만 전송량을 줄인다. */
function compact(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

/**
 * AptComplex → upsert_apartment_complexes RPC 행. 저장 불가(코드/이름 없음)면 null.
 *
 * metadata 키 이름은 **기존 21,658행의 모양을 그대로 따른다**. 같은 뜻의 값이
 * kaptCode/kapt_code 두 이름으로 섞이면 매칭하는 쪽(complex-store 의 D7 enrich)이
 * 어느 쪽을 봐야 하는지 알 수 없게 된다.
 *
 * householdCount 는 소스의 세대수(hhldCnt)를 그대로 싣는다. 기존 값이 상당수
 * 과대하다는 것이 알려져 있어 complex-store 는 이 값을 쓰지 않는데(거기 주석 참조),
 * 그렇다고 안 쓰면 영원히 낡은 값이 남는다 — 원본으로 계속 덮어 두는 편이 낫다.
 */
function toRpcRow(c: AptComplex, fallbackLawdCd: string): Record<string, unknown> | null {
  const kaptCode = clean(c.kaptCode);
  const name = clean(c.kaptName);
  if (!kaptCode || !name) return null;

  const sido = clean(c.as1);
  const sigungu = clean(c.as2);
  const emd = clean(c.as3);
  const jibun = clean(c.as4);
  const lawdCd = clean(c.sigunguCd) ?? clean(fallbackLawdCd);

  const regionLabel = [sido, sigungu, emd].filter(Boolean).join(" ") || null;
  const address = jibun ?? regionLabel;

  return {
    source_key: APT_MASTER_SOURCE_KEY,
    external_id: kaptCode,
    name,
    address,
    lawd_cd: lawdCd,
    metadata: compact({
      name,
      sido,
      sigungu,
      emd,
      lawdCd,
      kaptCode,
      regionLabel,
      jibunAddress: jibun,
      approvalDate: toApprovalDate(c.kaptUsedate),
      buildingCount: toPositiveInt(c.kaptDongCnt),
      householdCount: toPositiveInt(c.hhldCnt),
    }),
  };
}

export interface AptIngestResult {
  /** RPC 가 실제로 insert/update 한 행 수 */
  upserted: number;
  /** API 가 보고한 해당 시군구 전체 단지 수 */
  totalCount: number;
  /** 실제로 읽은 페이지 수 */
  pages: number;
  /** 적재하지 못한 행 수 (RPC 오류 배치의 크기 합) */
  failed: number;
  /** 첫 오류 메시지 — 크론 로그에 남길 용도 */
  error?: string;
}

/**
 * 단일 시군구의 단지목록을 페이징 조회 후 apartment_complexes 에 배치 병합 upsert.
 * 절대 throw 하지 않음 — 실패는 failed/error 로 반환해 호출부가 판단하게 한다.
 */
export async function ingestAptMasterForSigungu(
  sigunguCd: string,
  opts?: { maxPages?: number; numOfRows?: number },
): Promise<AptIngestResult> {
  const maxPages = opts?.maxPages ?? MAX_PAGES;
  const numOfRows = opts?.numOfRows ?? NUM_OF_ROWS;

  let upserted = 0;
  let totalCount = 0;
  let pages = 0;
  let failed = 0;
  let error: string | undefined;

  try {
    const sb = getServiceSupabase();

    // 단지코드 기준 중복 제거(같은 배치 내 ON CONFLICT 이중 갱신 방지).
    const byKaptCode = new Map<string, Record<string, unknown>>();

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      const { complexes, totalCount: tc, mode } = await fetchAptComplexList({
        sigunguCd,
        pageNo,
        numOfRows,
      });
      pages = pageNo;
      totalCount = tc;

      if (complexes.length === 0) break; // mock/empty 또는 마지막 페이지

      for (const c of complexes) {
        const row = toRpcRow(c, sigunguCd);
        if (row) byKaptCode.set(row.external_id as string, row);
      }

      if (mode === "mock") break; // 키 미설정 — 안전 no-op
      if (pageNo * numOfRows >= tc) break; // 전체 수집 완료
    }

    const rows = [...byKaptCode.values()];
    if (sb && rows.length > 0) {
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        const chunk = rows.slice(i, i + UPSERT_BATCH);
        const { data, error: rpcError } = await sb.rpc("upsert_apartment_complexes", {
          rows: chunk,
        });
        if (rpcError) {
          failed += chunk.length;
          error ??= rpcError.message;
          logger.warn("[apt-ingest] upsert 실패", {
            sigunguCd,
            rows: chunk.length,
            message: rpcError.message,
          });
        } else {
          // RPC 는 실제 반영 건수를 돌려준다. chunk.length 를 그대로 세면
          // 유효성 검사에서 걸러진 행까지 "적재됨"으로 보고하게 된다.
          upserted += Number(data) || 0;
        }
      }
    }
  } catch (err) {
    failed += 1;
    error ??= err instanceof Error ? err.message : String(err);
    logger.warn("[apt-ingest] ingest 실패", { sigunguCd, err });
  }

  return { upserted, totalCount, pages, failed, ...(error ? { error } : {}) };
}

/**
 * 주어진 시군구 코드들을 순차(딜레이 없음) 처리하며 카운트 합산.
 * 슬라이스 크기로 호출량을 bound 해 rate limit 을 존중한다.
 */
export async function ingestAptMasterBatch(
  sigunguCds: string[],
): Promise<{ sigungu: number; upserted: number; failed: number; errors: string[] }> {
  let sigungu = 0;
  let upserted = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const cd of sigunguCds) {
    const res = await ingestAptMasterForSigungu(cd);
    upserted += res.upserted;
    failed += res.failed;
    if (res.error && errors.length < 3) errors.push(`${cd}: ${res.error}`);
    sigungu += 1;
  }
  return { sigungu, upserted, failed, errors };
}

/* ══════════════════════════════════════════════════════════════════════
   단지 기본정보(AptBasisInfoService2) 상세 백필 — D7 잔여 과제
   ──────────────────────────────────────────────────────────────────────
   위 마스터 ETL 이 쓰는 단지 목록 API 에는 좌표·주차·건설사가 없다. 그 값들은
   단지 기본정보 API(getAptsaleInfo)에만 있는데, 지금까지는 읽기 경로
   (/api/apt/complexes/[kaptCode])에서만 조회하고 DB 에는 아무도 되쓰지 않아
   단지 허브와 지도가 계속 데이터 빈곤 상태였다. 여기서 하루 N건씩(기본 50)
   미보강 행을 골라 상세를 받아 metadata 에 병합한다.

   - 멱등/커서: 시도한 행에 metadata.detailFetchedAt 을 찍고, 선택 쿼리가
     detailFetchedAt 이 없는 행만 고른다(external_id 오름차순 — 결정적 순서).
     별도 커서 테이블 없이 매 실행이 이어달리기가 된다.
   - 실패 처리: 상세가 안 오는 단지(miss)도 스탬프를 찍는다 — 안 찍으면 같은
     50건이 매일 다시 뽑혀 파이프라인이 영원히 멈춘다. 단, 한 배치에서 성공이
     0건이면 API 장애일 가능성이 높으므로 아무 행에도 찍지 않고 error 로
     올려보낸다(장애날 50건을 miss 로 낙인찍지 않기 위해).
   - 쓰기는 마스터 ETL 과 같은 병합 RPC(upsert_apartment_complexes)만 쓴다 —
     통째 치환으로 기존 키를 지우는 사고를 DB 가 막게 하기 위해서다(위 주석 참조).
   - 지도 좌표 캐시(complex_geocode)에는 여기서 쓰지 않는다. 그 테이블의 키는
     실거래 이름 (region_name="서울 송파구", complex_name="리센츠") 인데 대장의
     이름은 "잠실리센츠"·"서울특별시" 꼴이라 키가 맞지 않는다 — 대장 이름으로
     행을 넣으면 지도 조회(getCachedCoordMap)에 절대 걸리지 않는 죽은 행만 쌓인다.
     대장 좌표는 metadata.lat/lng 로 저장하고, 단지 허브가 D7 이름 매칭을 통해
     소비한다(lib/complex/complex-store.ts). 실거래 키 → 좌표는 기존
     geocode-complexes 크론(네이버 지오코딩)이 계속 담당한다.
   ══════════════════════════════════════════════════════════════════════ */

/** 상세 API 호출 간 지연(ms) — 공공 API 를 정중하게 호출한다. */
const DETAIL_DELAY_MS = 60;

/**
 * 상세 조회 동시 실행 수.
 *
 * 2026-07-27: 예전엔 `for … await` 로 완전 순차였다. fetchAptComplexDetail 은
 * 단지 하나당 API 를 두 번(기본정보 V4 + 상세 V4) 부르므로 200개 배치면
 * **왕복 400회가 한 줄로** 늘어섰고, 회당 0.5초만 잡아도 200초 — 예산(270초)에
 * 거의 다 쓰여 한 라운드가 200개를 못 채우고 잘렸다. 그 결과 3만 9천 단지 중
 * 3,404개(8.6%)만 상세가 채워진 채 몇 달이 지났고, 지도 상세의 세대수가 "—" 로
 * 비어 보였다.
 *
 * 6으로 잡은 이유: data.go.kr 은 초당 수십 건을 견디지만 우리가 그 한계를
 * 시험할 이유가 없다. 6이면 순차 대비 약 6배(200개 ≈ 35초)로, 예산 안에서
 * 한 라운드가 상한을 다 채우고도 남는다. 429/5xx 가 보이면 이 값을 먼저 낮춘다.
 */
const DETAIL_CONCURRENCY = 6;

/**
 * 동시 실행 수를 제한한 map. 입력 순서대로 결과를 돌려준다.
 * (외부 의존성을 새로 들이지 않으려고 직접 둔다 — 하는 일이 이게 전부다.)
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 위경도 검증 — 한반도 밖 좌표는 버린다. 좌표는 지도에 바로 찍히는 값이라
 * (adapters.ts 의 molit-geocoder 주석과 같은 이유) 오염 위험이 가장 높다.
 */
function toKoreaCoord(
  latRaw: string | undefined,
  lngRaw: string | undefined,
): { lat: number; lng: number } | null {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 33 || lat > 39.5 || lng < 124 || lng > 132) return null;
  return { lat, lng };
}

/**
 * AptComplexDetail → metadata 병합 패치.
 * 키 이름은 기존 행의 모양을 따른다(roadAddress·heating·manageType·approvalDate 는
 * 이미 21,658행에 있는 키). 새로 들어가는 키는 builder·parkingCount·elevatorCount·
 * lat·lng 뿐이며, 좌표는 lat·lng 둘 다 유효할 때만 넣는다(한쪽만 있는 좌표는 좌표가 아니다).
 */
function toDetailPatch(d: AptComplexDetail): Record<string, unknown> {
  const coord = toKoreaCoord(d.lat, d.lng);
  return compact({
    roadAddress: clean(d.doroJuso),
    heating: clean(d.heatSplyMthdCd),
    manageType: clean(d.kaptMgrStle),
    builder: clean(d.kaptdaNm),
    parkingCount: toPositiveInt(d.parkingLotCnt),
    elevatorCount: toPositiveInt(d.elevCnt),
    approvalDate: toApprovalDate(d.kaptUsedate),
    buildingCount: toPositiveInt(d.kaptDongCnt),
    householdCount: toPositiveInt(d.hhldCnt),
    lat: coord?.lat ?? null,
    lng: coord?.lng ?? null,
  });
}

export interface AptDetailEnrichResult {
  /** 상세 조회를 시도한 행 수 */
  processed: number;
  /** 상세를 받아 metadata 에 병합한 행 수 */
  enriched: number;
  /** 상세를 받지 못한 행 수(miss + RPC 실패) */
  failed: number;
  /** 배치를 아예 시작하지 못한 사유 */
  skipped?: "no-service" | "no-rows";
  /** 첫 오류 메시지들(최대 3) — 크론 로그용 */
  errors: string[];
}

/**
 * 미보강 단지 상세 백필 배치. 절대 throw 하지 않음 — 마스터 ETL 과 같은 계약으로
 * 실패를 failed/errors 로 반환해 호출부(크론)가 적재 로그 status 를 판단한다.
 */
export async function enrichAptDetailBatch(limit: number): Promise<AptDetailEnrichResult> {
  const sb = getServiceSupabase();
  if (!sb) return { processed: 0, enriched: 0, failed: 0, skipped: "no-service", errors: [] };

  // external_id(=kaptCode)는 k-apt-basic 네임스페이스에서 항상 채워져 있다
  // (마스터 ETL 의 toRpcRow 가 kaptCode 없는 행을 저장하지 않는다).
  const { data, error: selectError } = await sb
    .from("apartment_complexes")
    .select("external_id, name, address, lawd_cd")
    .eq("source_key", APT_MASTER_SOURCE_KEY)
    .is("metadata->detailFetchedAt", null)
    .order("external_id", { ascending: true })
    .limit(limit);
  if (selectError) {
    return { processed: 0, enriched: 0, failed: limit, errors: [selectError.message] };
  }
  const rows =
    (data as
      | { external_id: string; name: string; address: string | null; lawd_cd: string | null }[]
      | null) ?? [];
  if (rows.length === 0) {
    return { processed: 0, enriched: 0, failed: 0, skipped: "no-rows", errors: [] };
  }

  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];
  // 병합 RPC 행 — name/address/lawd_cd 는 읽은 값을 그대로 되돌려 보낸다
  // (상세의 kaptName 으로 이름을 갈아치우면 이름 기반 신원(D7)이 흔들린다).
  const toWriteRow = (
    r: (typeof rows)[number],
    metadata: Record<string, unknown>,
  ): Record<string, unknown> => ({
    source_key: APT_MASTER_SOURCE_KEY,
    external_id: r.external_id,
    name: r.name,
    address: r.address,
    lawd_cd: r.lawd_cd,
    metadata,
  });

  const okRows: Record<string, unknown>[] = [];
  const missRows: Record<string, unknown>[] = [];
  /* DETAIL_CONCURRENCY 만큼 동시에 부른다(위 상수 주석에 이유). 각 워커는 자기
     호출 사이에만 짧게 쉬므로, 전체 호출률은 순차일 때의 약 6배로 유지된다. */
  const outcomes = await mapWithConcurrency(rows, DETAIL_CONCURRENCY, async (r) => {
    try {
      const { detail } = await fetchAptComplexDetail(r.external_id);
      await new Promise((res) => setTimeout(res, DETAIL_DELAY_MS));
      if (detail && detail.kaptCode) {
        return {
          kind: "ok" as const,
          row: toWriteRow(r, {
            ...toDetailPatch(detail),
            detailStatus: "ok",
            detailFetchedAt: fetchedAt,
          }),
        };
      }
      return {
        kind: "miss" as const,
        row: toWriteRow(r, { detailStatus: "miss", detailFetchedAt: fetchedAt }),
      };
    } catch (err) {
      await new Promise((res) => setTimeout(res, DETAIL_DELAY_MS));
      return {
        kind: "miss" as const,
        row: toWriteRow(r, { detailStatus: "miss", detailFetchedAt: fetchedAt }),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
  for (const o of outcomes) {
    if (o.kind === "ok") okRows.push(o.row);
    else missRows.push(o.row);
    if ("error" in o && o.error && errors.length < 3) errors.push(o.error);
  }

  // 성공이 0건이면 키 미설정 또는 API 장애다 — miss 스탬프를 찍지 않고 그대로
  // 반환한다(다음 실행이 같은 행을 다시 시도). 성공이 있으면 miss 도 찍어
  // 커서를 전진시킨다. miss 행은 metadata.detailStatus='miss' 로 남으므로
  // 나중에 재시도 배치를 따로 돌릴 수 있다.
  if (okRows.length === 0) {
    return { processed: rows.length, enriched: 0, failed: missRows.length, errors };
  }

  let enriched = 0;
  let failed = 0;
  const writeRows = [...okRows, ...missRows];
  for (let i = 0; i < writeRows.length; i += UPSERT_BATCH) {
    const chunk = writeRows.slice(i, i + UPSERT_BATCH);
    const { error: rpcError } = await sb.rpc("upsert_apartment_complexes", { rows: chunk });
    if (rpcError) {
      failed += chunk.length;
      if (errors.length < 3) errors.push(rpcError.message);
      logger.warn("[apt-detail-enrich] upsert 실패", {
        rows: chunk.length,
        message: rpcError.message,
      });
    }
  }
  // 상세 병합 성공 = ok 행 중 RPC 까지 통과한 수. ok/miss 를 한 배열로 썼으므로
  // RPC 실패 청크에 섞인 ok 행은 enriched 에서 빼고 failed 로 센다.
  const rpcFailedOk = Math.min(failed, okRows.length);
  enriched = okRows.length - rpcFailedOk;
  failed = missRows.length + rpcFailedOk;

  return { processed: rows.length, enriched, failed, errors };
}
