/**
 * 매물 문의 남기기 — POST /api/listings/[id]/inquire
 * 로그인 필수. 관심 구매/임차자가 승인 매물에 문의(리드)를 남긴다.
 * body: { message: string, contact?: string }
 * 본인(등록자) 매물엔 문의 불가. 스팸 방지 시간당 8건 제한.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { createInquiry, INQUIRY_MESSAGE_MAX } from "@/lib/listings/inquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 문의자 표시명 — 닉네임 없으면 이메일 로컬부 마스킹(원본 이메일 비노출). */
function inquirerLabel(name: string | null | undefined, email: string): string {
  const n = (name ?? "").trim();
  if (n) return n;
  const local = email.split("@")[0] ?? "";
  return `${local.slice(0, 2) || "문의"}** 님`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!listingId) {
    return NextResponse.json({ error: "매물 ID가 필요합니다." }, { status: 400 });
  }

  // 스팸 방지 — 이메일+IP 기준 시간당 8건.
  const ip = getClientIp(req);
  const rl = rateLimit(`inquire:${email.toLowerCase()}:${ip}`, {
    limit: 8,
    windowMs: 3_600_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let message = "";
  let contact: string | null = null;
  try {
    const body = (await req.json()) as { message?: unknown; contact?: unknown };
    message = typeof body.message === "string" ? body.message : "";
    contact = typeof body.contact === "string" ? body.contact : null;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!message.trim()) {
    return NextResponse.json({ error: "문의 내용을 입력해 주세요." }, { status: 400 });
  }
  if (message.length > INQUIRY_MESSAGE_MAX + 200) {
    return NextResponse.json(
      { error: `문의는 ${INQUIRY_MESSAGE_MAX}자까지 남길 수 있어요.` },
      { status: 400 },
    );
  }

  const result = await createInquiry({
    listingId,
    inquirerEmail: email,
    inquirerLabel: inquirerLabel(session.user?.name, email),
    contact,
    message,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "self":
        return NextResponse.json(
          { error: "내가 등록한 매물에는 문의를 남길 수 없어요." },
          { status: 400 },
        );
      case "not_found":
        return NextResponse.json(
          { error: "노출 중인 매물에만 문의할 수 있어요." },
          { status: 404 },
        );
      case "invalid":
        return NextResponse.json({ error: "문의 내용을 입력해 주세요." }, { status: 400 });
      default:
        return NextResponse.json(
          { error: "문의 접수에 실패했어요. 잠시 후 다시 시도해 주세요." },
          { status: 503 },
        );
    }
  }

  return NextResponse.json({ ok: true, id: result.id });
}
