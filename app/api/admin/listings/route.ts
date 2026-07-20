/**
 * 어드민 매물 검수 — PATCH /api/admin/listings
 * body: { id, action: "approve" | "reject", reason? }
 * 관리자 게이트: isAdminApiRequest (staff-roles 재사용)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { updateListingStatus } from "@/lib/listings/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { error: "id와 action(approve|reject)이 필요합니다." },
      { status: 400 },
    );
  }

  const reason = String(body.reason ?? "").trim().slice(0, 500);
  if (action === "reject" && !reason) {
    return NextResponse.json({ error: "반려 사유를 입력해 주세요." }, { status: 400 });
  }

  const ok = await updateListingStatus(
    id,
    action === "approve" ? "approved" : "rejected",
    action === "reject" ? reason : null,
  );
  if (!ok) {
    return NextResponse.json(
      { error: "처리에 실패했어요. 이미 처리된 건인지 확인해 주세요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
