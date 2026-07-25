/**
 * F2 — 데이터 신선도 대시보드 집계 (서버 전용, 읽기 전용).
 *
 * 기존 `/admin/data` 는 market_ingest_log 의 마지막 성공 시각 하나만 "최근 실거래 반영"
 * 이라는 라벨로 보여줬는데, 실제로 그 값은 REB 지수 적재 시각이라 라벨과 내용이 어긋났다.
 * 여기서는 테이블별로 (1) 데이터 자체의 기준 시점, (2) 마지막 쓰기 시각, (3) 경과일,
 * (4) 행 수를 각각 실집계해 표시한다. 추정·보정 없이 DB 값을 그대로 읽는다.
 *
 * ── #148 에서 고친 두 가지 거짓말 ────────────────────────────────────────────
 *
 * (1) "마지막 적재" 로 `max(updated_at)` 을 읽고 있었다. 그런데 이 테이블들에는
 *     `set_updated_at` BEFORE UPDATE 트리거가 걸려 있어서, 수집과 아무 상관 없는
 *     UPDATE 한 방에도 값이 오늘로 올라간다. 2026-07-25 프로덕션에서 실제로:
 *
 *       market_transactions max(created_at) = 02:59:05  ← 진짜 마지막 수집
 *       market_transactions max(updated_at) = 04:26:11  ← #150 is_cancelled 백필 402행
 *
 *     화면은 04:26 을 "마지막 적재" 라고 표시했다. 그 시각에 들어온 실거래는 0건이다.
 *     불리언 하나 백필한 것이 수집으로 둔갑하면, 수집이 멎어도 계속 초록으로 보인다.
 *     그래서 신규 행 시각(created_at)이 있는 테이블은 그쪽을 판정 기준으로 쓰고,
 *     쓰기 시각은 따로 남겨 둘을 나란히 보여준다.
 *
 * (2) 수집이 "부분적으로" 실패한 걸 표현할 방법이 없었다. 같은 날 MOLIT 실행은
 *
 *       status=error rows=2096 message="slice=8 시도=16 기존커버=0 빈응답=1 오류=13"
 *
 *     이었다. 2,096행은 실제로 들어왔고, 동시에 시군구 16곳 중 13곳이 실패했다.
 *     로그 패널은 이걸 빨간 "오류" 한 칸으로 뭉갰다 — 읽는 사람은 "아무것도 안 들어왔다"
 *     로 이해한다. 반대로 status 만 보고 초록으로 칠했다면 "다 잘 됐다" 가 된다.
 *     둘 다 틀렸다. 부분 실패는 부분 실패라고 말해야 한다.
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import {
  classifyIngestRun,
  parseRunTally,
  type IngestOutcome,
  type RunTally,
} from "@/lib/market/ingest-outcome";

/*
 * 판정 규칙(어떤 실행이 정상이고 어떤 게 부분 실패인지)은 lib/market/ingest-outcome.ts
 * 한 곳에만 둔다. 원래 이 파일 안에 있었는데, 같은 규칙이 /admin ETL 패널과
 * /api/health 에도 각자 다른 모습으로 또 있었다 — 그래서 셋이 같은 사건을 다르게
 * 읽었다. 기존 import 경로를 깨지 않도록 여기서 그대로 다시 내보낸다.
 */
export {
  classifyIngestRun,
  parseRunTally,
  tallyText,
  isHardFailure,
  OUTCOME_LABEL,
  OUTCOME_COLOR,
  OUTCOME_MARK,
} from "@/lib/market/ingest-outcome";
export type { IngestOutcome, RunTally } from "@/lib/market/ingest-outcome";

export type FreshnessStatus = "fresh" | "aging" | "stale" | "empty" | "unknown";

/** 판정 경과일을 무엇으로 쟀는지 — 신규 행(insert) 인지 마지막 쓰기(write) 인지 */
export type LagBasis = "insert" | "write";

export interface IngestRunInfo {
  source: string;
  dataset: string;
  origin: string;
  /** DB 에 적힌 원래 status 문자열 그대로 */
  status: string;
  rows: number;
  at: string;
  lagDays: number | null;
  message: string | null;
  outcome: IngestOutcome;
  tally: RunTally;
}

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
  /** 마지막 쓰기 시각 (ISO) — UPDATE 도 포함되므로 수집 시각이 아니다 */
  lastWriteAt: string | null;
  /** 마지막 신규 행 시각 (ISO) — created_at 이 있는 테이블만. 백필에 흔들리지 않는다 */
  lastInsertAt: string | null;
  /** 판정에 쓴 경과 일수 */
  lagDays: number | null;
  /** 그 경과일을 무엇으로 쟀는지 */
  lagBasis: LagBasis;
  /** 기대 갱신 주기(일) — 초과 시 aging/stale */
  expectedDays: number;
  status: FreshnessStatus;
  /** 이 데이터셋을 채우는 수집 실행의 마지막 결과 — 매칭되는 로그가 없으면 null */
  ingest: IngestRunInfo | null;
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
  outcome: IngestOutcome;
  message: string | null;
  tally: RunTally;
}

interface Spec {
  key: string;
  label: string;
  source: string;
  table: string;
  /** 쓰기 시각 컬럼 (UPDATE 포함) */
  writeCol: string;
  /**
   * 신규 행 시각 컬럼. 있으면 신선도 판정을 이쪽으로 한다 — 백필 UPDATE 에
   * 흔들리지 않는 유일한 값이라서. 없는 테이블은 writeCol 로 떨어진다.
   */
  insertCol?: string;
  /** 데이터 기준 시점 컬럼 (없으면 생략) */
  asOfCol?: string;
  expectedDays: number;
  /** is_sample 컬럼 보유 여부 */
  hasSample?: boolean;
  /**
   * market_ingest_log.source 중 이 테이블을 채우는 것들. 여러 개면 가장 최근 실행을 쓴다.
   * 비워 두면 "수집 로그 없음" 으로 표시한다 — 아무 로그나 갖다 붙이지 않는다.
   */
  logSources?: string[];
  note?: string;
}

const SPECS: Spec[] = [
  {
    key: "transactions",
    label: "실거래 (아파트 매매·전월세)",
    source: "국토교통부 RTMS",
    table: "market_transactions",
    writeCol: "updated_at",
    insertCol: "created_at",
    asOfCol: "contract_ym",
    expectedDays: 10,
    logSources: ["molit"],
  },
  {
    key: "apt-master",
    label: "공동주택 단지 마스터",
    source: "공공데이터포털",
    table: "apartment_complexes",
    writeCol: "updated_at",
    expectedDays: 30,
    logSources: ["apt-master"],
  },
  {
    key: "region-price",
    label: "지역 시세 (매매·전세)",
    source: "R-ONE · KB",
    table: "market_region_price",
    writeCol: "updated_at",
    asOfCol: "period",
    expectedDays: 10,
    logSources: ["reb", "kb"],
  },
  {
    key: "region-series",
    label: "지수 시계열",
    source: "R-ONE · KB · KOSIS",
    table: "market_region_series",
    writeCol: "updated_at",
    asOfCol: "period",
    expectedDays: 10,
    logSources: ["reb", "kosis", "ecos"],
  },
  {
    key: "region-monthly",
    label: "지역 월간 집계",
    source: "국토교통부 RTMS",
    table: "market_region_monthly",
    writeCol: "updated_at",
    asOfCol: "month",
    expectedDays: 30,
    note: "이 테이블을 채우는 크론이 적재 로그를 남기지 않는다 — 아래 '마지막 수집' 은 비어 있는 게 맞다.",
  },
  {
    key: "complex-price",
    label: "단지 시세",
    source: "수집(crawl)",
    table: "market_complex_price",
    writeCol: "updated_at",
    expectedDays: 10,
    logSources: ["crawl"],
  },
  {
    key: "geocode",
    label: "단지 좌표 (지오코딩 캐시)",
    source: "NAVER Maps",
    table: "complex_geocode",
    writeCol: "geocoded_at",
    expectedDays: 7,
    logSources: ["geocode"],
  },
  {
    key: "supply",
    label: "입주 물량",
    source: "공공데이터포털",
    table: "apartment_supply",
    writeCol: "created_at",
    insertCol: "created_at",
    asOfCol: "move_in_ym",
    expectedDays: 90,
    note: "적재 경로가 로그를 남기지 않는다 — '마지막 수집' 빈칸은 실패가 아니라 미계측이다.",
  },
  {
    key: "onbid",
    label: "공매 물건",
    source: "온비드",
    table: "onbid_auctions",
    writeCol: "updated_at",
    expectedDays: 3,
    logSources: ["onbid"],
  },
  {
    key: "court",
    label: "경매 물건",
    source: "법원경매",
    table: "court_auctions",
    writeCol: "updated_at",
    expectedDays: 3,
    hasSample: true,
    logSources: ["court-auction"],
  },
  {
    key: "redevelopment",
    label: "정비사업 현황",
    source: "서울 열린데이터광장",
    table: "redevelopment_projects",
    writeCol: "updated_at",
    insertCol: "created_at",
    expectedDays: 30,
    hasSample: true,
    logSources: ["redevelopment"],
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

interface RawLogRow {
  source: string;
  dataset: string;
  origin: string;
  rows: number;
  status: string;
  message: string | null;
  created_at: string;
}

function toRunInfo(r: RawLogRow, now: number): IngestRunInfo {
  const rows = Number(r.rows) || 0;
  const status = String(r.status);
  return {
    source: String(r.source),
    dataset: String(r.dataset),
    origin: String(r.origin),
    status,
    rows,
    at: String(r.created_at),
    lagDays: daysSince(String(r.created_at), now),
    message: r.message ? String(r.message) : null,
    outcome: classifyIngestRun(status, rows),
    tally: parseRunTally(r.message),
  };
}

/** market_ingest_log 최신 N건을 한 번만 읽는다 — 신선도 표와 로그 패널이 같이 쓴다. */
async function loadRecentLog(limit: number): Promise<RawLogRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("market_ingest_log")
    .select("source,dataset,origin,rows,status,message,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as RawLogRow[];
}

/** 테이블 1개의 신선도 — count · 최신 쓰기 · 신규 행 · 데이터 기준 시점. */
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
    lastInsertAt: null,
    lagDays: null,
    lagBasis: spec.insertCol ? "insert" : "write",
    expectedDays: spec.expectedDays,
    status: "unknown",
    ingest: null,
    note: spec.note,
  };

  /** 컬럼 1개의 최댓값 — 정렬 후 1건. */
  const latest = async (col: string): Promise<string | null> => {
    const res = await sb.from(spec.table).select(col).order(col, { ascending: false }).limit(1);
    const row = (res as { data?: Record<string, unknown>[] | null }).data?.[0];
    return row ? ((row[col] as string | null) ?? null) : null;
  };

  try {
    const [countRes, writeAt, insertAt, asOfRes, sampleRes] = await Promise.all([
      sb.from(spec.table).select("*", { count: "exact", head: true }),
      latest(spec.writeCol),
      /* insertCol 이 writeCol 과 같으면 한 번만 읽는다 (apartment_supply) */
      spec.insertCol && spec.insertCol !== spec.writeCol
        ? latest(spec.insertCol)
        : Promise.resolve(null),
      spec.asOfCol
        ? sb.from(spec.table).select(spec.asOfCol).order(spec.asOfCol, { ascending: false }).limit(1)
        : Promise.resolve({ data: null }),
      spec.hasSample
        ? sb.from(spec.table).select("*", { count: "exact", head: true }).eq("is_sample", true)
        : Promise.resolve({ count: null }),
    ]);

    const rows = countRes.count ?? 0;
    const lastWriteAt = writeAt;
    const lastInsertAt = spec.insertCol
      ? spec.insertCol === spec.writeCol
        ? writeAt
        : insertAt
      : null;
    const asOfRow = (asOfRes as { data?: Record<string, unknown>[] | null }).data?.[0];
    const dataAsOf = spec.asOfCol && asOfRow ? formatDataAsOf(asOfRow[spec.asOfCol]) : null;
    const sampleRows = (sampleRes as { count?: number | null }).count ?? undefined;

    /* 판정 기준: 신규 행 시각이 있으면 그것. 백필 UPDATE 로 오늘이 되는 값이 아니다. */
    const basis: LagBasis = lastInsertAt ? "insert" : "write";
    const lagDays = daysSince(basis === "insert" ? lastInsertAt : lastWriteAt, now);

    return {
      ...base,
      rows,
      sampleRows: sampleRows ?? undefined,
      dataAsOf,
      lastWriteAt,
      lastInsertAt,
      lagDays,
      lagBasis: basis,
      status: statusOf(rows, lagDays, spec.expectedDays),
    };
  } catch (e) {
    logger.warn("[data-freshness]", spec.table, e instanceof Error ? e.message : String(e));
    return base;
  }
}

/**
 * 전체 데이터셋 신선도 — 실집계. Supabase 미설정 시 빈 배열.
 * 적재 로그는 한 번만 읽어서 각 행에 붙인다(테이블당 재조회 없음).
 */
export async function loadDataFreshness(): Promise<FreshnessRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const now = Date.now();

  const [rows, log] = await Promise.all([
    Promise.all(SPECS.map((s) => loadOne(sb, s, now))),
    loadRecentLog(200),
  ]);

  /* source 별 가장 최근 실행 1건 (로그는 이미 created_at desc) */
  const latestBySource = new Map<string, RawLogRow>();
  for (const r of log) {
    if (!latestBySource.has(r.source)) latestBySource.set(r.source, r);
  }

  return rows.map((row) => {
    const spec = SPECS.find((s) => s.key === row.key);
    const candidates = (spec?.logSources ?? [])
      .map((s) => latestBySource.get(s))
      .filter((r): r is RawLogRow => Boolean(r))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const run = candidates[0];
    return { ...row, ingest: run ? toRunInfo(run, now) : null };
  });
}

/**
 * 소스별 최근 적재 로그 요약 — market_ingest_log 최신 행에서 source+dataset 별 1건씩.
 * F3 계측 확대 이후 실거래·단지마스터·금리·공매·정비사업·지오코딩도 여기에 나타난다.
 */
export async function loadIngestSourceSummary(limit = 200): Promise<IngestSourceSummary[]> {
  const data = await loadRecentLog(limit);
  if (data.length === 0) return [];

  const now = Date.now();
  const seen = new Map<string, IngestSourceSummary>();
  for (const r of data) {
    const key = `${r.source}|${r.dataset}`;
    if (seen.has(key)) continue;
    const info = toRunInfo(r, now);
    seen.set(key, {
      source: info.source,
      dataset: info.dataset,
      status: info.status,
      origin: info.origin,
      rows: info.rows,
      lastAt: info.at,
      lagDays: info.lagDays ?? 0,
      outcome: info.outcome,
      message: info.message,
      tally: info.tally,
    });
  }
  return [...seen.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
