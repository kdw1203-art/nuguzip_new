/**
 * F2 — 데이터 신선도 대시보드 집계 (서버 전용, 읽기 전용).
 *
 * 기존 `/admin/data` 는 market_ingest_log 의 마지막 성공 시각 하나만 "최근 실거래 반영"
 * 이라는 라벨로 보여줬는데, 실제로 그 값은 REB 지수 적재 시각이라 라벨과 내용이 어긋났다.
 * 여기서는 테이블별로 (1) 데이터 자체의 기준 시점, (2) 마지막 쓰기 시각, (3) 경과일,
 * (4) 행 수를 각각 실집계해 표시한다. 추정·보정 없이 DB 값을 그대로 읽는다.
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export type FreshnessStatus = "fresh" | "aging" | "stale" | "empty" | "unknown";

export interface FreshnessRow {
  key: string;
  /** 표시명 */
  label: string;
  /** 원천 표기 */
  source: string;
  table: string;
  /** 총 행 수 */
  rows: number;
  /** 예시(is_sample) 행 수 — 해당 테이블만 */
  sampleRows?: number;
  /** 데이터 자체의 기준 시점 (계약월·기준월 등) */
  dataAsOf: string | null;
  /** 마지막 쓰기 시각 (ISO) */
  lastWriteAt: string | null;
  /** 마지막 쓰기 이후 경과 일수 */
  lagDays: number | null;
  /** 기대 갱신 주기(일) — 초과 시 aging/stale */
  expectedDays: number;
  status: FreshnessStatus;
  note?: string;
}

export interface IngestSourceSummary {
  source: string;
  dataset: string;
  status: string;
  origin: string;
  rows: number;
  lastAt: string;
  lagDays: number;
}

interface Spec {
  key: string;
  label: string;
  source: string;
  table: string;
  /** 쓰기 시각 컬럼 */
  writeCol: string;
  /** 데이터 기준 시점 컬럼 (없으면 생략) */
  asOfCol?: string;
  expectedDays: number;
  /** is_sample 컬럼 보유 여부 */
  hasSample?: boolean;
  note?: string;
}

const SPECS: Spec[] = [
  {
    key: "transactions",
    label: "실거래 (아파트 매매·전월세)",
    source: "국토교통부 RTMS",
    table: "market_transactions",
    writeCol: "updated_at",
    asOfCol: "contract_ym",
    expectedDays: 10,
  },
  {
    key: "apt-master",
    label: "공동주택 단지 마스터",
    source: "공공데이터포털",
    table: "apartment_complexes",
    writeCol: "updated_at",
    expectedDays: 30,
  },
  {
    key: "region-price",
    label: "지역 시세 (매매·전세)",
    source: "R-ONE · KB",
    table: "market_region_price",
    writeCol: "updated_at",
    asOfCol: "period",
    expectedDays: 10,
  },
  {
    key: "region-series",
    label: "지수 시계열",
    source: "R-ONE · KB · KOSIS",
    table: "market_region_series",
    writeCol: "updated_at",
    asOfCol: "period",
    expectedDays: 10,
  },
  {
    key: "region-monthly",
    label: "지역 월간 집계",
    source: "국토교통부 RTMS",
    table: "market_region_monthly",
    writeCol: "updated_at",
    asOfCol: "month",
    expectedDays: 30,
  },
  {
    key: "complex-price",
    label: "단지 시세",
    source: "수집(crawl)",
    table: "market_complex_price",
    writeCol: "updated_at",
    expectedDays: 10,
  },
  {
    key: "geocode",
    label: "단지 좌표 (지오코딩 캐시)",
    source: "NAVER Maps",
    table: "complex_geocode",
    writeCol: "geocoded_at",
    expectedDays: 7,
  },
  {
    key: "supply",
    label: "입주 물량",
    source: "공공데이터포털",
    table: "apartment_supply",
    writeCol: "created_at",
    asOfCol: "move_in_ym",
    expectedDays: 90,
  },
  {
    key: "onbid",
    label: "공매 물건",
    source: "온비드",
    table: "onbid_auctions",
    writeCol: "updated_at",
    expectedDays: 3,
  },
  {
    key: "court",
    label: "경매 물건",
    source: "법원경매",
    table: "court_auctions",
    writeCol: "updated_at",
    expectedDays: 3,
    hasSample: true,
  },
  {
    key: "redevelopment",
    label: "정비사업 현황",
    source: "서울 열린데이터광장",
    table: "redevelopment_projects",
    writeCol: "updated_at",
    expectedDays: 30,
    hasSample: true,
  },
];

/** "202607" · "20260717" · "2026-07-20" → "2026.07" / "2026.07.17" */
export function formatDataAsOf(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (/^\d{6}$/.test(v)) return `${v.slice(0, 4)}.${v.slice(4, 6)}`;
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}.${v.slice(4, 6)}.${v.slice(6, 8)}`;
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }
  return v;
}

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

function statusOf(rows: number, lagDays: number | null, expectedDays: number): FreshnessStatus {
  if (rows === 0) return "empty";
  if (lagDays == null) return "unknown";
  if (lagDays <= expectedDays) return "fresh";
  if (lagDays <= expectedDays * 3) return "aging";
  return "stale";
}

/** 테이블 1개의 신선도 — count · 최신 쓰기 · 데이터 기준 시점. */
async function loadOne(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  spec: Spec,
  now: number,
): Promise<FreshnessRow> {
  const base: FreshnessRow = {
    key: spec.key,
    label: spec.label,
    source: spec.source,
    table: spec.table,
    rows: 0,
    dataAsOf: null,
    lastWriteAt: null,
    lagDays: null,
    expectedDays: spec.expectedDays,
    status: "unknown",
    note: spec.note,
  };

  try {
    const [countRes, writeRes, asOfRes, sampleRes] = await Promise.all([
      sb.from(spec.table).select("*", { count: "exact", head: true }),
      sb.from(spec.table).select(spec.writeCol).order(spec.writeCol, { ascending: false }).limit(1),
      spec.asOfCol
        ? sb.from(spec.table).select(spec.asOfCol).order(spec.asOfCol, { ascending: false }).limit(1)
        : Promise.resolve({ data: null }),
      spec.hasSample
        ? sb.from(spec.table).select("*", { count: "exact", head: true }).eq("is_sample", true)
        : Promise.resolve({ count: null }),
    ]);

    const rows = countRes.count ?? 0;
    const writeRow = (writeRes as { data?: Record<string, unknown>[] | null }).data?.[0];
    const lastWriteAt = writeRow ? (writeRow[spec.writeCol] as string | null) ?? null : null;
    const asOfRow = (asOfRes as { data?: Record<string, unknown>[] | null }).data?.[0];
    const dataAsOf = spec.asOfCol && asOfRow ? formatDataAsOf(asOfRow[spec.asOfCol]) : null;
    const lagDays = daysSince(lastWriteAt, now);
    const sampleRows = (sampleRes as { count?: number | null }).count ?? undefined;

    return {
      ...base,
      rows,
      sampleRows: sampleRows ?? undefined,
      dataAsOf,
      lastWriteAt,
      lagDays,
      status: statusOf(rows, lagDays, spec.expectedDays),
    };
  } catch (e) {
    logger.warn("[data-freshness]", spec.table, e instanceof Error ? e.message : String(e));
    return base;
  }
}

/** 전체 데이터셋 신선도 — 실집계. Supabase 미설정 시 빈 배열. */
export async function loadDataFreshness(): Promise<FreshnessRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const now = Date.now();
  return Promise.all(SPECS.map((s) => loadOne(sb, s, now)));
}

/**
 * 소스별 최근 적재 로그 요약 — market_ingest_log 최신 행에서 source+dataset 별 1건씩.
 * F3 계측 확대 이후 실거래·단지마스터·금리·공매·정비사업·지오코딩도 여기에 나타난다.
 */
export async function loadIngestSourceSummary(limit = 200): Promise<IngestSourceSummary[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("market_ingest_log")
    .select("source,dataset,origin,rows,status,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const now = Date.now();
  const seen = new Map<string, IngestSourceSummary>();
  for (const r of data) {
    const key = `${r.source}|${r.dataset}`;
    if (seen.has(key)) continue;
    const lastAt = String(r.created_at);
    seen.set(key, {
      source: String(r.source),
      dataset: String(r.dataset),
      status: String(r.status),
      origin: String(r.origin),
      rows: Number(r.rows) || 0,
      lastAt,
      lagDays: daysSince(lastAt, now) ?? 0,
    });
  }
  return [...seen.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
