import { getServiceSupabase } from "@/lib/supabase/service";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { PlatformShell } from "@/lib/platform-shell";

export type AiAnalysisPreset = {
  id: string;
  authorEmail: string;
  tool: AiAnalysisToolId;
  title: string;
  objective: Record<string, unknown>;
  objectiveHash: string | null;
  subjectiveMemo: string;
  pinned: boolean;
  pinnedAt: string | null;
  lastResultExcerpt: string | null;
  lastModelId: string | null;
  lastSource: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiAnalysisRunRow = {
  id: string;
  authorEmail: string;
  presetId: string | null;
  tool: AiAnalysisToolId;
  inputSnapshot: Record<string, unknown>;
  publicContextSnapshot: Record<string, unknown> | null;
  modelId: string | null;
  source: string | null;
  platform: PlatformShell;
  structuredSummary: AiRunStructuredSummary | null;
  markdown: string;
  /** input_snapshot 에서 추출한 지역/단지 인덱스 (지역별 내 기록 조회용) */
  districtId: string | null;
  complexId: string | null;
  createdAt: string;
};

export type AiRunStructuredSummary = {
  headline: string;
  bullets: string[];
  score: number | null;
  tags: string[];
};

const memPresets: AiAnalysisPreset[] = [];
const memRuns: AiAnalysisRunRow[] = [];

function mapPreset(row: Record<string, unknown>): AiAnalysisPreset {
  return {
    id: String(row.id),
    authorEmail: String(row.author_email),
    tool: String(row.tool) as AiAnalysisToolId,
    title: String(row.title ?? ""),
    objective: (row.objective as Record<string, unknown>) ?? {},
    objectiveHash: row.objective_hash != null ? String(row.objective_hash) : null,
    subjectiveMemo: String(row.subjective_memo ?? ""),
    pinned: row.pinned === true,
    pinnedAt: row.pinned_at != null ? String(row.pinned_at) : null,
    lastResultExcerpt: row.last_result_excerpt != null ? String(row.last_result_excerpt) : null,
    lastModelId: row.last_model_id != null ? String(row.last_model_id) : null,
    lastSource: row.last_source != null ? String(row.last_source) : null,
    lastRunAt: row.last_run_at != null ? String(row.last_run_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function extractPublicContextSnapshot(
  snapshot: Record<string, unknown>,
): Record<string, unknown> | null {
  const meta = snapshot._meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const ctx = (meta as Record<string, unknown>).publicContextSnapshot;
    if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
      return ctx as Record<string, unknown>;
    }
  }
  return null;
}

function mapRun(row: Record<string, unknown>): AiAnalysisRunRow {
  const platform = row.platform === "mobile" ? "mobile" : "desktop";
  const summary =
    row.structured_summary && typeof row.structured_summary === "object"
      ? (row.structured_summary as AiRunStructuredSummary)
      : null;
  const inputSnapshot = (row.input_snapshot as Record<string, unknown>) ?? {};
  const colSnapshot =
    row.public_context_snapshot &&
    typeof row.public_context_snapshot === "object" &&
    !Array.isArray(row.public_context_snapshot)
      ? (row.public_context_snapshot as Record<string, unknown>)
      : null;
  const extracted = extractRegionKeys(inputSnapshot);
  return {
    id: String(row.id),
    authorEmail: String(row.author_email),
    presetId: row.preset_id != null ? String(row.preset_id) : null,
    tool: String(row.tool) as AiAnalysisToolId,
    inputSnapshot,
    publicContextSnapshot: colSnapshot ?? extractPublicContextSnapshot(inputSnapshot),
    modelId: row.model_id != null ? String(row.model_id) : null,
    source: row.source != null ? String(row.source) : null,
    platform,
    structuredSummary: summary,
    markdown: String(row.markdown ?? ""),
    districtId: row.district_id != null ? String(row.district_id) : extracted.districtId,
    complexId: row.complex_id != null ? String(row.complex_id) : extracted.complexId,
    createdAt: String(row.created_at),
  };
}

/**
 * input_snapshot 에서 지역(구)·단지 키를 best-effort 추출.
 * 도구마다 필드명이 달라(regionDistrictId / timingDistrictIds / complexId 등)
 * 공통 후보를 순서대로 확인한다.
 */
export function extractRegionKeys(
  snapshot: Record<string, unknown>,
): { districtId: string | null; complexId: string | null } {
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  let districtId =
    str(snapshot.regionDistrictId) ??
    str(snapshot.districtId) ??
    str((snapshot as { region?: unknown }).region);
  if (!districtId && Array.isArray(snapshot.timingDistrictIds)) {
    const first = snapshot.timingDistrictIds.find((x) => typeof x === "string" && x.trim());
    districtId = typeof first === "string" ? first : null;
  }
  const complexId = str(snapshot.complexId) ?? str((snapshot as { complex_id?: unknown }).complex_id);
  return { districtId: districtId ?? null, complexId };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function objectiveHash(objective: Record<string, unknown>): string {
  return hashString(stableStringify(objective));
}

export async function listPresets(
  authorEmail: string,
  tool?: AiAnalysisToolId,
): Promise<AiAnalysisPreset[]> {
  const em = authorEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    return memPresets
      .filter((p) => p.authorEmail.toLowerCase() === em)
      .filter((p) => !tool || p.tool === tool)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.updatedAt < b.updatedAt ? 1 : -1;
      });
  }
  let q = sb
    .from("ai_analysis_presets")
    .select("*")
    .eq("author_email", em)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(200);
  if (tool) q = q.eq("tool", tool);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map((r) => mapPreset(r as Record<string, unknown>));
}

export async function getPreset(
  id: string,
  authorEmail: string,
): Promise<AiAnalysisPreset | null> {
  const em = authorEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    return (
      memPresets.find(
        (p) => p.id === id && p.authorEmail.toLowerCase() === em,
      ) ?? null
    );
  }
  const { data } = await sb
    .from("ai_analysis_presets")
    .select("*")
    .eq("id", id)
    .eq("author_email", em)
    .maybeSingle();
  return data ? mapPreset(data as Record<string, unknown>) : null;
}

export async function createPreset(input: {
  authorEmail: string;
  tool: AiAnalysisToolId;
  title: string;
  objective: Record<string, unknown>;
  subjectiveMemo: string;
}): Promise<AiAnalysisPreset> {
  const now = new Date().toISOString();
  const em = input.authorEmail.trim().toLowerCase();
  const oh = objectiveHash(input.objective);
  const sb = getServiceSupabase();
  if (!sb) {
    const dup = memPresets.find(
      (p) => p.authorEmail.toLowerCase() === em && p.tool === input.tool && p.objectiveHash === oh,
    );
    if (dup) throw new Error(`DUPLICATE_PRESET:${dup.id}`);
    const p: AiAnalysisPreset = {
      id: `mem-${Date.now().toString(36)}`,
      authorEmail: em,
      tool: input.tool,
      title: input.title.trim() || "제목 없음",
      objective: input.objective,
      objectiveHash: oh,
      subjectiveMemo: input.subjectiveMemo,
      pinned: false,
      pinnedAt: null,
      lastResultExcerpt: null,
      lastModelId: null,
      lastSource: null,
      lastRunAt: null,
      createdAt: now,
      updatedAt: now,
    };
    memPresets.unshift(p);
    return p;
  }
  const dup = await sb
    .from("ai_analysis_presets")
    .select("id")
    .eq("author_email", em)
    .eq("tool", input.tool)
    .eq("objective_hash", oh)
    .maybeSingle();
  if (dup.data?.id) throw new Error(`DUPLICATE_PRESET:${dup.data.id}`);
  const { data, error } = await sb
    .from("ai_analysis_presets")
    .insert({
      author_email: em,
      tool: input.tool,
      title: input.title.trim() || "제목 없음",
      objective: input.objective,
      objective_hash: oh,
      subjective_memo: input.subjectiveMemo,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return mapPreset(data as Record<string, unknown>);
}

export async function updatePreset(
  id: string,
  authorEmail: string,
  patch: {
    title?: string;
    objective?: Record<string, unknown>;
    subjectiveMemo?: string;
    lastResultExcerpt?: string | null;
    lastModelId?: string | null;
    lastSource?: string | null;
    lastRunAt?: string | null;
    pinned?: boolean;
  },
): Promise<AiAnalysisPreset | null> {
  const em = authorEmail.trim().toLowerCase();
  const now = new Date().toISOString();
  const sb = getServiceSupabase();
  const row: Record<string, unknown> = { updated_at: now };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.objective !== undefined) row.objective = patch.objective;
  if (patch.subjectiveMemo !== undefined) row.subjective_memo = patch.subjectiveMemo;
  if (patch.lastResultExcerpt !== undefined) row.last_result_excerpt = patch.lastResultExcerpt;
  if (patch.lastModelId !== undefined) row.last_model_id = patch.lastModelId;
  if (patch.lastSource !== undefined) row.last_source = patch.lastSource;
  if (patch.lastRunAt !== undefined) row.last_run_at = patch.lastRunAt;
  if (patch.pinned !== undefined) {
    row.pinned = patch.pinned;
    row.pinned_at = patch.pinned ? now : null;
  }

  if (!sb) {
    const i = memPresets.findIndex(
      (p) => p.id === id && p.authorEmail.toLowerCase() === em,
    );
    if (i < 0) return null;
    const cur = memPresets[i];
    memPresets[i] = {
      ...cur,
      title: patch.title ?? cur.title,
      objective: patch.objective ?? cur.objective,
      subjectiveMemo: patch.subjectiveMemo ?? cur.subjectiveMemo,
      lastResultExcerpt:
        patch.lastResultExcerpt !== undefined ? patch.lastResultExcerpt : cur.lastResultExcerpt,
      lastModelId: patch.lastModelId !== undefined ? patch.lastModelId : cur.lastModelId,
      lastSource: patch.lastSource !== undefined ? patch.lastSource : cur.lastSource,
      lastRunAt: patch.lastRunAt !== undefined ? patch.lastRunAt : cur.lastRunAt,
      pinned: patch.pinned !== undefined ? patch.pinned : cur.pinned,
      pinnedAt: patch.pinned !== undefined ? (patch.pinned ? now : null) : cur.pinnedAt,
      updatedAt: now,
    };
    return memPresets[i];
  }
  const { data, error } = await sb
    .from("ai_analysis_presets")
    .update(row)
    .eq("id", id)
    .eq("author_email", em)
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return mapPreset(data as Record<string, unknown>);
}

export async function deletePreset(id: string, authorEmail: string): Promise<boolean> {
  const em = authorEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    const i = memPresets.findIndex(
      (p) => p.id === id && p.authorEmail.toLowerCase() === em,
    );
    if (i < 0) return false;
    memPresets.splice(i, 1);
    return true;
  }
  const { error } = await sb
    .from("ai_analysis_presets")
    .delete()
    .eq("id", id)
    .eq("author_email", em);
  return !error;
}

export async function appendRun(input: {
  authorEmail: string;
  presetId?: string | null;
  tool: AiAnalysisToolId;
  inputSnapshot: Record<string, unknown>;
  publicContextSnapshot?: Record<string, unknown> | null;
  modelId?: string | null;
  source?: string | null;
  platform?: PlatformShell;
  structuredSummary?: AiRunStructuredSummary | null;
  markdown: string;
}): Promise<AiAnalysisRunRow> {
  const em = input.authorEmail.trim().toLowerCase();
  const now = new Date().toISOString();
  const excerpt = input.markdown.replace(/\s+/g, " ").slice(0, 280);
  const platform = input.platform === "mobile" ? "mobile" : "desktop";
  const storedSnapshot = input.publicContextSnapshot
    ? {
        ...input.inputSnapshot,
        _meta: { publicContextSnapshot: input.publicContextSnapshot },
      }
    : input.inputSnapshot;
  const regionKeys = extractRegionKeys(input.inputSnapshot);
  const sb = getServiceSupabase();
  if (!sb) {
    const r: AiAnalysisRunRow = {
      id: `run-${Date.now().toString(36)}`,
      authorEmail: em,
      presetId: input.presetId ?? null,
      tool: input.tool,
      inputSnapshot: storedSnapshot,
      publicContextSnapshot: input.publicContextSnapshot ?? null,
      modelId: input.modelId ?? null,
      source: input.source ?? null,
      platform,
      structuredSummary: input.structuredSummary ?? null,
      markdown: input.markdown,
      districtId: regionKeys.districtId,
      complexId: regionKeys.complexId,
      createdAt: now,
    };
    memRuns.unshift(r);
    if (input.presetId) {
      await updatePreset(input.presetId, em, {
        lastResultExcerpt: excerpt,
        lastModelId: input.modelId ?? null,
        lastSource: input.source ?? null,
        lastRunAt: now,
      });
    }
    return r;
  }
  const { data, error } = await sb
    .from("ai_analysis_runs")
    .insert({
      author_email: em,
      preset_id: input.presetId ?? null,
      tool: input.tool,
      input_snapshot: storedSnapshot,
      public_context_snapshot: input.publicContextSnapshot ?? null,
      model_id: input.modelId ?? null,
      source: input.source ?? null,
      platform,
      structured_summary: input.structuredSummary ?? null,
      markdown: input.markdown,
      district_id: regionKeys.districtId,
      complex_id: regionKeys.complexId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "run insert failed");
  if (input.presetId) {
    await sb
      .from("ai_analysis_presets")
      .update({
        last_result_excerpt: excerpt,
        last_model_id: input.modelId,
        last_source: input.source,
        last_run_at: now,
        updated_at: now,
      })
      .eq("id", input.presetId)
      .eq("author_email", em);
  }
  return mapRun(data as Record<string, unknown>);
}

export async function listRuns(authorEmail: string, limit = 40): Promise<AiAnalysisRunRow[]> {
  const em = authorEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    return memRuns
      .filter((r) => r.authorEmail.toLowerCase() === em)
      .slice(0, limit);
  }
  const { data } = await sb
    .from("ai_analysis_runs")
    .select("*")
    .eq("author_email", em)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => mapRun(r as Record<string, unknown>));
}

/** 이번 달 AI 분석 실행 횟수 (멤버십 한도용). */
export async function countRunsThisMonth(authorEmail: string): Promise<number> {
  const em = authorEmail.trim().toLowerCase();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const since = start.toISOString();
  const sb = getServiceSupabase();
  if (!sb) {
    return memRuns.filter(
      (r) => r.authorEmail.toLowerCase() === em && r.createdAt >= since,
    ).length;
  }
  const { count } = await sb
    .from("ai_analysis_runs")
    .select("id", { count: "exact", head: true })
    .eq("author_email", em)
    .gte("created_at", since);
  return count ?? 0;
}

/** 특정 구(district id)에 해당하는 내 AI 실행만 조회. */
export async function listRunsByDistrict(
  authorEmail: string,
  districtId: string,
  limit = 12,
): Promise<AiAnalysisRunRow[]> {
  const em = authorEmail.trim().toLowerCase();
  const key = districtId.trim();
  if (!key) return [];
  const sb = getServiceSupabase();
  if (!sb) {
    return memRuns
      .filter((r) => r.authorEmail.toLowerCase() === em && r.districtId === key)
      .slice(0, limit);
  }
  const { data, error } = await sb
    .from("ai_analysis_runs")
    .select("*")
    .eq("author_email", em)
    .eq("district_id", key)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    // district_id 컬럼 미적용(마이그레이션 전) 환경 폴백: 전체에서 클라 필터
    const all = await listRuns(em, 60);
    return all.filter((r) => r.districtId === key).slice(0, limit);
  }
  return (data ?? []).map((r) => mapRun(r as Record<string, unknown>));
}
