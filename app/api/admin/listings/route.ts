/**
 * 어드민 매물 검수 — PATCH /api/admin/listings
 * body: { id, action: "approve" | "reject" | "verify", reason? }
 *   - approve/reject: 검수 승인/반려
 *   - verify: 소유확인 승인(owner_verified=true) + 포인트 적립 + 소유주 알림
 * 관리자 게이트: isAdminApiRequest (staff-roles 재사용)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { updateListingStatus } from "@/lib/listings/store-db";
import { awardPoints } from "@/lib/points/ledger";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { notifyNewListingSubscribers } from "@/lib/notifications/region-alerts";

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
  if (!id || (action !== "approve" && action !== "reject" && action !== "verify")) {
    return NextResponse.json(
      { error: "id와 action(approve|reject|verify)이 필요합니다." },
      { status: 400 },
    );
  }

  // 소유확인 승인 — 검수 상태와 별개로 owner_verified 플래그를 세운다.
  if (action === "verify") {
    const sb = getServiceSupabase();
    if (!sb) {
      return NextResponse.json(
        { error: "저장소가 준비되지 않았어요. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }
    const { data, error } = await sb
      .from("listings")
      .update({ owner_verified: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("author_email, complex_name")
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json(
        { error: "소유확인 처리에 실패했어요. 매물을 확인해 주세요." },
        { status: 500 },
      );
    }
    const row = data as { author_email?: string | null; complex_name?: string | null };
    const authorEmail = String(row.author_email ?? "").trim();
    if (authorEmail) {
      // 포인트 적립 — refId=listingId 로 재실행 중복 지급을 막는다(멱등).
      try {
        await awardPoints(authorEmail, "listing_owner_verified", id);
      } catch {
        // 적립 실패는 소유확인 결과에 영향 주지 않는다.
      }
      try {
        const complexName = String(row.complex_name ?? "").trim() || "매물";
        await appendInboxNotification({
          userEmail: authorEmail,
          title: "소유확인 완료",
          body: `'${complexName}' 소유확인이 완료돼 인증 배지가 표시됩니다.`,
          actionUrl: `/listings/${id}`,
        });
      } catch {
        // 알림 발송 실패는 소유확인 결과에 영향 주지 않는다.
      }
    }
    return NextResponse.json({ ok: true });
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

  // 승인 시 관심 지역/키워드 구독자에게 새 매물 알림 (best-effort · 실패해도 승인 유지)
  if (action === "approve") {
    try {
      const sb = getServiceSupabase();
      if (sb) {
        const { data } = await sb
          .from("listings")
          .select("id, region_name, complex_name, author_email")
          .eq("id", id)
          .maybeSingle();
        if (data) {
          const row = data as Record<string, unknown>;
          await notifyNewListingSubscribers({
            id: String(row.id ?? id),
            regionName: row.region_name != null ? String(row.region_name) : null,
            complexName: row.complex_name != null ? String(row.complex_name) : null,
            authorEmail: row.author_email != null ? String(row.author_email) : null,
          });
        }
      }
    } catch {
      // 구독자 알림 실패는 승인 결과에 영향 주지 않는다.
    }
  }

  // 인박스 알림 — 승인/반려 결과를 작성자에게 전달 (best-effort · 실패해도 검수 결과 유지)
  try {
    const sb = getServiceSupabase();
    if (sb) {
      const { data } = await sb
        .from("listings")
        .select("author_email, complex_name")
        .eq("id", id)
        .maybeSingle();
      const row = (data ?? null) as {
        author_email?: string | null;
        complex_name?: string | null;
      } | null;
      const authorEmail = String(row?.author_email ?? "").trim();
      if (authorEmail) {
        const complexName = String(row?.complex_name ?? "").trim() || "매물";
        if (action === "approve") {
          await appendInboxNotification({
            userEmail: authorEmail,
            title: "매물이 승인되었어요",
            body: `'${complexName}' 매물이 검수를 통과해 지도에 노출됩니다. 포인트가 지급되었어요.`,
            actionUrl: `/listings/${id}`,
          });
        } else {
          await appendInboxNotification({
            userEmail: authorEmail,
            title: "매물 검수 반려",
            body: `'${complexName}' 매물이 반려되었어요. 사유: ${reason}`,
            actionUrl: "/my/listings",
          });
        }
      }
    }
  } catch {
    // 알림 발송 실패는 검수 결과에 영향 주지 않는다.
  }

  return NextResponse.json({ ok: true });
}
