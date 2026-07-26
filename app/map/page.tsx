import { MapClient, type DanjiItem, type TradeItem } from "./map-client";
import { encodeComplexId, type ComplexTransactionRow } from "@/lib/complex/complex-store";
import { loadRegionMarketMarkers } from "@/lib/map/region-market";
import { pctDelta, deltaLabel } from "@/lib/map/trade-stats";
import { getServiceSupabase } from "@/lib/supabase/service";
import { auth } from "@/auth";
import { logger } from "@/lib/log";
import { withBudget } from "@/lib/async/with-budget";

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
  /* 2026-07-26: 실패를 `[]` 로 삼켰다. 그러면 지도 좌측 패널이 "수도권 단지 0",
     모바일 목록이 "이 지역 단지 목록을 준비 중이에요" 로 그려진다 — 좌표 캐시를
     못 읽은 것뿐인데 아직 준비가 안 된 서비스처럼 보인다. 실패는 던진다.
     (행이 0개인 것은 진짜 빈 상태이므로 그대로 `[]`.) */
  const sb = getServiceSupabase();
  if (!sb) throw new Error("[map] Supabase 서비스 클라이언트를 만들 수 없습니다 (환경변수 누락)");
  const { data, error } = await sb
    .from("complex_geocode")
    .select("region_name, complex_name, lat, lng")
    .eq("status", "ok")
    .not("lat", "is", null)
    .order("trade_count", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`complex_geocode 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("complex_geocode 응답이 배열이 아닙니다");
  return (
    data as { region_name: string; complex_name: string; lat: number; lng: number }[]
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

/**
 * 지도 데이터 한 블록에 주는 시간(ms).
 *
 * 이 라우트는 maxDuration=300 이고, DB 가 밀리는 날 실제로 그 300초를 다 태우고
 * `Vercel Runtime Timeout Error` 로 죽은 기록이 있다. 그렇게 죽으면 화면이 아예
 * 안 뜬다 — 아래 danjiLoadFailed 안내조차 못 보여 준다. 45초에 접으면 적어도
 * "지금은 못 불러왔다"는 화면은 뜬다.
 *
 * 45초로 잡은 이유: 사이트맵 섹션 로더와 같은 값이다(SECTION_LOAD_BUDGET_MS).
 * 정상일 때 이 두 조회는 수 초 안에 끝나므로, 45초를 넘겼다는 건 이미
 * "느린 날"이 아니라 "안 되는 날"이라는 뜻이다.
 */
const MAP_SECTION_BUDGET_MS = 45_000;

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
  const { data, error } = await sb
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
  /* 이 조회 하나가 목록 전체의 시세를 담당한다. 실패를 빈 맵으로 흘려보내면
     30개 단지가 **모두** "시세 준비 중" 으로 그려진다 — 실거래가 멀쩡히 쌓여
     있는 단지들에 대고 "아직 데이터가 없다"고 단정하는 셈이다.
     loadDanjiFromDb 는 이미 실패를 던지도록 되어 있고(위 주석), MapPage 는
     dbRun.state === "error" 를 따로 안내한다. 여기서도 못 읽었으면 던진다. */
  if (error) {
    throw new Error(
      `market_transactions 조회 실패 (지도 시세 배치): ${error.message ?? "알 수 없는 오류"}`,
    );
  }
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
async function loadDanjiFromDb(): Promise<{ items: DanjiItem[]; region: string }> {
  /* 2026-07-26: 통째로 try/catch 해서 조회 실패도 `null`, 좌표가 0건인 것도 `null`
     이었다. 호출부는 둘을 구분할 방법이 없어서 두 경우 모두 "단지 0" 으로 그렸다.
     이제 실패는 던지고, 빈 결과만 빈 목록으로 돌려준다. */
  const geo = await loadGeocodedComplexes(30);
  if (geo.length === 0) return { items: [], region: "수도권" };

  const [txByComplex, myNotes] = await Promise.all([fetchTxBatch(geo), fetchMyNoteCounts()]);

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
}

export default async function MapPage() {
  /* 사실 우선: 허위 단지(공작아파트 등)를 채우지 않는다. 다만 "조회 실패" 와
     "빈 결과" 는 갈라서 내려보낸다 — 예전에는 둘 다 빈 목록이라 화면이
     "이 지역 단지 목록을 준비 중이에요" 라고 잘못 안내했다. */
  /* 상한을 두는 이유: DB 가 밀리는 날 이 페이지가 300초를 다 태우고
     `Vercel Runtime Timeout Error` 로 죽은 기록이 있다. 그러면 화면이 아예 안 뜬다 —
     아래 danjiLoadFailed 안내조차 못 보여 준다. 45초에 접으면 적어도 "지금은 못
     불러왔다"는 화면은 뜬다. 늦게라도 정확한 답보다 제때 뜨는 답이 낫다. */
  const [dbRun, markersRun] = await Promise.all([
    withBudget(
      Promise.resolve().then(() => loadDanjiFromDb()),
      MAP_SECTION_BUDGET_MS,
    ),
    withBudget(
      Promise.resolve().then(() => loadRegionMarketMarkers()),
      MAP_SECTION_BUDGET_MS,
    ),
  ]);

  if (dbRun.state === "timeout") {
    logger.error(`[map] 단지 목록 조회가 ${MAP_SECTION_BUDGET_MS}ms 안에 끝나지 않았습니다`);
  } else if (dbRun.state === "error") {
    logger.error("[map] 단지 목록 조회 실패", dbRun.error);
  }
  if (markersRun.state === "timeout") {
    logger.error(`[map] 지역 시세 마커 조회가 ${MAP_SECTION_BUDGET_MS}ms 안에 끝나지 않았습니다`);
  } else if (markersRun.state === "error") {
    logger.error("[map] 지역 시세 마커 조회 실패", markersRun.error);
  }

  const dbLoaded =
    dbRun.state === "ok" ? { ok: true as const, value: dbRun.value } : { ok: false as const };
  const markersLoaded =
    markersRun.state === "ok"
      ? { ok: true as const, value: markersRun.value }
      : { ok: false as const };

  return (
    <MapClient
      danji={dbLoaded.ok ? dbLoaded.value.items : []}
      regionLabel={dbLoaded.ok ? dbLoaded.value.region : "수도권"}
      regionMarkers={markersLoaded.ok ? markersLoaded.value : []}
      danjiLoadFailed={!dbLoaded.ok}
      regionMarkersLoadFailed={!markersLoaded.ok}
    />
  );
}
