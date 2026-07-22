import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { isProjectTypeKey, isStageKey } from "./types";

/**
 * 정비사업장 공공 API 적재 (서울 열린데이터광장 정비사업 현황).
 *
 * 환경변수 SEOUL_OPENAPI_KEY 가 있어야 동작한다(사용자가 Vercel 환경변수에 직접 추가).
 * 키가 없으면 no-op(configured:false) — 큐레이션 시드/DB 값이 그대로 노출된다.
 *
 * 서울 API 응답에 좌표(X/Y·경위도)가 포함된 행만 upsert 하며, 좌표가 없는 행은
 * 건너뛴다(정확도 보전 — 좌표를 임의로 만들지 않는다). 사업종류·진행단계는
 * 원문 문자열을 내부 택소노미 키로 best-effort 매핑한다.
 */

const SEOUL_SERVICE = "tbGtnHousingRedevelopment"; // 예시 서비스명(운영키 발급 시 실제 서비스명으로 교체)

export function isRedevIngestConfigured(): boolean {
  return Boolean(process.env.SEOUL_OPENAPI_KEY?.trim());
}

/** 원문 사업구분 문자열 → 내부 typeKey (best-effort). */
export function mapTypeKey(raw: string): string {
  const s = (raw ?? "").replace(/\s/g, "");
  if (!s) return "virtual";
  if (s.includes("신속통합") || s.includes("신통")) return "shintong";
  if (s.includes("공공재개발")) return "public_redev";
  if (s.includes("도심공공") || s.includes("공공주택복합")) return "dosim_public";
  if (s.includes("역세권") && s.includes("시프트")) return "long_jeonse";
  if (s.includes("역세권")) return "station_area";
  if (s.includes("모아")) return "moa";
  if (s.includes("가로주택")) return "garo";
  if (s.includes("소규모")) return "small_scale";
  if (s.includes("지역주택")) return "regional_union";
  if (s.includes("도심복합")) return "private_dosim";
  if (s.includes("재건축") && (s.includes("아파트") || s.includes("공동"))) return "recon_apt";
  if (s.includes("재건축")) return "recon_house";
  if (s.includes("재개발")) return "redev";
  return "virtual";
}

/** 원문 추진단계 문자열 → 내부 stageKey (best-effort). */
export function mapStageKey(raw: string): string {
  const s = (raw ?? "").replace(/\s/g, "");
  if (!s) return "designated";
  if (s.includes("준공") || s.includes("입주") || s.includes("완료")) return "done";
  if (s.includes("이주") || s.includes("철거") || s.includes("착공")) return "moving";
  if (s.includes("관리처분")) return "mgmt_approved";
  if (s.includes("사업시행")) return "plan_approved";
  if (s.includes("조합설립")) return "union";
  if (s.includes("추진위") || s.includes("준비")) return "committee";
  return "designated";
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type IngestResult = {
  configured: boolean;
  fetched: number;
  upserted: number;
  skippedNoGeo: number;
  reason?: string;
};

/**
 * 서울 정비사업 현황을 페이지 단위로 적재. 좌표 포함 행만 upsert.
 * 실제 서비스명·필드명은 발급받은 운영 데이터셋 스펙에 맞춰 조정한다.
 */
export async function ingestSeoulRedevelopment(
  startIndex = 1,
  endIndex = 1000,
): Promise<IngestResult> {
  const key = process.env.SEOUL_OPENAPI_KEY?.trim();
  if (!key) {
    return { configured: false, fetched: 0, upserted: 0, skippedNoGeo: 0, reason: "no-key" };
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return { configured: true, fetched: 0, upserted: 0, skippedNoGeo: 0, reason: "no-db" };
  }

  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(
    key,
  )}/json/${SEOUL_SERVICE}/${startIndex}/${endIndex}/`;

  let rows: Record<string, unknown>[] = [];
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { configured: true, fetched: 0, upserted: 0, skippedNoGeo: 0, reason: `http-${res.status}` };
    }
    const json = (await res.json()) as Record<string, unknown>;
    const svc = json[SEOUL_SERVICE] as Record<string, unknown> | undefined;
    rows = (svc?.row as Record<string, unknown>[] | undefined) ?? [];
  } catch (e) {
    logger.error("[redev.ingest] fetch", e);
    return { configured: true, fetched: 0, upserted: 0, skippedNoGeo: 0, reason: "fetch-error" };
  }

  let upserted = 0;
  let skippedNoGeo = 0;
  const batch: Record<string, unknown>[] = [];

  for (const r of rows) {
    // 필드명은 데이터셋에 따라 다를 수 있어 여러 후보를 시도한다.
    const lat = num(r.LAT ?? r.lat ?? r.YCODE ?? r.Y ?? r.LA);
    const lng = num(r.LNG ?? r.lng ?? r.XCODE ?? r.X ?? r.LO);
    if (lat == null || lng == null) {
      skippedNoGeo++;
      continue; // 좌표 없는 행은 좌표를 만들어내지 않고 건너뜀
    }
    const name = String(r.SESSION_NM ?? r.PRJ_NM ?? r.SITE_NM ?? r.NM ?? "정비사업 구역");
    const typeRaw = String(r.PRJ_DIV ?? r.BSNS_DIV ?? r.TYPE ?? "");
    const stageRaw = String(r.STEP ?? r.PROGRESS ?? r.STAT ?? "");
    const sigungu = String(r.GU_NM ?? r.SGG_NM ?? r.AUTONOMOUS_GU ?? "");
    const tk = mapTypeKey(typeRaw);
    const sk = mapStageKey(stageRaw);
    batch.push({
      id: `seoul-${String(r.PRJ_ID ?? r.ID ?? `${name}-${lat}-${lng}`)}`,
      name,
      type_key: isProjectTypeKey(tk) ? tk : "virtual",
      stage_key: isStageKey(sk) ? sk : "designated",
      sido: "서울",
      sigungu,
      address: String(r.ADDR ?? r.LOC ?? "") || null,
      lat,
      lng,
      households: num(r.HSHLD_CNT ?? r.HOUSEHOLD),
      summary: null,
      source: "서울 열린데이터광장 정비사업 현황",
      source_url: "https://data.seoul.go.kr",
      is_sample: false,
      updated_at: new Date().toISOString(),
    });
  }

  if (batch.length) {
    const { error } = await sb.from("redevelopment_projects").upsert(batch, { onConflict: "id" });
    if (error) {
      logger.error("[redev.ingest] upsert", error);
      return { configured: true, fetched: rows.length, upserted: 0, skippedNoGeo, reason: "upsert-error" };
    }
    upserted = batch.length;
  }

  return { configured: true, fetched: rows.length, upserted, skippedNoGeo };
}
