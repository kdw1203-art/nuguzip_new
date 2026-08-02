import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";
import { SEED_PROJECTS } from "./seed";
import {
  isProjectTypeKey,
  isStageKey,
  type ProjectFilter,
  type RedevelopmentProject,
  type ProjectTypeKey,
  type StageKey,
} from "./types";

/**
 * 정비사업장 조회 — DB(redevelopment_projects) 가 정본이다.
 *
 * ── 시드 폴백을 좁힌 이유 (2026-07-27) ────────────────────────────────────
 * 예전에는 조회가 **어떤 이유로든** 실패하면 조용히 SEED_PROJECTS 로 넘어갔다.
 * 지금은 DB 와 시드가 같은 40건이라 화면상 차이가 없지만, 시드는 2026-07-22 에
 * 적재한 내용을 코드에 박아 둔 스냅샷이다. ingest.ts 가 한 번이라도 갱신하면
 * 시드는 옛 사실이 되고, 그때부터 조회 실패는 "옛 사실을 현재 사실인 척"
 * 내보내는 사고가 된다 — district-snapshot-store 의 SAMPLE_DAECHI 와 같은 종류다.
 *
 * 그래서 이제 시드는 **표 자체가 없을 때(42P01)** 에만 쓴다. 그 밖의 실패는
 * 던져서 화면이 "조회 실패"라고 정직하게 말하게 한다. 그리고 질의가 성공했으면
 * 0행이어도 그대로 0행을 돌려준다 — 없는 걸 시드로 채우지 않는다.
 *
 * anon 키로 내려가도 0행이 아니라 실제 40행이 보이도록 읽기 정책을 먼저 열었다
 * (마이그레이션 20260727025459). RLS 는 그대로 켜져 있고 쓰기는 service_role 뿐이다.
 */

const COLUMNS =
  "id,name,type_key,stage_key,sido,sigungu,address,lat,lng,households,summary,source,source_url,is_sample,updated_at";

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: Record<string, unknown>): RedevelopmentProject | null {
  const lat = num(r.lat);
  const lng = num(r.lng);
  if (lat == null || lng == null) return null;
  const typeKey = String(r.type_key ?? "virtual");
  const stageKey = String(r.stage_key ?? "designated");
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? "미정"),
    typeKey: (isProjectTypeKey(typeKey) ? typeKey : "virtual") as ProjectTypeKey,
    stageKey: (isStageKey(stageKey) ? stageKey : "designated") as StageKey,
    sido: String(r.sido ?? ""),
    sigungu: String(r.sigungu ?? ""),
    address: r.address != null ? String(r.address) : null,
    lat,
    lng,
    households: num(r.households),
    summary: r.summary != null ? String(r.summary) : null,
    source: r.source != null ? String(r.source) : null,
    sourceUrl: r.source_url != null ? String(r.source_url) : null,
    isSample: r.is_sample === true,
    updatedAt: r.updated_at != null ? String(r.updated_at) : null,
    asOf: null, // DB 적재분은 updated_at이 기준 시점 — asOf는 시드(수기 취합본) 전용
  };
}

function applyFilter(list: RedevelopmentProject[], f?: ProjectFilter): RedevelopmentProject[] {
  let out = list;
  if (f?.types && f.types.length) {
    const set = new Set(f.types);
    out = out.filter((p) => set.has(p.typeKey));
  }
  if (f?.stages && f.stages.length) {
    const set = new Set(f.stages);
    out = out.filter((p) => set.has(p.stageKey));
  }
  if (f?.sigungu) {
    out = out.filter((p) => p.sigungu === f.sigungu);
  }
  if (f?.bbox) {
    const b = f.bbox;
    out = out.filter(
      (p) => p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng,
    );
  }
  if (f?.limit && f.limit > 0) out = out.slice(0, f.limit);
  return out;
}

/** 표가 아예 없을 때만 시드로 내려간다 — 그 밖의 실패는 실패라고 말한다. */
function isMissingTable(err: { code?: string; message?: string }): boolean {
  return err.code === "42P01" || /does not exist/i.test(err.message ?? "");
}

/**
 * DB에서 정비사업장 조회.
 * - 성공: 행 배열(0행이면 빈 배열 — 시드로 채우지 않는다)
 * - 표 없음(42P01) / 클라이언트 미설정: null → 호출측이 시드를 쓸 수 있다
 * - 그 밖의 조회 실패: throw
 */
async function fetchFromDb(f?: ProjectFilter): Promise<RedevelopmentProject[] | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  {
    let q = sb.from("redevelopment_projects").select(COLUMNS);
    if (f?.types && f.types.length) q = q.in("type_key", f.types);
    if (f?.stages && f.stages.length) q = q.in("stage_key", f.stages);
    if (f?.sigungu) q = q.eq("sigungu", f.sigungu);
    if (f?.bbox) {
      q = q
        .gte("lat", f.bbox.minLat)
        .lte("lat", f.bbox.maxLat)
        .gte("lng", f.bbox.minLng)
        .lte("lng", f.bbox.maxLng);
    }
    q = q.limit(f?.limit && f.limit > 0 ? f.limit : 2000);
    if (f?.signal) q = q.abortSignal(f.signal);
    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) {
        logger.warn(`[redevelopment] redevelopment_projects 표가 없어 시드로 내려갑니다: ${error.message}`);
        return null;
      }
      throw new Error(`정비사업장 조회 실패 (redevelopment_projects): ${error.message}`);
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    return rows.map(mapRow).filter((x): x is RedevelopmentProject => x !== null);
  }
}

/**
 * DB 확정 정비사업장만 조회 — 시드 폴백 없음(단지 상세 임베드 등 사실 우선용).
 * 조회 불가/미존재 시 빈 배열 → 호출측이 "표시 안 함"으로 처리.
 */
export async function listDbProjects(f?: ProjectFilter): Promise<RedevelopmentProject[]> {
  return (await fetchFromDb(f)) ?? [];
}

/**
 * 정비사업장 목록 — DB 가 정본. 표가 없을 때만 시드로 내려간다.
 * 질의가 성공했으면 0행이어도 0행을 그대로 돌려준다(없는 걸 시드로 채우지 않는다).
 * 조회 실패는 fetchFromDb 가 던지고, 호출측 페이지가 "조회 실패"로 표시한다.
 */
export async function listProjects(f?: ProjectFilter): Promise<RedevelopmentProject[]> {
  const db = await fetchFromDb(f);
  if (db) return db;
  return applyFilter(SEED_PROJECTS, f);
}

/**
 * 단일 정비사업장. 없으면 null, 조회 실패는 던진다.
 * 표가 없을 때만 시드에서 찾는다 — 실패를 시드로 덮으면 옛 값이 현재 값인 척 나간다.
 */
export async function getProject(id: string): Promise<RedevelopmentProject | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return SEED_PROJECTS.find((p) => p.id === id) ?? null;

  const { data, error } = await sb
    .from("redevelopment_projects")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) {
      logger.warn(`[redevelopment] redevelopment_projects 표가 없어 시드로 내려갑니다: ${error.message}`);
      return SEED_PROJECTS.find((p) => p.id === id) ?? null;
    }
    throw new Error(`정비사업장 조회 실패 (${id}): ${error.message}`);
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/**
 * 시군구별 개수(필터 칩·군집 배지용) — 이미 읽어 온 목록에서 센다.
 * 목록을 그린 화면이라면 이 순수 함수를 쓴다. 같은 질의를 두 번 던지면
 * 두 결과가 서로 어긋날 수 있고(그 사이에 적재가 끼면), 그건 화면 안에서
 * 숫자가 서로 안 맞는다는 뜻이다.
 */
export function countBySigunguFrom(
  list: RedevelopmentProject[],
): { sigungu: string; count: number }[] {
  const m = new Map<string, number>();
  for (const p of list) m.set(p.sigungu, (m.get(p.sigungu) ?? 0) + 1);
  return [...m.entries()]
    .map(([sigungu, count]) => ({ sigungu, count }))
    .sort((a, b) => b.count - a.count);
}

/** 시군구별 개수 — 목록을 따로 읽어야 할 때. 현재 노출 데이터 기준. */
export async function countBySigungu(): Promise<{ sigungu: string; count: number }[]> {
  return countBySigunguFrom(await listProjects({ limit: 3000 }));
}
