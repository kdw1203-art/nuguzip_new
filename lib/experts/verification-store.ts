import { getServiceSupabase } from "@/lib/supabase/service";
import { getAppUserIdByEmail } from "@/lib/me/profile";
import {
  createExpert,
  getExpertByOwnerEmail,
  markExpertVerified,
  updateExpert,
} from "@/lib/experts/store-db";
import type { ExpertVerificationStageId } from "@/lib/experts/verification-policy";
import { EXPERT_POST_APPROVAL } from "@/lib/experts/verification-policy";
import {
  checkNameAccountMismatch,
  isValidKrMobile,
  normalizeCertNumber,
  normalizePhone,
  type FraudScanHit,
} from "@/lib/experts/fraud-guards";
import { primarySourceForExpertType } from "@/lib/experts/verification-sources";
import { isIdentityVerificationConfigured } from "@/lib/auth/identity-verification";
import { findExpertType } from "@/lib/experts/taxonomy";

export type ExpertVerificationRequest = {
  id: string;
  /** app_users.id — 승인 때 프로필 user_id 로 옮긴다(예전엔 null 로 만들었다) */
  userId: string | null;
  applicantEmail: string;
  displayName: string;
  specialty: string;
  /** 신청 폼 '전문 분야' — 승인 시 프로필 specialties 로 복사 */
  specialties: string[];
  expertType: string | null;
  regions: string[];
  certifications: string[];
  yearsExperience: number;
  intro: string | null;
  phone: string | null;
  organization: string | null;
  certNumber: string | null;
  certNumberNormalized: string | null;
  documentUrls: string[];
  businessRegNo: string | null;
  payoutAccountHolder: string | null;
  payoutAccountLast4: string | null;
  identityVerified: boolean;
  fraudFlags: FraudScanHit[];
  workflowStage: ExpertVerificationStageId;
  status: "pending" | "approved" | "rejected";
  sourceVerificationUrl: string | null;
  sourceVerifiedAt: string | null;
  interviewCompletedAt: string | null;
  nextRevalidationAt: string | null;
  termsAgreedAt: string | null;
  reviewerEmail: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const memory: ExpertVerificationRequest[] = [];

function mapRow(r: Record<string, unknown>): ExpertVerificationRequest {
  return {
    id: String(r.id),
    userId: r.user_id ? String(r.user_id) : null,
    applicantEmail: String(r.applicant_email ?? ""),
    displayName: String(r.display_name ?? ""),
    specialty: String(r.specialty ?? ""),
    specialties: Array.isArray(r.specialties) ? (r.specialties as string[]).map(String) : [],
    expertType: r.expert_type ? String(r.expert_type) : null,
    regions: Array.isArray(r.regions) ? (r.regions as string[]) : [],
    certifications: Array.isArray(r.certifications)
      ? (r.certifications as string[])
      : [],
    yearsExperience: Number(r.years_experience ?? 0),
    intro: r.intro ? String(r.intro) : null,
    phone: r.phone ? String(r.phone) : null,
    organization: r.organization ? String(r.organization) : null,
    certNumber: r.cert_number ? String(r.cert_number) : null,
    certNumberNormalized: r.cert_number_normalized
      ? String(r.cert_number_normalized)
      : null,
    documentUrls: Array.isArray(r.document_urls) ? (r.document_urls as string[]) : [],
    businessRegNo: r.business_reg_no ? String(r.business_reg_no) : null,
    payoutAccountHolder: r.payout_account_holder
      ? String(r.payout_account_holder)
      : null,
    payoutAccountLast4: r.payout_account_last4
      ? String(r.payout_account_last4)
      : null,
    identityVerified: Boolean(r.identity_verified),
    fraudFlags: Array.isArray(r.fraud_flags)
      ? (r.fraud_flags as FraudScanHit[])
      : [],
    workflowStage: (r.workflow_stage as ExpertVerificationStageId) ?? "intake",
    status: (r.status as ExpertVerificationRequest["status"]) ?? "pending",
    sourceVerificationUrl: r.source_verification_url
      ? String(r.source_verification_url)
      : null,
    sourceVerifiedAt: r.source_verified_at ? String(r.source_verified_at) : null,
    interviewCompletedAt: r.interview_completed_at
      ? String(r.interview_completed_at)
      : null,
    nextRevalidationAt: r.next_revalidation_at
      ? String(r.next_revalidation_at)
      : null,
    termsAgreedAt: r.terms_agreed_at ? String(r.terms_agreed_at) : null,
    reviewerEmail: r.reviewer_email ? String(r.reviewer_email) : null,
    reviewNote: r.review_note ? String(r.review_note) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
  };
}

export type SubmitExpertApplicationInput = {
  expertType: string;
  name: string;
  city: string;
  district: string;
  bio: string;
  certNumber?: string | null;
  yearsExp: number;
  specialties: string[];
  phone?: string | null;
  organization?: string | null;
  documentUrls?: string[];
  businessRegNo?: string | null;
  payoutAccountHolder?: string | null;
  payoutAccountLast4?: string | null;
  termsAgreed: boolean;
};

export type AutoValidationResult = {
  passed: boolean;
  stage: ExpertVerificationStageId;
  flags: FraudScanHit[];
};

/**
 * 자동 검증에 필요한 조회 자체가 실패했을 때 던지는 에러.
 *
 * 이 파일의 두 조회는 실패를 각각 반대 방향으로 흘려보내고 있었다.
 * - loadIdentityVerified: 실패 → false → 이미 본인인증을 마친 신청자에게
 *   "본인인증(휴대폰)이 완료되지 않았습니다" 플래그를 단다(거짓 진술).
 * - findDuplicateCert: 실패 → false → 중복 자격번호 차단이 그냥 열린다.
 * 어느 쪽도 "검증했다"고 말할 수 없으므로, 못 읽었으면 접수를 진행하지 않는다.
 */
export class ExpertVerificationUnavailableError extends Error {
  constructor(where: string, message?: string) {
    super(`${where} 조회 실패: ${message ?? "알 수 없는 오류"}`);
    this.name = "ExpertVerificationUnavailableError";
  }
}

/**
 * [965] 본인인증 플래그는 **본인인증이 실제로 켜져 있을 때만** 단다.
 * IDENTITY_VERIFICATION_PROVIDER 가 비어 있으면 어떤 신청자도 인증을 마칠 방법이
 * 없는데, 예전엔 그 상태에서도 전원에게 "본인인증 미완료" 를 달아 검수 큐의 모든
 * 건이 같은 경고를 달고 있었다 — 늘 켜져 있는 경고는 경고가 아니다.
 * 켜져 있지 않으면 "판정 불가" 로 두고(플래그 없음) 운영자 검토가 그 몫을 진다.
 */
async function loadIdentityVerified(email: string): Promise<boolean | null> {
  if (!isIdentityVerificationConfigured()) return null;
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { data, error } = await sb
    .from("app_users")
    .select("identity_verified")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) {
    throw new ExpertVerificationUnavailableError("app_users (본인인증)", error.message);
  }
  return Boolean((data as { identity_verified?: boolean } | null)?.identity_verified);
}

/**
 * 같은 자격번호로 **다른 사람이** 접수·승인한 건이 있는가.
 * [965] 신청자 본인의 이전 건은 제외한다 — 예전엔 본인 건도 세서, 반려 뒤 다시
 * 신청하거나 같은 번호로 재접수하면 "동일 자격번호 중복" 으로 스스로에게 막혔다.
 */
async function findDuplicateCert(normalized: string, applicantEmail: string): Promise<boolean> {
  if (!normalized) return false;
  const sb = getServiceSupabase();
  if (!sb) {
    return memory.some(
      (m) =>
        m.certNumberNormalized === normalized &&
        m.applicantEmail !== applicantEmail &&
        m.status !== "rejected" &&
        m.workflowStage !== "rejected",
    );
  }
  const { count, error } = await sb
    .from("expert_verification_requests")
    .select("id", { count: "exact", head: true })
    .eq("cert_number_normalized", normalized)
    .neq("applicant_email", applicantEmail)
    .neq("status", "rejected");
  if (error) {
    throw new ExpertVerificationUnavailableError(
      "expert_verification_requests (중복 자격번호)",
      error.message,
    );
  }
  return (count ?? 0) > 0;
}

export async function runAutoValidation(
  input: SubmitExpertApplicationInput,
  applicantEmail: string,
  legalName?: string | null,
): Promise<AutoValidationResult> {
  const flags: FraudScanHit[] = [];
  const certNorm = normalizeCertNumber(input.certNumber);

  if (input.phone && !isValidKrMobile(input.phone)) {
    flags.push({
      ruleId: "contact_leak",
      severity: "review_queue",
      message: "휴대폰 번호 형식이 올바르지 않습니다.",
    });
  }

  const identityOk = await loadIdentityVerified(applicantEmail);
  if (identityOk === false) {
    flags.push({
      ruleId: "identity_mismatch",
      severity: "review_queue",
      message: "본인인증(휴대폰)이 완료되지 않았습니다.",
    });
  }

  if (certNorm && (await findDuplicateCert(certNorm, applicantEmail))) {
    flags.push({
      ruleId: "duplicate_cert",
      severity: "block",
      message: "동일 자격번호로 접수·승인된 건이 있습니다.",
    });
  }

  const nameMismatch = checkNameAccountMismatch(
    legalName ?? input.name,
    input.payoutAccountHolder,
  );
  if (nameMismatch) flags.push(nameMismatch);

  const blocking = flags.some((f) => f.severity === "block");
  return {
    passed: !blocking,
    stage: blocking ? "intake" : "auto_check",
    flags,
  };
}

/** 자동 검증에서 차단된 신청 — 접수(insert)하지 않고 던진다 */
export class ExpertApplicationBlockedError extends Error {
  readonly auto: AutoValidationResult;
  constructor(auto: AutoValidationResult) {
    super(
      auto.flags.find((f) => f.severity === "block")?.message ?? "자동 검증에서 차단되었습니다.",
    );
    this.name = "ExpertApplicationBlockedError";
    this.auto = auto;
  }
}

/** 이미 심사 중인 신청이 있을 때 — 중복 접수를 막는다 */
export class ExpertApplicationPendingError extends Error {
  readonly request: ExpertVerificationRequest;
  constructor(request: ExpertVerificationRequest) {
    super("이미 심사 중인 전문가 인증 신청이 있어요.");
    this.name = "ExpertApplicationPendingError";
    this.request = request;
  }
}

/** 신청자의 가장 최근 신청(상태 무관) — 마이 화면의 진행 상태 표시용 */
export async function getLatestExpertApplication(
  applicantEmail: string,
): Promise<ExpertVerificationRequest | null> {
  const email = applicantEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) return memory.find((m) => m.applicantEmail === email) ?? null;
  const { data, error } = await sb
    .from("expert_verification_requests")
    .select("*")
    .eq("applicant_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

async function findOpenApplication(email: string): Promise<ExpertVerificationRequest | null> {
  const sb = getServiceSupabase();
  if (!sb) return memory.find((m) => m.applicantEmail === email && m.status === "pending") ?? null;
  const { data, error } = await sb
    .from("expert_verification_requests")
    .select("*")
    .eq("applicant_email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new ExpertVerificationUnavailableError("expert_verification_requests (진행 중 신청)", error.message);
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function submitExpertApplication(
  applicantEmail: string,
  input: SubmitExpertApplicationInput,
  legalName?: string | null,
): Promise<{ request: ExpertVerificationRequest; auto: AutoValidationResult }> {
  const email = applicantEmail.trim().toLowerCase();
  /* [965] 진행 중(pending) 신청이 있으면 새로 받지 않는다 — 같은 사람의 신청이
     큐에 여러 건 쌓여 운영자가 어느 것을 심사해야 할지 모르게 되던 문제. */
  const open = await findOpenApplication(email);
  if (open) throw new ExpertApplicationPendingError(open);
  const auto = await runAutoValidation(input, email, legalName);
  /* [965] 차단 플래그가 있으면 **저장하지 않는다**. 예전엔 먼저 insert 하고 라우트가
     409 를 돌려줬다 — 차단된 신청이 pending 으로 큐에 남아 검수 대상이 되고,
     자격번호 중복 판정에도 다시 걸렸다. */
  if (!auto.passed) throw new ExpertApplicationBlockedError(auto);
  const certNorm = normalizeCertNumber(input.certNumber);
  const source = primarySourceForExpertType(input.expertType);
  const now = new Date().toISOString();
  const userId = await getAppUserIdByEmail(email);

  const payload = {
    user_id: userId,
    applicant_email: email,
    display_name: input.name.trim(),
    specialty: input.expertType,
    expert_type: input.expertType,
    /* 전문 분야 — 예전엔 API 까지 오고도 insert 에 컬럼이 없어 통째로 유실됐다.
       승인 시 프로필 specialties 로 옮기기 위해 신청서에 보존한다. */
    specialties: (input.specialties ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 8),
    regions: [`${input.city} ${input.district}`.trim()],
    certifications: input.certNumber ? [input.certNumber.trim()] : [],
    years_experience: input.yearsExp,
    intro: input.bio.trim(),
    phone: input.phone ? normalizePhone(input.phone) : null,
    organization: input.organization?.trim() || null,
    cert_number: input.certNumber?.trim() || null,
    cert_number_normalized: certNorm || null,
    document_urls: input.documentUrls ?? [],
    business_reg_no: input.businessRegNo?.trim() || null,
    payout_account_holder: input.payoutAccountHolder?.trim() || null,
    payout_account_last4: input.payoutAccountLast4?.trim() || null,
    identity_verified: auto.flags.every((f) => f.ruleId !== "identity_mismatch"),
    fraud_flags: auto.flags,
    workflow_stage: auto.stage,
    status: "pending",
    source_verification_url: source?.verificationUrl ?? null,
    terms_agreed_at: input.termsAgreed ? now : null,
  };

  const sb = getServiceSupabase();
  if (!sb) {
    const rec = mapRow({ id: `mem-${Date.now()}`, ...payload, created_at: now });
    memory.unshift(rec);
    return { request: rec, auto };
  }

  const { data, error } = await sb
    .from("expert_verification_requests")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { request: mapRow(data), auto };
}

export async function logExpertFraudEvent(input: {
  userEmail: string;
  expertId?: string | null;
  eventType: string;
  severity: "warn" | "block" | "review_queue";
  context?: Record<string, unknown>;
}): Promise<void> {
  const sb = getServiceSupabase();
  const row = {
    expert_id: input.expertId ?? null,
    user_email: input.userEmail.trim().toLowerCase(),
    event_type: input.eventType,
    severity: input.severity,
    context: input.context ?? {},
  };
  if (!sb) return;
  await sb.from("expert_fraud_events").insert(row);
}

export function computeNextRevalidation(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + EXPERT_POST_APPROVAL.revalidationIntervalDays);
  return d.toISOString();
}

/* ============================================================
   J1 — 전문가 인증 승인 브리지
   expert_verification_requests(접수) 승인 시 expert_profiles(공개 프로필)를
   find-or-create 하고 is_verified=true 로 표시한다. 두 테이블이 단절돼
   승인해도 검증 전문가가 되지 않던 문제(markExpertVerified 데드코드)를 해소.
   반려는 요청 상태만 갱신한다. 신청자 알림·감사로그는 API 라우트가 담당.
   ============================================================ */

export type ApproveExpertResult =
  | { ok: true; expertId: string; applicantEmail: string; displayName: string }
  | { ok: false; error: string };

export async function approveExpertVerification(
  requestId: string,
  reviewerEmail: string,
  note?: string | null,
): Promise<ApproveExpertResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소가 준비되지 않았어요." };
  const now = new Date().toISOString();

  const { data: reqRow, error: reqErr } = await sb
    .from("expert_verification_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr || !reqRow) return { ok: false, error: "인증 신청을 찾을 수 없어요." };
  const req = mapRow(reqRow);
  if (req.status === "approved") {
    return { ok: false, error: "이미 승인된 신청이에요." };
  }
  const applicantEmail = req.applicantEmail.trim().toLowerCase();
  if (!applicantEmail) {
    return { ok: false, error: "신청자 이메일이 없어 승인할 수 없어요." };
  }

  const nextReval = computeNextRevalidation(new Date());
  const reviewer = reviewerEmail.trim().toLowerCase();
  const cleanNote = note?.trim() || null;

  // 1) 접수 상태 갱신 (승인)
  const { error: updErr } = await sb
    .from("expert_verification_requests")
    .update({
      status: "approved",
      workflow_stage: "approved",
      reviewer_email: reviewer,
      reviewed_at: now,
      review_note: cleanNote,
      source_verified_at: now,
      next_revalidation_at: nextReval,
    })
    .eq("id", requestId);
  if (updErr) return { ok: false, error: updErr.message };

  // 2) 공개 프로필 find-or-create (owner_email 기준)
  const userId = req.userId ?? (await getAppUserIdByEmail(applicantEmail));
  let profile = await getExpertByOwnerEmail(applicantEmail);
  if (!profile) {
    try {
      profile = await createExpert({
        name: req.displayName || applicantEmail,
        title: req.specialty || "전문가",
        category: req.expertType || req.specialty || "expert",
        regions: req.regions,
        /* 신청서에 보존된 전문 분야를 그대로 — 예전엔 [] 하드코딩으로 유실 */
        specialties: req.specialties,
        introduction: req.intro ?? "",
        experience: req.yearsExperience ? `${req.yearsExperience}년` : "",
        organization: req.organization,
        userId,
        ownerEmail: applicantEmail,
      });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "프로필 생성에 실패했어요.",
      };
    }
  } else {
    /* [965] 프로필이 이미 있으면(재인증·과거 프로필) 신청서 값으로 **빈 칸만** 채운다.
       본인이 이미 적어 둔 소개·전문 분야는 덮어쓰지 않는다. */
    const fill: Parameters<typeof updateExpert>[1] = {};
    if (!profile.introduction?.trim() && req.intro) fill.introduction = req.intro;
    if (!profile.specialties?.length && req.specialties.length) fill.specialties = req.specialties;
    if (!profile.regions?.length && req.regions.length) fill.regions = req.regions;
    if (!profile.organization && req.organization) fill.organization = req.organization;
    if (!profile.experience && req.yearsExperience) fill.experience = `${req.yearsExperience}년`;
    if (!profile.category && (req.expertType || req.specialty)) {
      fill.category = req.expertType || req.specialty;
    }
    if (Object.keys(fill).length > 0) {
      try {
        const synced = await updateExpert(profile.id, fill);
        if (synced) profile = synced;
      } catch {
        /* 동기화 실패는 승인을 막지 않는다 — 본인이 프로필 화면에서 채울 수 있다 */
      }
    }
  }

  // 3) 인증 표시
  /* [965] 자격번호 컬럼은 공인중개사 등록번호 자리다(broker_registration_no).
     세무사·감정평가사 번호를 그 칸에 넣으면 상세 화면이 "중개사 등록번호" 로
     그린다 — 유형이 공인중개사일 때만 옮기고, 나머지는 검수 메모에 남긴다. */
  const isBroker = findExpertType(req.expertType ?? req.specialty)?.id === "broker";
  const noteWithCert =
    !isBroker && req.certNumber
      ? [cleanNote, `자격번호(${req.expertType ?? req.specialty}): ${req.certNumber}`]
          .filter(Boolean)
          .join(" · ")
      : cleanNote;
  const verified = await markExpertVerified(profile.id, {
    brokerRegistrationNo: isBroker ? (req.certNumber ?? null) : undefined,
    verificationNote: noteWithCert,
    nextRevalidationAt: nextReval,
  });
  if (!verified) {
    /* 접수는 approved 로 바뀌었는데 프로필은 미인증 — 여기서 멈추면 운영자가
       "승인했는데 배지가 없다" 를 바로 안다. 예전엔 null 을 무시하고 성공으로 답했다. */
    return {
      ok: false,
      error: "신청은 승인됐지만 프로필 인증 표시에 실패했어요. 다시 승인을 눌러 주세요.",
    };
  }

  return {
    ok: true,
    expertId: verified.id,
    applicantEmail,
    displayName: req.displayName || applicantEmail,
  };
}

export type RejectExpertResult =
  | { ok: true; applicantEmail: string; displayName: string }
  | { ok: false; error: string };

export async function rejectExpertVerification(
  requestId: string,
  reviewerEmail: string,
  note: string,
): Promise<RejectExpertResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소가 준비되지 않았어요." };
  const cleanNote = note.trim();
  if (!cleanNote) return { ok: false, error: "반려 사유를 입력해 주세요." };
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from("expert_verification_requests")
    .update({
      status: "rejected",
      workflow_stage: "rejected",
      reviewer_email: reviewerEmail.trim().toLowerCase(),
      reviewed_at: now,
      review_note: cleanNote,
    })
    .eq("id", requestId)
    .select("applicant_email, display_name, status")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "반려 처리에 실패했어요." };

  return {
    ok: true,
    applicantEmail: String((data as Record<string, unknown>).applicant_email ?? ""),
    displayName: String((data as Record<string, unknown>).display_name ?? ""),
  };
}
