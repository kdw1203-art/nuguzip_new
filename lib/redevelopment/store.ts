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
 * 정비사업장 조회 — DB(redevelopment_projects) 우선, 비어있거나 조회 불가 시
 * 큐레이션 시드(공개 자료 정리본)로 폴백. RLS deny-all → read-only 헬퍼 경유.
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

/** DB에서 정비사업장 조회. 성공 시 행 배열(빈 배열 포함), 실패/미설정 시 null. */
async function fetchFromDb(f?: ProjectFilter): Promise<RedevelopmentProject[] | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  try {
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
    const { data, error } = await q;
    if (error) {
      // 테이블 미존재(42P01) 등은 시드 폴백 — 조용히 null.
      return null;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    return rows.map(mapRow).filter((x): x is RedevelopmentProject => x !== null);
  } catch (e) {
    logger.error("[redevelopment.fetchFromDb]", e);
    return null;
  }
}

/**
 * DB 확정 정비사업장만 조회 — 시드 폴백 없음(단지 상세 임베드 등 사실 우선용).
 * 조회 불가/미존재 시 빈 배열 → 호출측이 "표시 안 함"으로 처리.
 */
export async function listDbProjects(f?: ProjectFilter): Promise<RedevelopmentProject[]> {
  return (await fetchFromDb(f)) ?? [];
}

/** 정비사업장 목록 — DB 우선, 없으면 시드 폴백(필터 동일 적용). */
export async function listProjects(f?: ProjectFilter): Promise<RedevelopmentProject[]> {
  const db = await fetchFromDb(f);
  if (db && db.length > 0) return db;
  return applyFilter(SEED_PROJECTS, f);
}

/** 단일 정비사업장. */
export async function getProject(id: string): Promise<RedevelopmentProject | null> {
  const sb = getReadOnlySupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("redevelopment_projects")
        .select(COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (!error && data) return mapRow(data as Record<string, unknown>);
    } catch (e) {
      logger.error("[redevelopment.getProject]", e);
    }
  }
  return SEED_PROJECTS.find((p) => p.id === id) ?? null;
}

/** 시군구별 개수(필터 칩·군집 배지용). 현재 노출 데이터 기준. */
export async function countBySigungu(): Promise<{ sigungu: string; count: number }[]> {
  const list = await listProjects({ limit: 3000 });
  const m = new Map<string, number>();
  for (const p of list) m.set(p.sigungu, (m.get(p.sigungu) ?? 0) + 1);
  return [...m.entries()]
    .map(([sigungu, count]) => ({ sigungu, count }))
    .sort((a, b) => b.count - a.count);
}
