import { getServiceSupabase } from "@/lib/supabase/service";
import { getAppUserIdByEmail } from "@/lib/me/profile";
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

export type ExpertVerificationRequest = {
  id: string;
  applicantEmail: string;
  displayName: string;
  specialty: string;
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
    applicantEmail: String(r.applicant_email ?? ""),
    displayName: String(r.display_name ?? ""),
    specialty: String(r.specialty ?? ""),
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

async function loadIdentityVerified(email: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { data } = await sb
    .from("app_users")
    .select("identity_verified")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return Boolean((data as { identity_verified?: boolean } | null)?.identity_verified);
}

async function findDuplicateCert(normalized: string): Promise<boolean> {
  if (!normalized) return false;
  const sb = getServiceSupabase();
  if (!sb) {
    return memory.some(
      (m) =>
        m.certNumberNormalized === normalized &&
        m.status !== "rejected" &&
        m.workflowStage !== "rejected",
    );
  }
  const { count } = await sb
    .from("expert_verification_requests")
    .select("id", { count: "exact", head: true })
    .eq("cert_number_normalized", normalized)
    .neq("status", "rejected");
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
  if (!identityOk) {
    flags.push({
      ruleId: "identity_mismatch",
      severity: "review_queue",
      message: "본인인증(휴대폰)이 완료되지 않았습니다.",
    });
  }

  if (certNorm && (await findDuplicateCert(certNorm))) {
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

export async function submitExpertApplication(
  applicantEmail: string,
  input: SubmitExpertApplicationInput,
  legalName?: string | null,
): Promise<{ request: ExpertVerificationRequest; auto: AutoValidationResult }> {
  const email = applicantEmail.trim().toLowerCase();
  const auto = await runAutoValidation(input, email, legalName);
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
