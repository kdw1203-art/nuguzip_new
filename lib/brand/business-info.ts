/** 전자상거래법상 공개 사업자·통신판매업 고지 — 푸터·약관·요금제 공통 */

export type BusinessInfo = {
  serviceName: string;
  domain: string;
  legalName: string;
  representative: string;
  registrationNumber: string;
  address: string;
  mailOrderSalesNumber: string;
  supportEmail: string;
  privacyEmail: string;
};

const ENV = {
  legalName: ["NEXT_PUBLIC_COMPANY_LEGAL_NAME", "COMPANY_LEGAL_NAME"],
  representative: ["NEXT_PUBLIC_COMPANY_REPRESENTATIVE", "COMPANY_REPRESENTATIVE"],
  registrationNumber: [
    "NEXT_PUBLIC_COMPANY_REGISTRATION_NUMBER",
    "COMPANY_REGISTRATION_NUMBER",
  ],
  address: ["NEXT_PUBLIC_COMPANY_ADDRESS", "COMPANY_ADDRESS"],
  mailOrderSalesNumber: [
    "NEXT_PUBLIC_MAIL_ORDER_SALES_NUMBER",
    "MAIL_ORDER_SALES_NUMBER",
  ],
} as const;

function readEnv(keys: readonly string[], fallback: string): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return fallback;
}

/** Vercel env 미설정 시 기본값 — 운영 전 필수 항목을 env로 덮어쓰세요. */
const DEFAULTS = {
  legalName: "우리동네이야기",
  representative: "",
  registrationNumber: "",
  address: "",
  mailOrderSalesNumber: "",
} as const;

export function getBusinessInfo(): BusinessInfo {
  return {
    serviceName: "우리동네이야기",
    domain: "nuguzip.com",
    legalName: readEnv(ENV.legalName, DEFAULTS.legalName),
    representative: readEnv(ENV.representative, DEFAULTS.representative),
    registrationNumber: readEnv(ENV.registrationNumber, DEFAULTS.registrationNumber),
    address: readEnv(ENV.address, DEFAULTS.address),
    mailOrderSalesNumber: readEnv(ENV.mailOrderSalesNumber, DEFAULTS.mailOrderSalesNumber),
    supportEmail: "support@nuguzip.com",
    privacyEmail: "privacy@nuguzip.com",
  };
}

export function isBusinessDisclosureComplete(info: BusinessInfo): boolean {
  return Boolean(
    info.representative &&
      info.registrationNumber &&
      info.address &&
      info.mailOrderSalesNumber,
  );
}

function display(value: string): string {
  return value.trim() || "—";
}

/** 푸터 1행: 상호·대표·사업자번호 */
export function formatBusinessFooterPrimary(info: BusinessInfo): string {
  return `상호: ${display(info.legalName)} · 대표: ${display(info.representative)} · 사업자등록번호: ${display(info.registrationNumber)}`;
}

/** 푸터 2행: 주소·통신판매업 */
export function formatBusinessFooterSecondary(info: BusinessInfo): string {
  return `주소: ${display(info.address)} · 통신판매업 신고번호: ${display(info.mailOrderSalesNumber)}`;
}

export function formatBusinessFooterService(info: BusinessInfo): string {
  return `서비스명: ${info.serviceName}(${info.domain})`;
}
