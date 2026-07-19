/** KOSIS 국가통계포털 Open API 클라이언트 (서버 전용). */
import { logger } from "@/lib/log";
import { matchRegionFromClsFullNm, matchRegionByName, type RegionMatch } from "@/lib/market/region-code";
import type { KosisTable } from "./stat-tables";

const BASE = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

export function kosisKey(): string {
  return process.env.KOSIS_API_KEY?.trim() ?? "";
}

export function isKosisConfigured(): boolean {
  return kosisKey().length > 0;
}

export interface KosisDataRow {
  region: RegionMatch;
  /** yyyymm 또는 yyyy */
  period: string;
  itmNm: string;
  value: number;
}

/** KOSIS Param 자료 API 응답 한 행 */
interface RawKosisRow {
  PRD_DE?: string; // 수록시점 (예: 202404, 2024)
  C1?: string;
  C1_NM?: string; // 분류1 명 (보통 시도)
  C2?: string;
  C2_NM?: string; // 분류2 명 (보통 시군구)
  ITM_ID?: string;
  ITM_NM?: string; // 항목명
  DT?: string | number; // 값
  UNIT_NM?: string;
}

function toRegion(row: RawKosisRow): RegionMatch | null {
  // 시군구가 분류2에 오는 표: "시도>시군구" 조합 우선
  if (row.C1_NM && row.C2_NM) {
    const full = matchRegionFromClsFullNm(`${row.C1_NM}>${row.C2_NM}`);
    if (full) return full;
    const byName = matchRegionByName(row.C2_NM, normalizeCity(row.C1_NM));
    if (byName) return byName;
  }
  // 시군구가 분류1에 오는 표
  if (row.C1_NM) {
    const byName = matchRegionByName(row.C1_NM);
    if (byName) return byName;
  }
  return null;
}

function normalizeCity(sido: string): string | undefined {
  const s = sido.trim();
  if (!s) return undefined;
  if (s.startsWith("서울")) return "서울";
  if (s.startsWith("경기")) return "경기";
  if (s.startsWith("인천")) return "인천";
  return undefined;
}

/**
 * 한 KOSIS 통계표의 최신 N개 시점을 내부 지역으로 매핑해 반환.
 * 키 미설정·인증실패·표 없음 등은 모두 graceful 하게 빈 배열을 반환한다.
 */
export async function fetchKosisTable(
  table: KosisTable,
  opts: { recentCount?: number } = {},
): Promise<KosisDataRow[]> {
  if (!isKosisConfigured()) return [];
  const qs = new URLSearchParams({
    method: "getList",
    apiKey: kosisKey(),
    itmId: table.itmId ?? "ALL",
    objL1: table.objL1 ?? "ALL",
    format: "json",
    jsonVifId: "",
    prdSe: table.prdSe,
    newEstPrdCnt: String(opts.recentCount ?? (table.prdSe === "M" ? 2 : 1)),
    orgId: table.orgId,
    tblId: table.tblId,
  });
  if (table.objL2) qs.set("objL2", table.objL2);

  let text: string;
  try {
    const res = await fetch(`${BASE}?${qs.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`KOSIS HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    logger.warn(`[kosis] ${table.label} fetch failed`, err);
    return [];
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // KOSIS 오류는 JSON 비표준 형태({err:"11",...})로 옴 → 인증 대기/실패
    logger.warn(`[kosis] ${table.label} non-JSON response`, text.slice(0, 120));
    return [];
  }
  if (!Array.isArray(json)) {
    logger.warn(`[kosis] ${table.label} unexpected payload`, JSON.stringify(json).slice(0, 120));
    return [];
  }

  const rows = json as RawKosisRow[];
  const out: KosisDataRow[] = [];
  for (const r of rows) {
    if (table.itmNmIncludes && !(r.ITM_NM ?? "").includes(table.itmNmIncludes)) continue;
    const region = toRegion(r);
    if (!region) continue;
    const value = typeof r.DT === "string" ? Number(r.DT.replace(/,/g, "")) : r.DT;
    if (value == null || !Number.isFinite(value)) continue;
    out.push({
      region,
      period: String(r.PRD_DE ?? ""),
      itmNm: String(r.ITM_NM ?? ""),
      value,
    });
  }
  return out;
}
