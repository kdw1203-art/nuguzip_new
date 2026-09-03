/**
 * 전문가 견적 요청 (숨고 벤치마크 — docs/benchmark-proposals.md A4)
 * POST /api/market-requests — 카테고리+지역+내용 → market_requests 저장 (authed, 3회/시간)
 * GET  /api/market-requests — 내 요청 목록 (authed)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { createMarketRequest, listMyMarketRequests } from "@/lib/market/store-db";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { QUOTE_CATEGORIES, isQuoteCategory } from "@/lib/experts/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* [953] 견적 요청 카테고리는 lib/experts/taxonomy.ts(SPECIALTIES.quotable) 한 곳에서 —
   목록 필터·프로필 분야와 같은 라벨을 쓴다(예전엔 "세무"·"대출" 처럼 필터 칩과
   다른 이름이라 요청과 전문가가 서로 닿지 않았다). */

/** 요청자 라벨 — 닉네임 없으면 이메일 마스킹 (목록 공개 시 원본 이메일 노출 금지) */
function requesterLabel(name: string | null | undefined, email: string): string {
  const n = (name ?? "").trim();
  if (n) return n;
  const local = email.split("@")[0] ?? "";
  return `${local.slice(0, 2) || "의뢰"}** 이웃`;
}

export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const items = await listMyMarketRequests(session.user.email);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  // IP당 1시간에 3회 (인스턴스별 best-effort)
  const rlIp = rateLimit(`market-request:${getClientIp(req)}`, {
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfterSec);

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 계정당 1시간에 3회
  const rlUser = rateLimit(`market-request:user:${session.user.email}`, {
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!rlUser.ok) return tooManyRequests(rlUser.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const category = String(body.category ?? "").trim();
  if (!isQuoteCategory(category)) {
    return NextResponse.json(
      { error: `카테고리는 ${QUOTE_CATEGORIES.join("·")} 중 하나여야 합니다.` },
      { status: 400 },
    );
  }

  const city = String(body.city ?? "").trim().slice(0, 40);
  const district = String(body.district ?? "").trim().slice(0, 60);
  if (!city || !district) {
    return NextResponse.json(
      { error: "지역(시/도, 시·군·구)을 입력해 주세요." },
      { status: 400 },
    );
  }

  const content = String(body.content ?? "").trim();
  if (content.length < 10) {
    return NextResponse.json(
      { error: "요청 내용은 10자 이상 입력해 주세요." },
      { status: 400 },
    );
  }
  if (content.length > 2000) {
    return NextResponse.json(
      { error: "요청 내용은 2,000자 이하로 입력해 주세요." },
      { status: 400 },
    );
  }

  try {
    const request = await createMarketRequest({
      requesterEmail: session.user.email,
      requesterLabel: requesterLabel(session.user.name, session.user.email),
      title: `[${category}] ${district} 견적 요청`,
      description: content,
      requestType: category,
      city,
      district,
    });
    return NextResponse.json({ ok: true, request }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "견적 요청 접수 실패" },
      { status: 500 },
    );
  }
}
