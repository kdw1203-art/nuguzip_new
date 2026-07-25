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
import { fetchAptComplexList } from "@/lib/national-data/apartment-api";
import type { AptComplex } from "@/lib/national-data/apartment-api";
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
