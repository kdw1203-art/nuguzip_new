/** 한국부동산원(R-ONE) Open API 클라이언트 (서버 전용). */
import { logger } from "@/lib/log";
import { matchRegionFromClsFullNm, type RegionMatch } from "@/lib/market/region-code";
import type { RebStat } from "./stat-codes";

const BASE = "https://www.reb.or.kr/r-one/openapi";

export function rebKey(): string {
  return process.env.REB_OPENAPI_KEY?.trim() ?? "";
}

export function isRebConfigured(): boolean {
  return rebKey().length > 0;
}

export interface RebDataRow {
  region: RegionMatch;
  /** YYYY-MM-DD (월: 1일, 주: 해당 ISO 주 월요일 근사) */
  period: string;
  /** 원자료 식별자 (YYYYMM 또는 YYYYWW) */
  rawPeriod: string;
  itmNm: string;
  value: number;
}

/** YYYYWW → 해당 주 월요일 근사 YYYY-MM-DD */
function weekToDate(yyyyww: string): string {
  const y = Number(yyyyww.slice(0, 4));
  const w = Number(yyyyww.slice(4));
  if (!Number.isFinite(y) || !Number.isFinite(w)) return `${yyyyww}`;
  const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  // ISO: 주의 월요일로 이동
  simple.setUTCDate(simple.getUTCDate() - dow + 1);
  return simple.toISOString().slice(0, 10);
}

function rawPeriodToDate(raw: string, periodType: "weekly" | "monthly"): string {
  if (periodType === "monthly") {
    if (/^\d{6}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-01`;
    return raw;
  }
  if (/^\d{6}$/.test(raw)) return weekToDate(raw);
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw;
}

interface RawRow {
  WRTTIME_IDTFR_ID?: string;
  CLS_FULLNM?: string;
  CLS_NM?: string;
  ITM_NM?: string;
  DTA_VAL?: number | string;
}

const PAGE_SIZE = 1000;

/** R-ONE 응답 RESULT 코드(명세서 메시지 기준). INFO-000 정상 / INFO-200 데이터없음 */
interface RebResult {
  code: string;
  message: string;
}

function extractEnvelope(
  text: string,
  rootKey: string,
): { total: number; result: RebResult | null; rows: Array<Record<string, unknown>> } {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("REB JSON parse failed");
  }
  const blocks =
    (json[rootKey] as Array<Record<string, unknown>> | undefined) ??
    (Object.values(json).find(Array.isArray) as Array<Record<string, unknown>> | undefined) ??
    [];
  const head = (blocks.find((b) => Array.isArray((b as { head?: unknown }).head)) as
    | { head?: Array<Record<string, unknown>> }
    | undefined)?.head;
  const total = Number(head?.find((h) => "list_total_count" in h)?.list_total_count ?? 0);
  const resultRaw = head?.find((h) => "RESULT" in h)?.RESULT as
    | { CODE?: string; MESSAGE?: string }
    | undefined;
  const result: RebResult | null = resultRaw
    ? { code: String(resultRaw.CODE ?? ""), message: String(resultRaw.MESSAGE ?? "") }
    : null;
  const rowBlock = blocks.find((b) => Array.isArray((b as { row?: unknown }).row));
  const rows = ((rowBlock as { row?: Array<Record<string, unknown>> } | undefined)?.row ?? []);
  return { total, result, rows };
}

/** RESULT 코드가 오류면 경고 로그. (290=인증무효, 337=일일한도, 200=데이터없음) */
function warnOnResult(label: string, result: RebResult | null): void {
  if (!result) return;
  const code = result.code;
  // INFO-000(정상)·INFO-200(데이터없음)·CODE에 000 포함 시 정상 처리
  if (code === "INFO-000" || /-?000$/.test(code)) return;
  if (/29\d$/.test(code)) logger.warn(`[reb] ${label} 인증키 무효/제한 (${code}) ${result.message}`);
  else if (/33[67]$/.test(code)) logger.warn(`[reb] ${label} 호출 한도 (${code}) ${result.message}`);
  else if (code !== "INFO-200") logger.warn(`[reb] ${label} RESULT ${code} ${result.message}`);
}

function parseEnvelope(text: string): { total: number; result: RebResult | null; rows: RawRow[] } {
  const { total, result, rows } = extractEnvelope(text, "SttsApiTblData");
  return { total, result, rows: rows as RawRow[] };
}

async function fetchPage(
  statblId: string,
  cycle: string,
  pIndex: number,
): Promise<{ total: number; result: RebResult | null; rows: RawRow[] }> {
  const qs = new URLSearchParams({
    KEY: rebKey(),
    Type: "json",
    pIndex: String(pIndex),
    pSize: String(PAGE_SIZE),
    STATBL_ID: statblId,
    DTACYCLE_CD: cycle,
  });
  const res = await fetch(`${BASE}/SttsApiTblData.do?${qs.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`REB HTTP ${res.status}`);
  return parseEnvelope(await res.text());
}

// ── 명세서 기반 디스커버리 엔드포인트 (통계표/세부항목 목록) ──────────────

export interface RebTableInfo {
  statblId: string;
  statblNm: string;
  cycle: string;
  dataStartYy: string;
  dataEndYy: string;
}

/** 서비스 통계목록(SttsApiTbl) — 전체 통계표 메타. nameIncludes 로 부분 필터. */
export async function fetchRebTableList(nameIncludes?: string): Promise<RebTableInfo[]> {
  if (!isRebConfigured()) return [];
  const out: RebTableInfo[] = [];
  // 전체(약 700+건)는 1페이지 1000건으로 충분
  const qs = new URLSearchParams({ KEY: rebKey(), Type: "json", pIndex: "1", pSize: String(PAGE_SIZE) });
  let env: ReturnType<typeof extractEnvelope>;
  try {
    const res = await fetch(`${BASE}/SttsApiTbl.do?${qs.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`REB HTTP ${res.status}`);
    env = extractEnvelope(await res.text(), "SttsApiTbl");
  } catch (err) {
    logger.warn("[reb] SttsApiTbl fetch failed", err);
    return [];
  }
  warnOnResult("SttsApiTbl", env.result);
  const needle = nameIncludes ? nameIncludes.replace(/\s/g, "") : "";
  for (const r of env.rows) {
    const nm = String(r.STATBL_NM ?? "");
    if (needle && !nm.replace(/\s/g, "").includes(needle)) continue;
    out.push({
      statblId: String(r.STATBL_ID ?? ""),
      statblNm: nm,
      cycle: String(r.DTACYCLE_CD ?? ""),
      dataStartYy: String(r.DATA_START_YY ?? ""),
      dataEndYy: String(r.DATA_END_YY ?? ""),
    });
  }
  return out;
}

export interface RebItemInfo {
  itmId: string;
  itmNm: string;
  itmFullNm: string;
  uiNm: string;
}

/** 통계 세부항목 목록(SttsApiTblItm) — 특정 통계표의 항목/단위. */
export async function fetchRebTableItems(statblId: string): Promise<RebItemInfo[]> {
  if (!isRebConfigured() || !statblId) return [];
  const qs = new URLSearchParams({
    KEY: rebKey(),
    Type: "json",
    pIndex: "1",
    pSize: String(PAGE_SIZE),
    STATBL_ID: statblId,
  });
  let env: ReturnType<typeof extractEnvelope>;
  try {
    const res = await fetch(`${BASE}/SttsApiTblItm.do?${qs.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`REB HTTP ${res.status}`);
    env = extractEnvelope(await res.text(), "SttsApiTblItm");
  } catch (err) {
    logger.warn(`[reb] SttsApiTblItm ${statblId} fetch failed`, err);
    return [];
  }
  warnOnResult(`SttsApiTblItm ${statblId}`, env.result);
  return env.rows.map((r) => ({
    itmId: String(r.ITM_ID ?? ""),
    itmNm: String(r.ITM_NM ?? ""),
    itmFullNm: String(r.ITM_FULLNM ?? ""),
    uiNm: String(r.UI_NM ?? ""),
  }));
}

/**
 * 한 통계표의 "최신" 데이터를 내부 지역으로 매핑해 반환.
 * R-ONE 응답은 기간 오름차순 → 마지막 페이지(들)이 최신. START/END 필터는 일부 표에서
 * 동작하지 않아 마지막 페이지 페이징 방식을 사용한다. 매칭 안 되는 지역은 제외.
 */
export async function fetchRebStat(
  stat: RebStat,
  opts: { monthPages?: number; weekPages?: number } = {},
): Promise<RebDataRow[]> {
  if (!isRebConfigured()) return [];
  const pagesFromEnd = stat.cycle === "MM" ? opts.monthPages ?? 3 : opts.weekPages ?? 4;

  // 1) 총 건수 파악 (1페이지로 head 확보)
  let first: { total: number; result: RebResult | null; rows: RawRow[] };
  try {
    first = await fetchPage(stat.statblId, stat.cycle, 1);
  } catch (err) {
    logger.warn(`[reb] ${stat.label} head fetch failed`, err);
    return [];
  }
  warnOnResult(stat.label, first.result);
  const total = first.total || first.rows.length;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startPage = Math.max(1, lastPage - pagesFromEnd + 1);

  const out: RebDataRow[] = [];
  const collect = (rows: RawRow[]) => {
    for (const r of rows) {
      if (stat.itmIncludes && !(r.ITM_NM ?? "").includes(stat.itmIncludes)) continue;
      if (stat.itmExcludes && (r.ITM_NM ?? "").includes(stat.itmExcludes)) continue;
      const region = matchRegionFromClsFullNm(r.CLS_FULLNM ?? r.CLS_NM);
      if (!region) continue;
      const value = typeof r.DTA_VAL === "string" ? Number(r.DTA_VAL) : r.DTA_VAL;
      if (value == null || !Number.isFinite(value)) continue;
      const raw = String(r.WRTTIME_IDTFR_ID ?? "");
      out.push({
        region,
        rawPeriod: raw,
        period: rawPeriodToDate(raw, stat.periodType),
        itmNm: String(r.ITM_NM ?? ""),
        value,
      });
    }
  };

  for (let p = startPage; p <= lastPage; p += 1) {
    if (p === 1 && startPage === 1) {
      collect(first.rows);
      continue;
    }
    try {
      const page = await fetchPage(stat.statblId, stat.cycle, p);
      collect(page.rows);
    } catch (err) {
      logger.warn(`[reb] ${stat.label} page ${p} failed`, err);
    }
  }
  return out;
}
