import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { isPastBidEnd } from "@/lib/onbid/store";
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";

/* [지도확장 2차 · 937] 공매 물건 구 단위 배지 레이어.
 *
 * 온비드 공매 물건(onbid_auctions)은 좌표가 없다 — 주소는 시군구·읍면동
 * 텍스트뿐이다. 개별 핀을 찍으면 허위 위치가 되므로(사실 우선), 구 단위로
 * 집계해 좌표 카탈로그(SEOUL_DISTRICTS·METRO_EXPLORE_DISTRICTS)의 구 중심에
 * "공매 N건" 배지로 올린다. 상세는 /auctions?gu= 로 넘긴다.
 *
 * 시도 구분 매칭: 서울 "중구"와 인천 "중구"는 이름이 같다 — sido 로 갈라
 * 매칭하지 않으면 인천 물건이 서울 좌표에 찍힌다.
 */

export const runtime = "nodejs";
export const revalidate = 3600;

type Agg = { count: number; minBidKrw: number | null };

function cityKeyFromSido(sido: string): string | null {
  if (sido.startsWith("서울")) return "서울";
  if (sido.startsWith("경기")) return "경기";
  if (sido.startsWith("인천")) return "인천";
  return null; // 그 외 시도는 좌표 카탈로그가 없다 — 매칭 불가로 셈만 한다
}

function coordKey(city: string, rawName: string): string {
  let n = rawName.replace(/\s+/g, "");
  if (n.startsWith(city)) n = n.slice(city.length); // "인천 중구" → "중구"
  return `${city}|${n}`;
}

export async function GET() {
  const sb = getServiceSupabase();
  if (!sb) return dbUnavailable("map/auctions", new Error("service client 미구성"));

  /* [938 수리] `.limit(5000)` 한 방 조회는 PostgREST 기본 상한(1,000행)에 조용히
     잘렸다 — 실측: 전체 1,563건인데 activeTotal 이 1,000으로 내려가 배지 건수가
     전부 축소돼 있었다. 잘림은 오류가 아니라서 아무도 몰랐다. 1,000행씩
     .range() 페이지로 전량을 받는다(안전 상한 10페이지 = 1만 건). */
  const PAGE = 1000;
  const MAX_PAGES = 10;
  const rows: Array<Record<string, unknown>> = [];
  for (let p = 0; p < MAX_PAGES; p += 1) {
    const { data, error } = await sb
      .from("onbid_auctions")
      .select("sido, sigungu, bid_end, min_bid_krw")
      .order("id", { ascending: true })
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: "공매 집계 조회 실패" }, { status: 503 });
    }
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < PAGE) break; // 마지막 페이지
  }

  const now = new Date();
  const byKey = new Map<string, Agg>();
  let active = 0;
  for (const r of rows) {
    const bidEnd = r.bid_end == null ? null : String(r.bid_end);
    if (isPastBidEnd(bidEnd, now)) continue; // 입찰이 끝난 물건은 지도에 올리지 않는다
    active += 1;
    const sido = String(r.sido ?? "").trim();
    const sigungu = String(r.sigungu ?? "").trim();
    const city = cityKeyFromSido(sido);
    if (!city || !sigungu) continue; // active에는 세고 matched에는 못 드니 uncharted로 잡힌다
    const key = coordKey(city, sigungu);
    const prev = byKey.get(key) ?? { count: 0, minBidKrw: null };
    prev.count += 1;
    const bid = r.min_bid_krw != null ? Number(r.min_bid_krw) : NaN;
    if (Number.isFinite(bid) && bid > 0) {
      prev.minBidKrw = prev.minBidKrw == null ? bid : Math.min(prev.minBidKrw, bid);
    }
    byKey.set(key, prev);
  }

  const items: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    count: number;
    minBidKrw: number | null;
  }> = [];
  let matched = 0;
  for (const d of [...SEOUL_DISTRICTS, ...METRO_EXPLORE_DISTRICTS]) {
    const city = d.city ?? "서울";
    const agg = byKey.get(coordKey(city, d.name));
    if (!agg || agg.count === 0) continue;
    matched += agg.count;
    items.push({
      id: d.id,
      name: d.name,
      lat: d.lat,
      lng: d.lng,
      count: agg.count,
      minBidKrw: agg.minBidKrw,
    });
  }

  return NextResponse.json(
    /* uncharted: 진행 중이지만 좌표 카탈로그에 없는 구(비수도권 등) 물건 수 —
       지도에 안 보이는 물건이 있으면 그 수를 정직하게 내려보낸다. */
    { items, activeTotal: active, uncharted: active - matched },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600" } },
  );
}
