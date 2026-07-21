import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { awardPoints } from "@/lib/points/ledger";
import { listReviews, upsertReview, calcSummary } from "@/lib/complex-reviews/store-db";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** 작성자 이메일 마스킹 — 목록 공개 응답에 원본 이메일 노출 금지 */
function maskAuthor(email: string): string {
  const local = email.split("@")[0] ?? "";
  return `${local.slice(0, 2) || "이웃"}** 이웃`;
}

export async function GET(req: NextRequest) {
  const complexId = req.nextUrl.searchParams.get("complexId");
  if (!complexId) return NextResponse.json({ error: "complexId 가 필요합니다." }, { status: 400 });
  const rows = await listReviews(complexId);
  const summary = calcSummary(rows);
  const reviews = rows.map((r) => ({
    id: r.id,
    author: maskAuthor(r.authorEmail),
    noiseScore: r.noiseScore,
    parkingScore: r.parkingScore,
    mgmtScore: r.mgmtScore,
    neighborScore: r.neighborScore,
    transportScore: r.transportScore,
    comment: r.comment,
    createdAt: r.createdAt,
    helpfulCount: r.helpfulCount,
    isResident: r.isResident,
    isVisitVerified: r.isVisitVerified,
    residentPeriod: r.residentPeriod,
  }));
  return NextResponse.json({ reviews, summary });
}

export async function POST(req: NextRequest) {
  // IP당 1시간에 5회 (인스턴스별 best-effort)
  const rlIp = rateLimit(`complex-review:${getClientIp(req)}`, {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfterSec);

  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  // 계정당 1시간에 5회
  const rlUser = rateLimit(`complex-review:user:${session.user.email}`, {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rlUser.ok) return tooManyRequests(rlUser.retryAfterSec);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 }); }

  const complexId = String(body.complexId ?? "").trim().slice(0, 160);
  const complexName = String(body.complexName ?? "").trim().slice(0, 120);
  if (!complexId || !complexName) return NextResponse.json({ error: "complexId, complexName 이 필요합니다." }, { status: 400 });

  const toScore = (v: unknown, fallback = 3) => {
    const n = Number(v);
    return isNaN(n) ? fallback : Math.min(5, Math.max(1, Math.round(n)));
  };

  // 신뢰 신호(선택) — 미전송 시 기존 동작(false / null) 유지
  const residentPeriodRaw = body.residentPeriod ? String(body.residentPeriod).trim().slice(0, 60) : "";

  const review = await upsertReview({
    complexId,
    complexName,
    authorEmail: session.user.email,
    noiseScore: toScore(body.noiseScore),
    parkingScore: toScore(body.parkingScore),
    mgmtScore: toScore(body.mgmtScore),
    neighborScore: toScore(body.neighborScore),
    transportScore: toScore(body.transportScore),
    comment: body.comment ? String(body.comment).slice(0, 500) : null,
    isResident: body.isResident === true,
    isVisitVerified: body.isVisitVerified === true,
    residentPeriod: residentPeriodRaw || null,
  });
  // 후기 작성 적립 — refId=review.id 로 재작성(upsert) 중복 지급 방지.
  if (session.user.email) {
    await awardPoints(session.user.email, "review_written", review.id);
  }
  return NextResponse.json(review, { status: 201 });
}
