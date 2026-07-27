/**
 * GET /api/regions/search?q=&limit=12
 *
 * 관심 지역 자동완성 — 시군구 265개(legal_regions) 이름 검색.
 *
 * 왜 만들었나: 가입(/signup)·온보딩(/welcome)의 "관심 지역"이 코드에 박아 둔
 * 목록이었다. /signup 은 3개("안양 관양동"·"서울 마포구"·"과천시")가 전부였고,
 * 옆의 "⌕ 검색"은 핸들러가 없는 <span> 이라 눌러도 아무 반응이 없었다.
 * 목록에 없는 동네에 사는 사람은 관심 지역을 고를 방법 자체가 없었다.
 *
 * q 가 비면 인기 지역 기본 목록(legal_regions.priority 순)을 돌려준다 —
 * 화면에 처음 뜨는 칩이 여기서 온다.
 *
 * 반환하는 display_name 은 "서울 마포구"·"성남 분당구"·"과천시" 형식으로,
 * 기존 소비처(/api/me/alerts value, /notes/new?region=, 홈 개인화 매칭)가
 * 쓰던 문자열과 같은 모양이라 저장 형식을 바꾸지 않는다.
 *
 * 로그인 전 화면이 쓰므로 익명 접근이 가능해야 한다(RPC 도 anon grant).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

const MAX_LIMIT = 30;
const DEFAULT_LIMIT = 12;

export interface RegionSuggestItem {
  /** 법정동 시군구 코드(5자리) — 값의 안정적인 키 */
  code: string;
  /** 화면·저장에 쓰는 표기 ("서울 마포구") */
  name: string;
  sido: string;
  sigungu: string;
  lat: number | null;
  lng: number | null;
}

type Row = {
  lawd_cd: string;
  display_name: string;
  sido: string;
  sigungu: string;
  lat: number | null;
  lng: number | null;
};

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)))
    : DEFAULT_LIMIT;

  const sb = getReadOnlySupabase();
  if (!sb) {
    return NextResponse.json(
      { error: "데이터베이스에 연결할 수 없습니다." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await sb.rpc("search_regions", {
    p_q: q === "" ? null : q,
    p_limit: limit,
  });

  /* 조회 실패를 빈 목록으로 흘리지 않는다. 빈 목록은 화면에서 "그런 지역이
     없습니다"로 읽히는데, 우리는 없다는 걸 확인한 적이 없다 — 못 읽었을 뿐이다.
     게다가 그 응답이 CDN 에 얹히면 한 시간 동안 그 거짓이 굳는다. */
  if (error) {
    logger.warn("[regions/search] search_regions 실패", { message: error.message });
    return NextResponse.json(
      { error: "지역을 불러오지 못했습니다." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const items: RegionSuggestItem[] = ((data as Row[] | null) ?? []).map((r) => ({
    code: r.lawd_cd,
    name: r.display_name,
    sido: r.sido,
    sigungu: r.sigungu,
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
  }));

  return NextResponse.json(
    { query: q, items },
    {
      headers: {
        // 시군구 목록은 거의 안 바뀐다. 프리픽스별로 오래 재활용해도 안전하다.
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
