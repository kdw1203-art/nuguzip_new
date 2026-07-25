import { MapClient, type DanjiItem, type TradeItem } from "./map-client";
import { encodeComplexId, type ComplexTransactionRow } from "@/lib/complex/complex-store";
import { loadRegionMarketMarkers } from "@/lib/map/region-market";
import { pctDelta, deltaLabel } from "@/lib/map/trade-stats";
import { getServiceSupabase } from "@/lib/supabase/service";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "지도 탐색 | 누구집",
  description: "지도에서 단지 시세·실거래·임장노트를 한 번에 탐색하세요.",
};

/** 만원 단위 → "8.4억" / "8,200만" 라벨 */
function formatManwon(manwon: number): string {
  if (!Number.isFinite(manwon) || manwon <= 0) return "—";
  if (manwon >= 10_000) return `${(manwon / 10_000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

function toTrades(tx: ComplexTransactionRow[]): TradeItem[] {
  // 과거→최신 순 입력 — 최신 3건을 최신순으로
  const items: TradeItem[] = [];
  for (let i = tx.length - 1; i >= 0 && items.length < 3; i--) {
    const row = tx[i];
    const prev = i > 0 ? tx[i - 1].avg_manwon : undefined;
    // 그 달 거래가 3건 미만이면 등락률 대신 "표본 부족" (공통 헬퍼 규칙)
    const { delta, tone } = deltaLabel(pctDelta(row.avg_manwon, prev), row.deal_count);
    items.push({
      date: `${row.yyyymm.slice(0, 4)}.${row.yyyymm.slice(4, 6)}`,
      price: formatManwon(row.avg_manwon),
      sub: `${row.deal_count}건`,
      delta,
      tone,
    });
  }
  return items;
}

/** 배치 조회로 만든 단지별 부가정보 — 실거래에서 직접 얻을 수 있는 실값만 */
interface ComplexFacts {
  /** 최근 24개월 거래의 build_year 최빈값(없으면 null) */
  buildYear: number | null;
  /** 최근 24개월 거래 전용면적 평균(㎡) */
  avgAreaM2: number | null;
}

function toDanjiItem(
  regionName: string,
  complexName: string,
  tx: ComplexTransactionRow[],
  facts: ComplexFacts,
  coord: { lat: number; lng: number },
  myNoteCount: number,
): DanjiItem {
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  const prev = tx.length > 1 ? tx[tx.length - 2] : null;
  const momPct = latest ? pctDelta(latest.avg_manwon, prev?.avg_manwon) : null;
  // 최신월 표본이 3건 미만이면 전월비 대신 "표본 부족" (item3 — pctDelta 공통 헬퍼)
  const { delta, tone } = deltaLabel(momPct, latest?.deal_count ?? null);
  const { district } = splitRegion(regionName);
  const metaParts = [
    facts.buildYear ? `${facts.buildYear}년` : null,
    district || null,
  ].filter((v): v is string => Boolean(v));
  return {
    id: encodeComplexId(regionName, complexName),
    name: complexName,
    note: myNoteCount > 0 ? `노트 ${myNoteCount}건` : null,
    meta: metaParts.length > 0 ? metaParts.join(" · ") : "정보 준비 중",
    price: latest ? formatManwon(latest.avg_manwon) : "시세 준비 중",
    delta,
    deltaTone: tone,
    size: "면적 통합",
    lat: coord.lat,
    lng: coord.lng,
    avgPriceWon: latest ? latest.avg_manwon * 10_000 : null,
    momPct,
    areaM2: facts.avgAreaM2,
    buildYear: facts.buildYear,
    households: null, // 세대수 실데이터 소스 미연동 — 필터 칩도 "데이터 준비 중"으로 비활성
    buildingType: "아파트", // 국토부 아파트 실거래만 수집 — 유형 칩도 아파트 단일
    trades: toTrades(tx),
    latestYm: latest ? `${latest.yyyymm.slice(0, 4)}.${latest.yyyymm.slice(4, 6)}` : null,
    latestDealCount: latest?.deal_count ?? null,
  };
}

/** region_name("서울 송파구") → city/district */
function splitRegion(region: string): { city: string; district: string } {
  const parts = region.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { city: region, district: region };
  return { city: parts[0], district: parts.slice(1).join(" ") };
}

/** 좌표 캐시(complex_geocode)에 저장된 지오코딩 완료 단지 조회 */
async function loadGeocodedComplexes(
  limit: number,
): Promise<{ region_name: string; complex_name: string; lat: number; lng: number }[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("complex_geocode")
    .select("region_name, complex_name, lat, lng")
    .eq("status", "ok")
    .not("lat", "is", null)
    .order("trade_count", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (
    (data as
      | { region_name: string; complex_name: string; lat: number; lng: number }[]
      | null) ?? []
  ).filter((g) => g.complex_name && Number.isFinite(g.lat) && Number.isFinite(g.lng));
}

/** 단지 키 — 배치 행과 좌표 행을 잇는다 */
function pairKey(region: string, name: string): string {
  return `${region}${name}`;
}

/** N개월 전 YYYYMM (contract_ym 텍스트 비교용) */
function ymMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 배치 조회 하드캡 — 최신월부터 담기므로 잘려도 최근 데이터가 남는다 */
const MAX_TX_ROWS = 12_000;
/** 실거래 조회 기간(개월) — 단지별 전량 조회 대신 최근 24개월만 */
const TX_LOOKBACK_MONTHS = 24;

interface TxRow {
  region_name: string;
  complex_name: string;
  contract_ym: string;
  deal_amount_krw: number;
  area_m2: number | null;
  build_year: number | null;
}

/**
 * 지도 목록 단지들의 실거래를 **한 번의 IN 쿼리**로 배치 조회.
 * 예전엔 단지 30개 × getTransactionHistory(전 기간) 병렬 30콜(N+1)이었다.
 * 최근 24개월로 제한하고 (region,name) 쌍 재검증으로 IN×IN 교차곱 오매칭을 거른다.
 */
async function fetchTxBatch(
  geo: { region_name: string; complex_name: string }[],
): Promise<Map<string, TxRow[]>> {
  const out = new Map<string, TxRow[]>();
  const sb = getServiceSupabase();
  if (!sb || geo.length === 0) return out;
  const regions = [...new Set(geo.map((g) => g.region_name))];
  const names = [...new Set(geo.map((g) => g.complex_name))];
  const want = new Set(geo.map((g) => pairKey(g.region_name, g.complex_name)));
  const { data } = await sb
    .from("market_transactions")
    .select("region_name, complex_name, contract_ym, deal_amount_krw, area_m2, build_year")
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .gt("deal_amount_krw", 0)
    .gte("contract_ym", ymMonthsAgo(TX_LOOKBACK_MONTHS))
    .in("region_name", regions)
    .in("complex_name", names)
    .order("contract_ym", { ascending: false })
    .limit(MAX_TX_ROWS);
  for (const r of (data as TxRow[] | null) ?? []) {
    const key = pairKey(r.region_name, r.complex_name);
    if (!want.has(key)) continue;
    const arr = out.get(key);
    if (arr) arr.push(r);
    else out.set(key, [r]);
  }
  return out;
}

/** 단지 한 곳의 배치 행 → 월별 집계(과거→최신, 최근 6개월) + 부가정보 */
function aggregateComplex(
  complexId: string,
  rows: TxRow[],
): { tx: ComplexTransactionRow[]; facts: ComplexFacts } {
  const byYm = new Map<string, { sum: number; n: number; min: number; max: number }>();
  let areaSum = 0;
  let areaN = 0;
  const yearVotes = new Map<number, number>();
  for (const r of rows) {
    const amt = Number(r.deal_amount_krw);
    if (!r.contract_ym || !Number.isFinite(amt) || amt <= 0) continue;
    const cur = byYm.get(r.contract_ym) ?? { sum: 0, n: 0, min: amt, max: amt };
    cur.sum += amt;
    cur.n += 1;
    cur.min = Math.min(cur.min, amt);
    cur.max = Math.max(cur.max, amt);
    byYm.set(r.contract_ym, cur);
    const area = r.area_m2 != null ? Number(r.area_m2) : NaN;
    if (Number.isFinite(area) && area > 0) {
      areaSum += area;
      areaN += 1;
    }
    const by = r.build_year != null ? Number(r.build_year) : NaN;
    if (Number.isFinite(by) && by > 1900) {
      yearVotes.set(by, (yearVotes.get(by) ?? 0) + 1);
    }
  }
  const tx: ComplexTransactionRow[] = [...byYm.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([ym, v]) => ({
      complex_id: complexId,
      yyyymm: ym,
      area_m2: null,
      avg_manwon: Math.round(v.sum / v.n / 10_000),
      min_manwon: Math.round(v.min / 10_000),
      max_manwon: Math.round(v.max / 10_000),
      deal_count: v.n,
      source: "molit",
    }));
  let buildYear: number | null = null;
  let bestVotes = 0;
  for (const [year, votes] of yearVotes) {
    if (votes > bestVotes || (votes === bestVotes && buildYear != null && year > buildYear)) {
      bestVotes = votes;
      buildYear = year;
    }
  }
  return {
    tx,
    facts: {
      buildYear,
      avgAreaM2: areaN > 0 ? Math.round((areaSum / areaN) * 10) / 10 : null,
    },
  };
}

/** 단지명 정규화 — 내 노트 apt_name 매칭 기준(공백·후행 "아파트" 제거) */
function normalizeName(s: string): string {
  return s.replace(/\s+/g, "").replace(/아파트$/, "");
}

/**
 * 세션 사용자의 임장노트 수를 단지명(정규화) 기준으로 집계 (item10).
 * 목록·범례의 "임장한 단지" 표시가 실제 내 노트 유무를 반영하게 한다.
 * 실패·비로그인 시 빈 맵 — note 는 null 로 남는다.
 */
async function fetchMyNoteCounts(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) return out;
    const sb = getServiceSupabase();
    if (!sb) return out;
    const { data } = await sb
      .from("inspection_notes")
      .select("apt_name")
      .eq("author_email", email)
      .not("apt_name", "is", null)
      .limit(300);
    for (const r of (data as { apt_name: string | null }[] | null) ?? []) {
      const key = normalizeName(r.apt_name ?? "");
      if (!key) continue;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  } catch {
    // 세션/조회 실패 — 노트 표시 없이 진행
  }
  return out;
}

/**
 * 실거래·지오코딩 좌표 기반 지도 단지 로드.
 * 좌표 캐시만 읽는다 — 백필은 cron(geocode-complexes)이 담당하고,
 * 요청 경로의 동기 지오코딩(예전 부트스트랩)은 응답 지연 요인이라 제거했다.
 */
async function loadDanjiFromDb(): Promise<{ items: DanjiItem[]; region: string } | null> {
  try {
    const geo = await loadGeocodedComplexes(30);
    if (geo.length === 0) return null;

    const [txByComplex, myNotes] = await Promise.all([
      fetchTxBatch(geo),
      fetchMyNoteCounts(),
    ]);

    const items = geo.map((g) => {
      const id = encodeComplexId(g.region_name, g.complex_name);
      const rows = txByComplex.get(pairKey(g.region_name, g.complex_name)) ?? [];
      const { tx, facts } = aggregateComplex(id, rows);
      const myNoteCount = myNotes.get(normalizeName(g.complex_name)) ?? 0;
      return toDanjiItem(
        g.region_name,
        g.complex_name,
        tx,
        facts,
        { lat: g.lat, lng: g.lng },
        myNoteCount,
      );
    });

    // 패널 헤더 라벨 — 최빈 시/도
    const counts = new Map<string, number>();
    for (const g of geo) {
      const { city } = splitRegion(g.region_name);
      if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    let region = "수도권";
    let best = 0;
    for (const [k, n] of counts) {
      if (n > best) {
        best = n;
        region = k;
      }
    }
    return { items, region };
  } catch {
    return null;
  }
}

export default async function MapPage() {
  // 사실 우선: DB 조회 실패/빈 결과 시 허위 단지(공작아파트 등) 대신 빈 목록 — 지도만 표시
  const [db, regionMarkers] = await Promise.all([
    loadDanjiFromDb(),
    loadRegionMarketMarkers().catch(() => []),
  ]);
  return (
    <MapClient
      danji={db?.items ?? []}
      regionLabel={db?.region ?? "수도권"}
      regionMarkers={regionMarkers}
    />
  );
}
