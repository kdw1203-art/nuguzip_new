/**
 * 어드민 매물 검수 — PATCH /api/admin/listings
 * body: { id, action: "approve" | "reject", reason? }
 * 관리자 게이트: isAdminApiRequest (staff-roles 재사용)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { updateListingStatus } from "@/lib/listings/store-db";
import { awardPoints } from "@/lib/points/ledger";
import { getServiceSupabase } from "@/lib/supabase/service";

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

  // 승인 시 포인트 적립 — awardPoints 가 캡·중복·once 를 방어하므로 그대로 호출.
  // refId=listingId 로 재승인 중복 지급을 막고, 적립 실패는 승인 결과에 영향 주지 않음.
  if (action === "approve") {
    try {
      const sb = getServiceSupabase();
      if (sb) {
        const { data } = await sb.from("listings").select("*").eq("id", id).maybeSingle();
        const row = (data ?? null) as Record<string, unknown> | null;
        const authorEmail = String(row?.author_email ?? "").trim();
        if (row && authorEmail) {
          await awardPoints(authorEmail, "listing_approved", id);
          await awardPoints(authorEmail, "listing_first"); // once:true → 최초 승인만 1회 지급
          if (row.owner_verified === true) {
            await awardPoints(authorEmail, "listing_owner_verified", id);
          }
          const photos = row.photos;
          if (Array.isArray(photos) && photos.length >= 3) {
            await awardPoints(authorEmail, "listing_photos", id);
          }
        }
      }
    } catch {
      // 적립 중 오류가 나도 승인 자체는 성공 처리한다.
    }
  }

  return NextResponse.json({ ok: true });
}
