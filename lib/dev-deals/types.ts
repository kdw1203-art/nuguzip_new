/**
 * 개발물건 중개(B2B 디벨로퍼 매칭) 도메인 타입 — camelCase.
 *
 * DB(snake_case) → 앱(camelCase) 매핑은 store.ts 에서 수행한다.
 * 이 파일은 서버/클라이언트 어디서나 import 가능한 순수 타입·포맷터만 둔다.
 */

/** 개발물건 유형 */
export const DEAL_TYPES = [
  "재건축",
  "재개발",
  "가로주택정비",
  "지역주택조합",
  "신축분양",
  "PF",
  "부지매각",
  "기타",
] as const;
export type DealType = (typeof DEAL_TYPES)[number];

/** 협력업체 유형 */
export const PARTNER_TYPES = [
  "시공사",
  "설계사",
  "신탁사",
  "PF·금융",
  "마케팅",
  "감리",
  "기타",
] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

/** 필요 협력 분야 / 전문 분야 요소 */
export const PARTNER_FIELDS = [
  "시공",
  "설계",
  "신탁",
  "PF",
  "마케팅",
  "감리",
  "기타",
] as const;
export type PartnerField = (typeof PARTNER_FIELDS)[number];

/** 개발물건 진행 상태 */
export type DealStatus = "open" | "matched" | "closed";

export function isDealType(v: string): v is DealType {
  return (DEAL_TYPES as readonly string[]).includes(v);
}
export function isPartnerType(v: string): v is PartnerType {
  return (PARTNER_TYPES as readonly string[]).includes(v);
}
export function isPartnerField(v: string): v is PartnerField {
  return (PARTNER_FIELDS as readonly string[]).includes(v);
}

/** 개발물건 (dev_deals) — 공개 조회 시 원본 연락처 email/phone 은 비노출. */
export interface DevDeal {
  id: string;
  ownerEmail: string | null;
  title: string;
  dealType: string;
  region: string | null;
  address: string | null;
  landAreaM2: number | null;
  grossFloorAreaM2: number | null;
  units: number | null;
  totalCostKrw: number | null;
  neededPartners: string[];
  budgetText: string | null;
  summary: string | null;
  description: string | null;
  contactName: string | null;
  /** 마스킹된 연락처 — 공개 노출 허용 */
  contactMasked: string | null;
  status: string;
  isVerified: boolean;
  isSample: boolean;
  viewCount: number;
  inquiryCount: number;
  createdAt: string;
  updatedAt: string | null;
}

/** 협력업체 (dev_partners) */
export interface DevPartner {
  id: string;
  ownerEmail: string | null;
  companyName: string;
  partnerType: string;
  specialties: string[];
  region: string | null;
  intro: string | null;
  portfolioUrl: string | null;
  contactMasked: string | null;
  isVerified: boolean;
  isSample: boolean;
  createdAt: string;
}

/** 참여 문의 (dev_inquiries) */
export interface DevInquiry {
  id: string;
  dealId: string;
  fromEmail: string | null;
  fromCompany: string | null;
  partnerType: string | null;
  message: string | null;
  proposedTerms: string | null;
  status: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* 금액 포맷터 — 원 단위 → 억/조                                         */
/* ------------------------------------------------------------------ */

/**
 * 원(KRW) → 억/조 표기. 예) 42000000000 → "420억", 1500000000000 → "1조 5,000억".
 * null·0·음수·비유한값이면 "미정".
 */
export function formatKrwEok(krw: number | null | undefined): string {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return "미정";
  const JO = 1e12;
  const EOK = 1e8;
  if (krw >= JO) {
    const jo = Math.floor(krw / JO);
    const remEok = Math.round((krw - jo * JO) / EOK);
    return remEok > 0
      ? `${jo.toLocaleString()}조 ${remEok.toLocaleString()}억`
      : `${jo.toLocaleString()}조`;
  }
  if (krw >= EOK) {
    const eok = krw / EOK;
    const rounded = eok % 1 === 0 ? eok : Math.round(eok * 10) / 10;
    return `${rounded.toLocaleString()}억`;
  }
  const man = Math.round(krw / 1e4);
  return `${man.toLocaleString()}만`;
}

/** 면적(㎡) 표기 — null 이면 "—" */
export function formatAreaM2(m2: number | null | undefined): string {
  if (m2 == null || !Number.isFinite(m2) || m2 <= 0) return "—";
  const v = m2 % 1 === 0 ? m2 : Math.round(m2 * 100) / 100;
  return `${v.toLocaleString()}㎡`;
}

/**
 * 연락처(전화/문자열) 마스킹 — 공개 노출용.
 * 전화번호는 가운데를 가리고(010-****-5678), 그 외 문자열은 앞 2자만 남긴다.
 */
export function maskContact(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length >= 9 && digits.length <= 11) {
    const head = digits.slice(0, 3);
    const tail = digits.slice(-4);
    return `${head}-****-${tail}`;
  }
  if (s.length <= 2) return `${s}**`;
  return `${s.slice(0, 2)}***`;
}
