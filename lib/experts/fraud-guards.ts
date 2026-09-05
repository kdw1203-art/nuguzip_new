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

/**
 * 자격번호 정규화 — 중복 탐지용.
 *
 * [965] 예전엔 공백·하이픈만 지웠다. 같은 번호를 "제 11-2020-00123 호" 와
 * "11202000123" 으로 적으면 다른 번호로 봤다 — 중복 차단이 표기 습관 하나로
 * 비껴갔다. 접두 '제'·접미 '호', 구분 기호(-·./() 등), 전각 문자를 걷어내고
 * 대문자로 맞춘다. 한글·영문·숫자는 남긴다(지역명이 들어간 번호가 있다).
 */
export function normalizeCertNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/^제/, "")
    .replace(/호$/, "")
    .replace(/[^0-9A-Za-z가-힣]/g, "")
    .toUpperCase();
}

/** 신청서 첨부 서류 URL 상한 — 화면(ExpertApplyCta)과 같은 값 */
export const MAX_DOCUMENT_URLS = 5;

/**
 * [965] 첨부 서류 URL 서버 검증. 예전엔 `body.documentUrls.map(String)` 그대로
 * 저장돼 `javascript:`·내부 주소·수천 개 항목이 관리자 검수 화면에 링크로 그려질 수
 * 있었다. https 만, 5개까지, 각 2,048자 이내, 중복 제거. 통과 못 한 항목은 이유와
 * 함께 돌려줘 화면이 고칠 수 있게 한다.
 */
export function validateDocumentUrls(
  raw: unknown,
): { ok: true; urls: string[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, urls: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "첨부 서류 링크 형식이 올바르지 않습니다." };
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of raw) {
    const s = String(item ?? "").trim();
    if (!s) continue;
    if (s.length > 2048) return { ok: false, error: "첨부 서류 링크가 너무 깁니다(2,048자 이내)." };
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      return { ok: false, error: `첨부 서류 링크가 올바른 주소가 아닙니다: ${s.slice(0, 60)}` };
    }
    if (u.protocol !== "https:") {
      return { ok: false, error: "첨부 서류 링크는 https 주소만 받습니다." };
    }
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(host) ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return { ok: false, error: "첨부 서류 링크는 공개 주소여야 합니다." };
    }
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    urls.push(u.href);
    if (urls.length > MAX_DOCUMENT_URLS) {
      return { ok: false, error: `첨부 서류 링크는 최대 ${MAX_DOCUMENT_URLS}개까지 받습니다.` };
    }
  }
  return { ok: true, urls };
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

  /* [965] 휴대폰 번호(010-1234-5678, 11자리)는 계좌번호 패턴에도 걸린다 — 예전엔
     연락처를 적은 상담 요청이 전부 "계좌번호" 로 **차단**됐다(연락처는 경고가 맞다).
     휴대폰 형식으로 읽히는 숫자열은 계좌 판정에서 뺀다. */
  const accountMatch = (trimmed.match(ACCOUNT_RE) ?? []).filter((m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 10 && !/^01[016789]\d{7,8}$/.test(digits);
  });
  if (accountMatch.length > 0) {
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
