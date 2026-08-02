import type { NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/log";
import {
  publicApiBadRequest,
  publicApiJson,
  publicApiOptions,
  publicApiUnavailable,
} from "@/lib/api/public-response";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  isProvisionalMonth,
  isValidMonth,
  listRegionMonthly,
} from "@/lib/api/public-aggregates";

/* N20 — 지역×월 집계. 이 API 의 본체다.
   잘못된 요청은 400(무엇이 틀렸는지 적는다), 조회 실패는 503 이다.
   빈 배열을 200 으로 돌려주는 경로는 "그 조건에 정말 행이 없다"일 때뿐이다. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return publicApiOptions();
}

/** 숫자 파라미터를 읽는다. 값이 있는데 숫자가 아니면 조용히 기본값으로 넘어가지 않는다. */
function parseInt10(raw: string | null): number | "invalid" | null {
  if (raw === null || raw.trim() === "") return null;
  if (!/^-?\d+$/.test(raw.trim())) return "invalid";
  return Number(raw.trim());
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, { max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;

  const monthRaw = sp.get("month")?.trim() ?? "";
  if (monthRaw && !isValidMonth(monthRaw)) {
    return publicApiBadRequest(
      `month 형식이 올바르지 않습니다: "${monthRaw}"`,
      "yyyymm 6자리로 보내주세요 (예: 202605). 사용 가능한 월은 /api/public/v1/months 에 있습니다.",
    );
  }

  const limitParsed = parseInt10(sp.get("limit"));
  if (limitParsed === "invalid") {
    return publicApiBadRequest("limit 은 정수여야 합니다.", `1~${MAX_LIMIT} 범위의 정수를 보내주세요.`);
  }
  if (typeof limitParsed === "number" && (limitParsed < 1 || limitParsed > MAX_LIMIT)) {
    return publicApiBadRequest(
      `limit 은 1 이상 ${MAX_LIMIT} 이하여야 합니다 (받은 값: ${limitParsed}).`,
      `한 번에 더 많이 받아야 하면 offset 으로 페이지를 넘겨주세요.`,
    );
  }
  const limit = typeof limitParsed === "number" ? limitParsed : DEFAULT_LIMIT;

  const offsetParsed = parseInt10(sp.get("offset"));
  if (offsetParsed === "invalid") {
    return publicApiBadRequest("offset 은 정수여야 합니다.", "0 이상의 정수를 보내주세요.");
  }
  if (typeof offsetParsed === "number" && offsetParsed < 0) {
    return publicApiBadRequest(
      `offset 은 0 이상이어야 합니다 (받은 값: ${offsetParsed}).`,
      "첫 페이지는 offset=0 입니다.",
    );
  }
  const offset = typeof offsetParsed === "number" ? offsetParsed : 0;

  /* 지역명은 부분 일치다. 빈 문자열이면 필터를 걸지 않는다(전체와 같다). */
  const region = sp.get("region")?.trim() ?? "";

  try {
    const { rows, total } = await listRegionMonthly({
      ...(monthRaw ? { month: monthRaw } : {}),
      ...(region ? { region } : {}),
      limit,
      offset,
    });

    return publicApiJson({
      query: {
        month: monthRaw || null,
        region: region || null,
        limit,
        offset,
      },
      /* total 은 필터를 적용한 전체 건수 — 페이지네이션을 끝까지 돌 수 있게 준다. */
      total,
      count: rows.length,
      hasMore: offset + rows.length < total,
      rows: rows.map((r) => ({ ...r, provisional: isProvisionalMonth(r.month) })),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logger.error("[api/public/v1/regions/monthly] 집계 조회 실패:", detail);
    /* 원문 에러(테이블명·제약조건 등 내부 정보)는 서버 로그로만 — 익명 응답에는
       일반 문구만 낸다(2026-08-02 감사). 실패를 빈 배열로 위장하지 않는 정책은
       그대로다(503). */
    return publicApiUnavailable("집계 조회가 잠시 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
