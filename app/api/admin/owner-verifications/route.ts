/**
 * PATCH /api/admin/owner-verifications
 * 매물 소유확인 신청 심사. body: { id, decision: "approve"|"reject", note? }
 *
 * 승인은 owner_verifications 에 심사 이력(심사자·시각·메모)을 남긴 뒤에만
 * listings.owner_verified 를 세운다. 반려는 사유가 필수다.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { reviewOwnerVerification } from "@/lib/listings/owner-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const session = await safeAuth();
  const reviewerEmail = session?.user?.email ?? "";

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const decision = String(body.decision ?? "").trim();
  const note = typeof body.note === "string" ? body.note.slice(0, 400) : "";

  if (!id || (decision !== "approve" && decision !== "reject")) {
    return NextResponse.json(
      { error: "id와 decision(approve|reject)이 필요합니다." },
      { status: 400 },
    );
  }

  const res = await reviewOwnerVerification({
    id,
    decision: decision as "approve" | "reject",
    adminNote: note,
    reviewerEmail,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
