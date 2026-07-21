/**
 * 참여 문의 API.
 * POST /api/dev-deals/inquiry — authed(safeAuth) · 속도 제한 · {ok,id} 반환.
 * body: {dealId, fromCompany, partnerType, message, proposedTerms}
 * 문의·소개는 무료이며, 실제 계약·정산은 당사자 간에 진행된다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { createInquiry } from "@/lib/dev-deals/write";
import { getDeal } from "@/lib/dev-deals/store";
import { isPartnerType } from "@/lib/dev-deals/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rlIp = rateLimit(`dev-inquiry-create:${getClientIp(req)}`, {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfterSec);

  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rlUser = rateLimit(`dev-inquiry-create:user:${email}`, {
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!rlUser.ok) return tooManyRequests(rlUser.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const dealId = String(body.dealId ?? "").trim();
  if (!dealId) {
    return NextResponse.json({ error: "대상 개발물건이 없습니다." }, { status: 400 });
  }

  // 대상 물건 존재 확인
  const deal = await getDeal(dealId);
  if (!deal) {
    return NextResponse.json(
      { error: "대상 개발물건을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const message = String(body.message ?? "").trim().slice(0, 3000);
  if (message.length < 5) {
    return NextResponse.json(
      { error: "문의 내용을 5자 이상 입력해 주세요." },
      { status: 400 },
    );
  }

  const fromCompany = String(body.fromCompany ?? "").trim().slice(0, 120) || null;
  const partnerTypeRaw = String(body.partnerType ?? "").trim();
  const partnerType = isPartnerType(partnerTypeRaw) ? partnerTypeRaw : null;
  const proposedTerms = String(body.proposedTerms ?? "").trim().slice(0, 2000) || null;

  const result = await createInquiry({
    dealId,
    fromEmail: email,
    fromCompany,
    partnerType,
    message,
    proposedTerms,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "문의 접수에 실패했어요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
