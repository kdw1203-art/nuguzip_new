/**
 * 매물 소유확인 신청·심사 저장소 (서버 전용).
 *
 * 배경(I1): 소유확인은 "블라인드 승인" 상태였다.
 *  - 신청자가 올린 증빙(proofUrl)은 어디에도 저장되지 않고 신청자 본인에게 보내는
 *    인박스 알림만 남았다. 즉 관리자는 증빙을 본 적이 없다.
 *  - 관리자는 /api/admin/listings 의 action:"verify" 로 listings.owner_verified 를
 *    바로 true 로 바꿨다. 누가·언제·무엇을 근거로 인증했는지 기록이 남지 않았다.
 *
 * 소유확인 배지는 이용자가 "이 매물은 진짜 집주인"이라고 믿는 근거라, 근거 없는 배지는
 * 사실 왜곡이다. 이 모듈은 신청을 owner_verifications 에 적재하고, 심사 결과(승인/반려·
 * 심사자·시각·메모)를 남긴 뒤에만 배지를 세운다.
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { awardPoints } from "@/lib/points/ledger";
import { logger } from "@/lib/log";

export type OwnerVerificationStatus = "pending" | "approved" | "rejected";

export interface VerificationDocument {
  url: string;
  path: string | null;
  mime: string | null;
}

export interface OwnerVerificationItem {
  id: string;
  listingId: string | null;
  applicantEmail: string;
  complexName: string;
  region: string;
  propertyAddress: string;
  note: string;
  documents: VerificationDocument[];
  status: OwnerVerificationStatus;
  adminNote: string;
  reviewedAt: string | null;
  createdAt: string;
  /** 접수 후 경과 시간(시간) */
  ageHours: number;
}

function normStatus(v: unknown): OwnerVerificationStatus {
  const s = String(v ?? "pending");
  return s === "approved" || s === "rejected" ? s : "pending";
}

function parseDocuments(v: unknown): VerificationDocument[] {
  if (!Array.isArray(v)) return [];
  const out: VerificationDocument[] = [];
  for (const raw of v) {
    if (typeof raw === "string") {
      if (raw.trim()) out.push({ url: raw.trim(), path: null, mime: null });
      continue;
    }
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const url = String(o.url ?? "").trim();
      if (!url) continue;
      out.push({
        url,
        path: o.path ? String(o.path) : null,
        mime: o.mime ? String(o.mime) : null,
      });
    }
  }
  return out;
}

function toItem(r: Record<string, unknown>, now: number): OwnerVerificationItem {
  const createdAt = String(r.created_at ?? "");
  const t = new Date(createdAt).getTime();
  return {
    id: String(r.id),
    listingId: r.listing_id ? String(r.listing_id) : null,
    applicantEmail: String(r.applicant_email ?? ""),
    complexName: String(r.complex_name ?? ""),
    region: String(r.region ?? ""),
    propertyAddress: String(r.property_address ?? ""),
    note: String(r.note ?? ""),
    documents: parseDocuments(r.document_paths),
    status: normStatus(r.status),
    adminNote: String(r.admin_note ?? ""),
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    createdAt,
    ageHours: Number.isNaN(t) ? 0 : Math.max(0, (now - t) / 3_600_000),
  };
}

/** 이메일 → profiles.id. 없으면 null (owner_verifications.user_id 는 선택값). */
async function profileIdByEmail(email: string): Promise<string | null> {
  const sb = getServiceSupabase();
  if (!sb || !email) return null;
  const { data } = await sb
    .from("profiles")
    .select("id")
    .ilike("email", email.trim())
    .limit(1)
    .maybeSingle();
  const id = (data as { id?: string } | null)?.id;
  return id ? String(id) : null;
}

export type CreateResult =
  | { ok: true; id: string; alreadyPending?: false }
  | { ok: true; id: string | null; alreadyPending: true }
  | { ok: false; error: string };

/** 소유확인 신청 접수 — 증빙을 반드시 함께 적재한다. */
export async function createOwnerVerificationRequest(input: {
  listingId: string;
  applicantEmail: string;
  complexName: string;
  region: string;
  propertyAddress: string;
  note?: string;
  documents: VerificationDocument[];
}): Promise<CreateResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소가 준비되지 않았어요." };
  if (input.documents.length === 0) {
    return { ok: false, error: "증빙 파일이 필요합니다." };
  }

  // 같은 매물의 미처리 신청이 이미 있으면 중복 접수하지 않는다.
  const existing = await sb
    .from("owner_verifications")
    .select("id")
    .eq("listing_id", input.listingId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  const existingId = (existing.data as { id?: string } | null)?.id ?? null;
  if (existingId) return { ok: true, id: String(existingId), alreadyPending: true };

  const userId = await profileIdByEmail(input.applicantEmail);
  const { data, error } = await sb
    .from("owner_verifications")
    .insert({
      user_id: userId,
      listing_id: input.listingId,
      applicant_email: input.applicantEmail.trim().toLowerCase(),
      complex_name: input.complexName.slice(0, 200),
      region: input.region.slice(0, 100),
      property_address: input.propertyAddress.slice(0, 300),
      note: (input.note ?? "").slice(0, 500),
      document_paths: input.documents,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    logger.warn("[owner-verification] insert failed", error?.message ?? "no row");
    return { ok: false, error: "신청 저장에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true, id: String((data as { id: string }).id) };
}

/** 심사 큐 — 기본은 미처리 우선. */
export async function listOwnerVerifications(
  status: OwnerVerificationStatus | "all" = "all",
  limit = 100,
): Promise<OwnerVerificationItem[]> {
  /* 2026-07-26: 실패를 로그만 남기고 `[]` 로 넘겼다. 그러면 /admin/listings 는
     "소유확인 신청 0건"으로 읽는다 — 증빙을 올려 둔 신청자가 무기한 방치된다.
     실패는 던져서 호출부가 "지금 못 불러왔다"고 말하게 한다. */
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error(
      "[owner-verification] Supabase 서비스 클라이언트를 만들 수 없습니다 (SUPABASE_SERVICE_ROLE_KEY 누락)",
    );
  }
  let q = sb
    .from("owner_verifications")
    .select(
      "id,listing_id,applicant_email,complex_name,region,property_address,note,document_paths,status,admin_note,reviewed_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    logger.error("[owner-verification] 심사 큐 조회 실패", error.message);
    throw new Error(`owner_verifications 조회 실패: ${error.message}`);
  }
  const now = Date.now();
  const items = ((data as Record<string, unknown>[] | null) ?? []).map((r) => toItem(r, now));
  return items.sort((a, b) => {
    if ((a.status === "pending") !== (b.status === "pending")) {
      return a.status === "pending" ? -1 : 1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * 심사 처리. 승인일 때만 listings.owner_verified 를 세운다.
 * 이미 처리된 건은 다시 처리하지 않는다(중복 포인트 지급·중복 알림 방지).
 */
export async function reviewOwnerVerification(input: {
  id: string;
  decision: "approve" | "reject";
  adminNote?: string;
  reviewerEmail: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소가 준비되지 않았어요." };

  const { data: row, error: loadErr } = await sb
    .from("owner_verifications")
    .select("id,listing_id,applicant_email,complex_name,status")
    .eq("id", input.id)
    .maybeSingle();
  if (loadErr || !row) return { ok: false, error: "신청을 찾을 수 없어요." };

  const current = row as {
    listing_id?: string | null;
    applicant_email?: string | null;
    complex_name?: string | null;
    status?: string | null;
  };
  if (normStatus(current.status) !== "pending") {
    return { ok: false, error: "이미 처리된 신청이에요." };
  }
  if (input.decision === "reject" && !(input.adminNote ?? "").trim()) {
    return { ok: false, error: "반려 사유를 입력해 주세요." };
  }

  const reviewerId = await profileIdByEmail(input.reviewerEmail);
  const nowIso = new Date().toISOString();
  const { error: updErr } = await sb
    .from("owner_verifications")
    .update({
      status: input.decision === "approve" ? "approved" : "rejected",
      // 심사자 profiles 행이 없을 수 있어 이메일을 메모에 함께 남긴다(추적성).
      admin_note: `${(input.adminNote ?? "").trim()}${
        input.adminNote?.trim() ? " · " : ""
      }심사자 ${input.reviewerEmail}`.slice(0, 500),
      reviewed_by: reviewerId,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", input.id)
    .eq("status", "pending");
  if (updErr) {
    logger.warn("[owner-verification] update failed", updErr.message);
    return { ok: false, error: "심사 저장에 실패했어요." };
  }

  const listingId = current.listing_id ? String(current.listing_id) : null;
  const applicant = String(current.applicant_email ?? "").trim();
  const complexName = String(current.complex_name ?? "").trim() || "매물";

  if (input.decision === "approve" && listingId) {
    const { error: flagErr } = await sb
      .from("listings")
      .update({ owner_verified: true, updated_at: nowIso })
      .eq("id", listingId);
    if (flagErr) {
      logger.warn("[owner-verification] listing flag failed", flagErr.message);
      return { ok: false, error: "매물 인증 표시에 실패했어요." };
    }
    if (applicant) {
      // refId=listingId → 재승인 시 중복 지급 방지(멱등)
      try {
        await awardPoints(applicant, "listing_owner_verified", listingId);
      } catch {
        /* 적립 실패는 심사 결과에 영향 주지 않는다 */
      }
    }
  }

  if (applicant) {
    try {
      await appendInboxNotification({
        userEmail: applicant,
        title: input.decision === "approve" ? "소유확인 완료" : "소유확인 반려",
        body:
          input.decision === "approve"
            ? `'${complexName}' 소유확인이 완료돼 인증 배지가 표시됩니다.`
            : `'${complexName}' 소유확인이 반려됐어요. 사유: ${(input.adminNote ?? "").trim()}`,
        actionUrl: listingId ? `/listings/${listingId}` : "/my/listings",
      });
    } catch {
      /* 알림 실패는 심사 결과에 영향 주지 않는다 */
    }
  }

  return { ok: true };
}

/**
 * 증빙 없이 관리자가 직권으로 배지를 세우는 경로(기존 /admin/listings 의 verify 액션).
 * 없애면 운영이 막히므로 남기되, 근거가 없다는 사실을 심사 이력에 명시해 남긴다.
 */
export async function recordDirectOwnerVerification(input: {
  listingId: string;
  reviewerEmail: string;
  complexName: string;
  region: string;
  address: string;
  applicantEmail: string;
}): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("owner_verifications 접근 불가: 서비스 키가 없습니다");
  const nowIso = new Date().toISOString();
  /* 미처리 신청이 있으면 그 건을 승인 처리로 닫는다(중복 이력 방지).
     이 조회가 실패한 것을 "미처리 신청 없음"으로 읽으면, 이미 있는 신청 옆에
     승인 이력을 하나 더 만든다 — 같은 매물에 심사 이력이 둘이 되고, 원래 신청은
     영영 pending 으로 남는다. 실패는 던져서 부르는 쪽이 다시 시도하게 한다
     (배지 플래그는 이미 반영됐고, 재실행해도 같은 결과가 된다). */
  const { data, error } = await sb
    .from("owner_verifications")
    .select("id")
    .eq("listing_id", input.listingId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`owner_verifications 조회 실패: ${error.message}`);
  const pendingId = (data as { id?: string } | null)?.id ?? null;
  const reviewerId = await profileIdByEmail(input.reviewerEmail);
  const adminNote = `관리자 직권 승인(증빙 심사 없음) · 심사자 ${input.reviewerEmail}`;

  if (pendingId) {
    /* 갱신이 안 됐는데 조용히 끝내면, 신청은 pending 인 채로 남고 관리자 화면은
       처리된 것으로 보인다 — 아무도 그 건을 다시 보지 않는다. */
    const { error: updErr } = await sb
      .from("owner_verifications")
      .update({
        status: "approved",
        admin_note: adminNote,
        reviewed_by: reviewerId,
        reviewed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", pendingId);
    if (updErr) throw new Error(`owner_verifications 갱신 실패: ${updErr.message}`);
    return;
  }

  const { error: insErr } = await sb.from("owner_verifications").insert({
    user_id: await profileIdByEmail(input.applicantEmail),
    listing_id: input.listingId,
    applicant_email: input.applicantEmail.trim().toLowerCase(),
    complex_name: input.complexName.slice(0, 200),
    region: input.region.slice(0, 100),
    property_address: input.address.slice(0, 300),
    note: "",
    document_paths: [],
    status: "approved",
    admin_note: adminNote,
    reviewed_by: reviewerId,
    reviewed_at: nowIso,
  });
  /* 이력이 남지 않으면 "증빙 없이 직권으로 세운 배지"라는 사실이 어디에도
     기록되지 않는다. 배지만 남고 근거가 사라지는 것이 가장 나쁜 결과다. */
  if (insErr) throw new Error(`owner_verifications 기록 실패: ${insErr.message}`);
}
