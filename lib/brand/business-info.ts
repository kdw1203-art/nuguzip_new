/** 전자상거래법상 공개 사업자·통신판매업 고지 — 푸터·약관·요금제 공통 */

export type BusinessInfo = {
  serviceName: string;
  domain: string;
  legalName: string;
  representative: string;
  registrationNumber: string;
  address: string;
  mailOrderSalesNumber: string;
  /**
   * 고객 문의 유선번호.
   *
   * 토스페이먼츠 상점 심사가 홈페이지 하단에 "사업자등록증 상의 상호명·사업자
   * 등록번호·대표자명·사업장 주소·**유선번호**"를 모두 요구한다. 우리 푸터에는
   * 이 항목 자체가 없었다 — 이메일만 적혀 있어서 심사에서 바로 걸린다.
   *
   * 허용 번호체계: 지역번호 · 070 · 0505 · 전국대표번호 · 080 · 휴대폰.
   * 단, 080 은 가운데 첫 자리가 0이면 등록 불가(예: 080-012-3456).
   * 지어낼 수 없는 값이라 기본값을 두지 않는다 — env 로만 채운다.
   */
  phone: string;
  supportEmail: string;
  privacyEmail: string;
  /** 사업용 수취 계좌 — 은행명. 무통장 입금·환불 안내에 쓴다. */
  depositBank: string;
  /** 사업용 수취 계좌 — 계좌번호 */
  depositAccountNumber: string;
  /** 사업용 수취 계좌 — 예금주 */
  depositAccountHolder: string;
};

const ENV = {
  legalName: ["NEXT_PUBLIC_COMPANY_LEGAL_NAME", "COMPANY_LEGAL_NAME"],
  representative: ["NEXT_PUBLIC_COMPANY_REPRESENTATIVE", "COMPANY_REPRESENTATIVE"],
  registrationNumber: [
    "NEXT_PUBLIC_COMPANY_REGISTRATION_NUMBER",
    "COMPANY_REGISTRATION_NUMBER",
  ],
  /* address 도 의도적으로 여기 없다 — 아래 ADDRESS 상수가 단일 출처다. 이유는 그 주석 참고. */
  /* mailOrderSalesNumber 도 의도적으로 여기 없다 — 아래 MAIL_ORDER_SALES_NUMBER
     상수가 단일 출처다. PHONE·ADDRESS 와 같은 이유: 환경별로 달라질 이유가 없는
     사업자 사실인데 env 를 우선하면 낡은 자리표시 값("신고 진행 중")이 실번호를
     조용히 덮어쓴다 — 실제로 Vercel 에 그 자리표시가 남아 있었다(2026-08-13). */
  /* phone 은 의도적으로 여기 없다 — 아래 PHONE 상수가 단일 출처다. 이유는 그 주석 참고. */
  supportEmail: ["NEXT_PUBLIC_SUPPORT_EMAIL", "SUPPORT_EMAIL"],
  privacyEmail: ["NEXT_PUBLIC_PRIVACY_EMAIL", "PRIVACY_EMAIL"],
  depositBank: ["NEXT_PUBLIC_DEPOSIT_BANK", "DEPOSIT_BANK"],
  depositAccountNumber: ["NEXT_PUBLIC_DEPOSIT_ACCOUNT_NUMBER", "DEPOSIT_ACCOUNT_NUMBER"],
  depositAccountHolder: ["NEXT_PUBLIC_DEPOSIT_ACCOUNT_HOLDER", "DEPOSIT_ACCOUNT_HOLDER"],
} as const;

/**
 * 1:1 문의가 쌓이는 관리자 인박스 키 (ADMIN_EMAIL 미설정 시 기본값).
 *
 * 쓰는 쪽(app/api/support/route.ts)과 읽는 쪽(lib/newui/admin-metrics.ts)이
 * 각자 "admin@nuguzip.com" 을 기본값으로 적고 있었다. 그 계정은 존재하지 않아
 * 문의가 아무도 안 보는 곳에 쌓였고, 한쪽만 고치면 두 값이 어긋나 이미 들어온
 * 문의를 못 읽게 된다. 두 곳이 같은 상수를 본다.
 */
export const DEFAULT_ADMIN_EMAIL = "nuguzip@naver.com";

function readEnv(keys: readonly string[], fallback: string): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return fallback;
}

/**
 * 고객 문의 유선번호 — **env 오버라이드 없이 코드가 단일 출처다.**
 *
 * T안심콜 안심번호(2026-08-03 발급). 개인 휴대폰 번호를 푸터·약관에 그대로 노출하면
 * 스팸·사칭의 표적이 되므로 안심번호로 대체한다. 전자상거래 고지·토스 심사가 요구하는
 * "유선번호" 요건은 050 안심번호로도 충족된다.
 *
 * env(NEXT_PUBLIC_COMPANY_PHONE)를 일부러 읽지 않는 이유: 이 값은 환경별로 달라질 이유가
 * 없는데(운영·프리뷰·로컬 모두 같은 사업자 번호다) env 를 우선하게 두면, 배포 환경에 남아
 * 있던 옛 값이 코드를 조용히 덮어쓴다. 실제로 그 일이 있었다 — 코드는 안심번호로 바꿨는데
 * Vercel 에 남아 있던 NEXT_PUBLIC_COMPANY_PHONE(개인 휴대폰)이 이겨서 개인번호가 계속
 * 공개되고 있었고, 배포 로그만 봐서는 원인이 보이지 않았다. 개인정보가 걸린 값은
 * "어디선가 덮어쓸 수 있는" 구조로 두지 않는다. 번호를 바꿀 일이 생기면 이 상수를 고친다.
 */
const PHONE = "050-6460-1203";

/**
 * 통신판매업 신고번호 — **env 오버라이드 없이 코드가 단일 출처다.** (PHONE 과 같은 이유)
 * 정부24 발급(2026-08-13, 소유자 제공 스크린샷): 2026-안양동안-1095.
 * 신고증(증서)은 등록면허세 납부 후 정부24에서 수령 — 홈페이지 표기는 이 번호면 된다.
 */
const MAIL_ORDER_SALES_NUMBER = "2026-안양동안-1095";

/**
 * 사업장 주소 — **env 오버라이드 없이 코드가 단일 출처다.** (PHONE 과 같은 이유)
 *
 * 토스페이먼츠 상점 심사는 홈페이지 하단 주소가 사업자등록증과 층수·동호수까지
 * 완전히 동일할 것을 요구한다. 소유자 확인(2026-08-12): 302동 1010호.
 *
 * 원래 env(NEXT_PUBLIC_COMPANY_ADDRESS)가 우선이었는데, PHONE 때와 똑같은 사고가
 * 재현됐다 — 코드 기본값에 동·호수를 추가해 배포했는데(f393568) Vercel 에 남아 있던
 * 옛 env 값("...관양동 1588", 동·호 없음)이 이겨서 프로덕션 푸터가 계속 옛 주소를
 * 보여줬고, 배포 로그만 봐서는 원인이 안 보였다(2026-08-12 실측). 주소는 환경별로
 * 달라질 이유가 없는 값이므로 env 를 읽지 않는다. 이전할 일이 생기면 이 상수를 고친다.
 */
/* v3 (2026-08-13): 통신판매업신고증(정부24 진본, 소유자 제공 PDF)의 소재지가
   도로명 표기임을 확인 — 정부 등록 문서와 글자까지 동일하게 맞춘다(토스 요건).
   구 표기(지번 "관양동 1588 302동 1010호")는 같은 건물(공작부영아파트)의 지번 주소. */
const ADDRESS = "경기도 안양시 동안구 관평로212번길 21, 302동 1010호 (관양동, 공작부영아파트)";

/** Vercel env 미설정 시 기본값 — 구 사이트(nuguzip.com)가 공개 게시한 실값. env가 있으면 env 우선. */
const DEFAULTS = {
  legalName: "우리동네이야기",
  representative: "고대웅",
  registrationNumber: "378-06-02465",
  address: ADDRESS,
  mailOrderSalesNumber: MAIL_ORDER_SALES_NUMBER,
  phone: PHONE,
  supportEmail: "nuguzip@naver.com",
  privacyEmail: "nuguzip@naver.com",
  /* 토스뱅크 계좌개설 확인증(2026-06-15 개설, 소유자 제공)에서 옮긴 실값.
     상품명: 토스뱅크 개인사업자 통장 · 예금주: 고대웅(우리동네이야기). */
  depositBank: "토스뱅크",
  depositAccountNumber: "1002-6298-2050",
  depositAccountHolder: "고대웅(우리동네이야기)",
} as const;

/**
 * 제품 UI 브랜드(누구집) vs 사업자 상호(우리동네이야기).
 * SEO·화면은 SITE_NAME/누구집, 약관 본문·고시는 legalName/serviceName.
 */
export const PRODUCT_BRAND = "누구집";

export function getBusinessInfo(): BusinessInfo {
  return {
    /** 전자상거래·약관상 서비스 운영 상호 */
    serviceName: "우리동네이야기",
    domain: "nuguzip.com",
    legalName: readEnv(ENV.legalName, DEFAULTS.legalName),
    representative: readEnv(ENV.representative, DEFAULTS.representative),
    registrationNumber: readEnv(ENV.registrationNumber, DEFAULTS.registrationNumber),
    // env 를 읽지 않는다(위 ADDRESS 주석 참고) — 배포 환경의 옛 값이 덮어쓰지 못하게.
    address: ADDRESS,
    // env 를 읽지 않는다(위 MAIL_ORDER_SALES_NUMBER 주석 참고) — 자리표시 env 가 실번호를 덮지 못하게.
    mailOrderSalesNumber: MAIL_ORDER_SALES_NUMBER,
    // env 를 읽지 않는다(위 PHONE 주석 참고) — 배포 환경의 옛 값이 덮어쓰지 못하게.
    phone: PHONE,
    supportEmail: readEnv(ENV.supportEmail, DEFAULTS.supportEmail),
    privacyEmail: readEnv(ENV.privacyEmail, DEFAULTS.privacyEmail),
    depositBank: readEnv(ENV.depositBank, DEFAULTS.depositBank),
    depositAccountNumber: readEnv(ENV.depositAccountNumber, DEFAULTS.depositAccountNumber),
    depositAccountHolder: readEnv(ENV.depositAccountHolder, DEFAULTS.depositAccountHolder),
  };
}

export function isBusinessDisclosureComplete(info: BusinessInfo): boolean {
  /* 유선번호를 여기 넣은 이유: 이 함수가 곧 유료 결제 개방 스위치다
     (app/api/billing/checkout·boost 가 이 값으로 결제를 막는다). 토스 심사가
     유선번호를 필수로 요구하므로, 번호 없이 결제가 열리면 심사에서 반려된다.
     즉 "고지가 끝났는가"의 기준에 유선번호가 빠져 있으면 안 된다. */
  return Boolean(
    info.representative &&
      info.registrationNumber &&
      info.address &&
      info.mailOrderSalesNumber &&
      info.phone,
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
  return `주소: ${display(info.address)} · 통신판매업 신고번호: ${display(info.mailOrderSalesNumber)} · 대표전화: ${display(info.phone)}`;
}

export function formatBusinessFooterService(info: BusinessInfo): string {
  return `서비스명: ${info.serviceName}(${info.domain})`;
}
