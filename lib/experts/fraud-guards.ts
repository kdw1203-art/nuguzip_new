import type { ExpertFraudRuleId } from "@/lib/experts/verification-policy";

export type FraudScanHit = {
  ruleId: ExpertFraudRuleId;
  severity: "warn" | "block" | "review_queue";
  message: string;
  matched?: string;
};

const PHONE_RE =
  /(?:0\d{1,2}[-.\s]?)?\d{3,4}[-.\s]?\d{4}|01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g;

const ACCOUNT_RE =
  /\d{3,6}[-\s]?\d{2,6}[-\s]?\d{4,8}|\d{10,14}/g;

const OFF_PLATFORM_PAYMENT_RE =
  /(?:카카오\s*페이|카톡\s*송금|계좌\s*이체|직거래|현금\s*결제|외부\s*결제|개인\s*계좌|무통장|페이팔|paypal|venmo|송금해|입금\s*해)/gi;

const MESSENGER_RE =
  /(?:카톡\s*id|카카오\s*톡|telegram|텔레그램|라인\s*id|whatsapp|@[a-z0-9_]{4,})/gi;

/** 자격번호 정규화 — 중복 탐지용 */
export function normalizeCertNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
}

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

export function isValidKrMobile(phone: string): boolean {
  const d = normalizePhone(phone);
  return /^01[016789]\d{7,8}$/.test(d);
}

/** 대화·상담 본문 스캔 — 연락처·계좌·오프플랫폼 결제 */
export function scanExpertConversationText(text: string): FraudScanHit[] {
  const hits: FraudScanHit[] = [];
  const trimmed = text.trim();
  if (!trimmed) return hits;

  if (OFF_PLATFORM_PAYMENT_RE.test(trimmed)) {
    hits.push({
      ruleId: "off_platform_payment",
      severity: "block",
      message: "플랫폼 외 결제 유도 표현이 감지되었습니다.",
    });
  }
  OFF_PLATFORM_PAYMENT_RE.lastIndex = 0;

  const accountMatch = trimmed.match(ACCOUNT_RE);
  if (accountMatch?.some((m) => m.replace(/\D/g, "").length >= 10)) {
    hits.push({
      ruleId: "account_leak",
      severity: "block",
      message: "계좌·카드번호 형식이 감지되었습니다.",
      matched: accountMatch[0],
    });
  }

  const phoneMatch = trimmed.match(PHONE_RE);
  if (phoneMatch) {
    hits.push({
      ruleId: "contact_leak",
      severity: "warn",
      message: "연락처가 포함되어 있습니다. 플랫폼 내 상담·결제를 이용해 주세요.",
      matched: phoneMatch[0],
    });
  }

  if (MESSENGER_RE.test(trimmed)) {
    hits.push({
      ruleId: "contact_leak",
      severity: "warn",
      message: "외부 메신저 연락 유도가 감지되었습니다.",
    });
  }

  return hits;
}

export function hasBlockingFraudHit(hits: FraudScanHit[]): boolean {
  return hits.some((h) => h.severity === "block");
}

/** 정산 예금주 vs 실명 (간단 문자열 대조) */
export function checkNameAccountMismatch(
  legalName: string | null | undefined,
  accountHolder: string | null | undefined,
): FraudScanHit | null {
  const a = (legalName ?? "").replace(/\s/g, "");
  const b = (accountHolder ?? "").replace(/\s/g, "");
  if (!a || !b) return null;
  if (a === b) return null;
  if (a.includes(b) || b.includes(a)) return null;
  return {
    ruleId: "name_account_mismatch",
    severity: "review_queue",
    message: "정산 예금주 명의가 본인 실명과 일치하지 않습니다.",
  };
}
