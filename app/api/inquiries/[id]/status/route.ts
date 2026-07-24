/**
 * 문의 상태 변경 — POST /api/inquiries/[id]/status
 * 로그인 필수 + 등록자 본인(listing_owner_email 일치)만.
 * body: { status: 'read' | 'replied' | 'archived' | 'new' }
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { updateInquiryStatus, isInquiryStatus } from "@/lib/listings/inquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const inquiryId = String(id ?? "").trim();
  if (!inquiryId) {
    return NextResponse.json({ error: "문의 ID가 필요합니다." }, { status: 400 });
  }

  let status = "";
  try {
    const body = (await req.json()) as { status?: unknown };
    status = typeof body.status === "string" ? body.status : "";
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!isInquiryStatus(status)) {
    return NextResponse.json({ error: "상태 값이 올바르지 않습니다." }, { status: 400 });
  }

  const ok = await updateInquiryStatus(inquiryId, email, status);
  if (!ok) {
    return NextResponse.json(
      { error: "본인 매물의 문의만 변경할 수 있어요." },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
