import "server-only";

/**
 * 토스페이먼츠 계좌 인증 API (v2) — 예금주 실명·성명 일치 확인.
 *
 * 문서 근거 (소유자 전달본 2026-08-13, /v2/bank-accounts/*):
 *   POST /v2/bank-accounts/verify-holder-real-name
 *     body: { bankCode, accountNumber, holderName, identityNumber(생년월일 6자리) }
 *     응답: { version, traceId, entityBody: { isValid }, entityType, error }
 *   (v2 응답은 entityBody 봉투 구조 — v1 의 평평한 구조와 다르다.)
 *
 * ── 현재 상태 (2026-08-14) ─────────────────────────────────────────────
 * **아직 어떤 화면에도 배선하지 않았다.** 계좌 인증은 별도 이용 신청이 필요한
 * 부가 API 라(문서 명시), 신청 전에 화면부터 만들면 "되는 척하는" UI 가 된다.
 * 쓸 곳이 생겼을 때(무통장 환불 수취 계좌 검증 · 전문가/셀러 정산 계좌 실명
 * 확인) 이 클라이언트를 붙인다. 그때까지는 서버 모듈로만 존재한다.
 *
 * 보안: 계좌번호·생년월일은 개인정보다 — 로그에 남기지 않고, 응답의 isValid
 * 판정만 밖으로 낸다.
 */

const API_BASE = "https://api.tosspayments.com";

type V2Envelope<T> = {
  version?: string;
  traceId?: string;
  entityBody?: T;
  entityType?: string;
  error?: { code?: string; message?: string } | null;
};

export type BankVerifyResult =
  | { ok: true; isValid: boolean; traceId: string | null }
  | { ok: false; status: number; code: string | null; message: string };

function authHeader(): string | null {
  const secret = process.env.TOSS_SECRET_KEY?.trim();
  if (!secret) return null;
  return `Basic ${Buffer.from(secret + ":").toString("base64")}`;
}

async function postV2(
  path: string,
  body: Record<string, unknown>,
): Promise<BankVerifyResult> {
  const auth = authHeader();
  if (!auth) return { ok: false, status: 0, code: "NOT_CONFIGURED", message: "TOSS_SECRET_KEY 미설정" };
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as V2Envelope<{ isValid?: boolean }>;
    if (!res.ok || json.error) {
      return {
        ok: false,
        status: res.status,
        code: json.error?.code ?? null,
        message: json.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      isValid: json.entityBody?.isValid === true,
      traceId: json.traceId ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "NETWORK",
      message: e instanceof Error ? e.message : "네트워크 오류",
    };
  }
}

/**
 * 예금주 실명 확인 — 계좌가 그 사람(생년월일) 소유가 맞는지.
 * identityNumber: 생년월일 6자리(YYMMDD). 사업자 계좌는 사업자번호 10자리.
 */
export function verifyBankAccountHolderRealName(input: {
  bankCode: string;
  accountNumber: string;
  holderName: string;
  identityNumber: string;
}): Promise<BankVerifyResult> {
  return postV2("/v2/bank-accounts/verify-holder-real-name", {
    bankCode: input.bankCode,
    accountNumber: input.accountNumber,
    holderName: input.holderName,
    identityNumber: input.identityNumber,
  });
}

/**
 * 예금주 성명 일치 확인 — 실명번호 없이 이름만 대조하는 가벼운 버전.
 */
export function verifyBankAccountHolderName(input: {
  bankCode: string;
  accountNumber: string;
  holderName: string;
}): Promise<BankVerifyResult> {
  return postV2("/v2/bank-accounts/verify-holder-name", {
    bankCode: input.bankCode,
    accountNumber: input.accountNumber,
    holderName: input.holderName,
  });
}
