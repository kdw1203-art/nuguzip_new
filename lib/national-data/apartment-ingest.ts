import "server-only";
/**
 * 전국 공동주택 단지 마스터 ETL
 * ─────────────────────────────────────────────────────────────────────
 * 국토교통부 공동주택 단지목록 API(apartment-api.ts)를 시군구 단위로 페이징
 * 조회해 `complexes` 테이블에 upsert 한다. 지도 아파트명 검색을 위한 마스터
 * 데이터를 채우는 용도이며, lat/lng 는 별도 지오코딩 단계에서 채운다.
 *
 * - 멱등: id(=slug) 충돌 시 upsert → 재실행 안전.
 * - 환경 게이트: DATA_GO_KR 인증키 미설정 시 API가 mock/empty 를 반환하므로
 *   upsert 0건으로 안전하게 no-op 한다(예외 없음).
 */
import { fetchAptComplexList } from "@/lib/national-data/apartment-api";
import type { AptComplex } from "@/lib/national-data/apartment-api";
import { getAllSido, getSigunguBySido } from "@/lib/national-data/region-codes";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

const NUM_OF_ROWS = 100;
const MAX_PAGES = 20;
const UPSERT_BATCH = 200;

/**
 * complex-store 의 toSlug 와 동일한 규칙.
 * `${district}-${name}` → URL-safe, 소문자, ≤80자. id가 안정적/멱등적이도록 재사용.
 */
function toSlug(name: string, district: string): string {
  const base = `${district}-${name}`
    .replace(/\s+/g, "-")
    .replace(/[^가-힣a-zA-Z0-9-]/g, "");
  return base.toLowerCase().slice(0, 80);
}

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

/** AptComplex → complexes row. 저장 불가(코드/이름 없음)면 null. */
function toRow(c: AptComplex): Record<string, unknown> | null {
  if (!c.kaptCode || !c.kaptName) return null;
  const district = c.as2 ?? "";
  const city = c.as1 ?? "";
  const id = toSlug(c.kaptName, district);
  if (!id) return null;

  const address =
    c.as4 || [c.as1, c.as2, c.as3].filter(Boolean).join(" ") || null;

  return {
    id,
    kapt_code: c.kaptCode,
    name: c.kaptName,
    city,
    district,
    address,
    building_type: "아파트",
    households: Number(c.hhldCnt) || null,
    build_year: c.kaptUsedate ? Number(c.kaptUsedate.slice(0, 4)) || null : null,
    // lat/lng 는 설정하지 않음 — 별도 지오코딩 단계에서 채움.
  };
}

/**
 * 단일 시군구의 단지목록을 페이징 조회 후 complexes 에 배치 upsert.
 * 절대 throw 하지 않음 — try/catch 로 감싸 카운트만 반환.
 */
export async function ingestAptMasterForSigungu(
  sigunguCd: string,
  opts?: { maxPages?: number; numOfRows?: number },
): Promise<{ upserted: number; totalCount: number; pages: number }> {
  const maxPages = opts?.maxPages ?? MAX_PAGES;
  const numOfRows = opts?.numOfRows ?? NUM_OF_ROWS;

  let upserted = 0;
  let totalCount = 0;
  let pages = 0;

  try {
    const sb = getServiceSupabase();

    // id 기준 중복 제거(같은 배치 내 ON CONFLICT 이중 갱신 방지).
    const byId = new Map<string, Record<string, unknown>>();

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
        const row = toRow(c);
        if (row) byId.set(row.id as string, row);
      }

      if (mode === "mock") break; // 키 미설정 — 안전 no-op
      if (pageNo * numOfRows >= tc) break; // 전체 수집 완료
    }

    const rows = [...byId.values()];
    if (sb && rows.length > 0) {
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        const chunk = rows.slice(i, i + UPSERT_BATCH);
        const { error } = await sb
          .from("complexes")
          .upsert(chunk, { onConflict: "id" });
        if (error) {
          logger.warn("[apt-ingest] upsert 실패", {
            sigunguCd,
            message: error.message,
          });
        } else {
          upserted += chunk.length;
        }
      }
    }
  } catch (err) {
    logger.warn("[apt-ingest] ingest 실패", { sigunguCd, err });
  }

  return { upserted, totalCount, pages };
}

/**
 * 주어진 시군구 코드들을 순차(딜레이 없음) 처리하며 카운트 합산.
 * 슬라이스 크기로 호출량을 bound 해 rate limit 을 존중한다.
 */
export async function ingestAptMasterBatch(
  sigunguCds: string[],
): Promise<{ sigungu: number; upserted: number }> {
  let sigungu = 0;
  let upserted = 0;
  for (const cd of sigunguCds) {
    const res = await ingestAptMasterForSigungu(cd);
    upserted += res.upserted;
    sigungu += 1;
  }
  return { sigungu, upserted };
}
