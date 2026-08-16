import { NextResponse } from "next/server";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { recordRegionDemand, sanitizeDemandEmail } from "@/lib/coverage/store-db";
import { logger } from "@/lib/log";

/* POST /api/coverage/request — 검색 무결과에서 "열리면 알려주세요" 수집(#413).
 *
 * 무인증 허용(가입 전 방문자의 수요가 핵심이라 로그인 강제는 목적 훼손).
 * 보호: IP 슬라이딩 윈도(10회/시간) + 길이 캡 + (query_norm, day) 유니크로
 * 테이블 증식 상한. 실패는 500 으로 드러낸다 — 조용한 200 은 "기록됐겠지"를 낳는다. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit(`coverage:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: { query?: unknown; email?: unknown; source?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query || query.length > 80) {
    return NextResponse.json({ error: "검색어가 비었거나 너무 깁니다." }, { status: 400 });
  }
  const source =
    typeof body.source === "string" && body.source.trim() ? body.source.trim() : "search";
  const email = sanitizeDemandEmail(body.email);

  try {
    await recordRegionDemand({ query, source, email });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[coverage] 수요 기록 실패", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "지금은 기록하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
