import "server-only";

/**
 * 토스페이먼츠 자동결제(빌링) 서버 클라이언트 — 기반 모듈.
 *
 * 문서: docs.tosspayments.com/guides/v2/billing
 *
 * ── 현재 상태 (2026-08-03) ─────────────────────────────────────────
 * 자동결제는 **리스크 검토·추가 계약 후** 사용할 수 있다(문서 명시). 상점
 * (MID nuguzibowg) 전자결제 심사가 진행 중이므로, 지금은 API 클라이언트만
 * 준비해 두고 화면·크론 배선은 계약 승인 후 붙인다. 그 전까지 구독은
 * 일회성 결제(30/365일 이용 기간 기록) 경로를 쓴다 — 기존 confirm 흐름.
 *
 * ── 붙일 때의 흐름 ────────────────────────────────────────────────
 * 1) 클라이언트: SDK payment({ customerKey }) → requestBillingAuth() →
 *    successUrl 로 authKey + customerKey 리다이렉트.
 *    customerKey 는 **서버가 발급한 무작위 고유값**(2~50자·특수문자 포함)을
 *    쓴다 — 이메일 등 개인정보 금지, 유추 가능한 값 금지(문서 명시).
 * 2) 서버: issueBillingKey(authKey, customerKey) → billingKey 발급.
 *    billingKey 는 카드 정보의 암호화 대체값이다 — **클라이언트로 절대
 *    내려보내지 않고** 서버 저장소에 customerKey 와 매핑해 보관한다.
 * 3) 갱신 주기마다(크론): chargeBillingKey() 로 승인. orderId 는 매 결제
 *    새로 발급하고 결과를 payments 테이블에 기록한다.
 *
 * 환경: 시크릿 키는 confirm 과 같은 TOSS_SECRET_KEY. 테스트 키에서는
 * 카드 앞 6자리(BIN)만 유효해도 빌링키가 발급된다(환경 가이드).
 */

const API_BASE = "https://api.tosspayments.com";

/* 멱등키 생성은 lib/payments/idempotency.ts(순수·테스트 가능)로 옮겼다 —
   confirm 라우트와 공유. 재수출해 기존 import 경로를 유지한다. */
export { deterministicIdempotencyKey } from "@/lib/payments/idempotency";

function authHeader(): string | null {
  const secret = process.env.TOSS_SECRET_KEY?.trim();
  if (!secret) return null;
  return `Basic ${Buffer.from(secret + ":").toString("base64")}`;
}

export function isTossBillingConfigured(): boolean {
  return authHeader() !== null;
}

/**
 * 빌링 기능 개방 스위치 — **전자계약 승인 후 소유자가 명시적으로 켠다.**
 *
 * 자동결제는 리스크 검토·추가 계약 후에만 쓸 수 있다(빌링 문서 명시). 계약 전에
 * 카드 등록 화면을 열어 두면 등록은 되는데 승인이 전부 거절되는, "되는 척하는"
 * 화면이 된다 — 사실 우선 원칙 위반. 그래서 키가 있어도 이 env 가 "1" 이 아니면
 * 화면·API 모두 정직한 대기 상태를 보여 준다.
 *
 * 켜는 절차(소유자): 토스 빌링 전자계약 승인 확인 → Vercel 환경변수
 * NEXT_PUBLIC_TOSS_BILLING_ENABLED=1 추가 → 재배포. (공개 플래그인 이유:
 * 카드 등록 UI 는 클라이언트 컴포넌트라 서버 전용 env 를 읽을 수 없다.
 * 이 값은 기능 개방 여부일 뿐 비밀이 아니다.)
 */
export function isTossBillingEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_TOSS_BILLING_ENABLED?.trim() === "1" && isTossBillingConfigured()
  );
}

/**
 * 갱신 승인 실패를 "다음 크론에서 재시도할 것"과 "재시도해도 소용없는 것"으로
 * 가른다. 빌링키가 삭제·무효인 경우는 몇 번을 다시 불러도 같은 답이다 —
 * 즉시 suspended 로 접고 사용자에게 카드 재등록을 안내해야 한다(빌링 문서의
 * "승인 실패 시 새 카드 등록 유도" 흐름).
 */
export function isNonRetryableBillingCode(code: string | null): boolean {
  if (!code) return false;
  return [
    "NOT_FOUND_BILLING_KEY",
    "INVALID_BILL_KEY_REQUEST",
    "INVALID_STOPPED_CARD",
    "INVALID_CARD_EXPIRATION",
    "INVALID_CARD_NUMBER",
    "NOT_SUPPORTED_CARD_TYPE",
    "REJECT_ACCOUNT_PAYMENT",
  ].includes(code);
}

export type TossBillingKey = {
  billingKey: string;
  customerKey: string;
  cardCompany: string | null;
  cardNumberMasked: string | null;
};

export type TossBillingResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string | null; message: string };

async function post<T>(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<TossBillingResult<T>> {
  const auth = authHeader();
  if (!auth) return { ok: false, status: 0, code: "NOT_CONFIGURED", message: "TOSS_SECRET_KEY 미설정" };
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: typeof json.code === "string" ? json.code : null,
        message: typeof json.message === "string" ? json.message : `HTTP ${res.status}`,
      };
    }
    return { ok: true, data: json as T };
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
 * 빌링키 발급 — requestBillingAuth successUrl 로 받은 authKey 를 교환한다.
 * POST /v1/billing/authorizations/issue
 */
export async function issueBillingKey(
  authKey: string,
  customerKey: string,
): Promise<TossBillingResult<TossBillingKey>> {
  const r = await post<{
    billingKey?: string;
    customerKey?: string;
    card?: { company?: string; number?: string } | null;
  }>("/v1/billing/authorizations/issue", { authKey, customerKey });
  if (!r.ok) return r;
  const d = r.data;
  if (!d.billingKey || !d.customerKey) {
    return { ok: false, status: 200, code: "MALFORMED", message: "billingKey 응답 형식 오류" };
  }
  return {
    ok: true,
    data: {
      billingKey: d.billingKey,
      customerKey: d.customerKey,
      cardCompany: d.card?.company ?? null,
      cardNumberMasked: d.card?.number ?? null,
    },
  };
}

/**
 * 빌링키 결제 승인 — POST /v1/billing/{billingKey}
 * orderId 는 매 결제 새로 발급할 것. idempotencyKey 는 같은 주기 재시도에
 * 같은 값을 넘겨 이중 청구를 막는다.
 */
export async function chargeBillingKey(input: {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerEmail?: string;
  idempotencyKey?: string;
}): Promise<TossBillingResult<{ paymentKey?: string; status?: string; totalAmount?: number }>> {
  return post(
    `/v1/billing/${encodeURIComponent(input.billingKey)}`,
    {
      customerKey: input.customerKey,
      amount: input.amount,
      orderId: input.orderId,
      orderName: input.orderName,
      ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
    },
    input.idempotencyKey,
  );
}

/**
 * 빌링키 삭제 — DELETE /v1/billing/{billingKey} (코어 API 문서).
 * 사용자가 자동결제를 해지할 때 카드 등록도 함께 지우는 용도. 삭제 후 토스가
 * BILLING_DELETED 웹훅을 보낼 수 있으나, 우리는 삭제 요청 시점에 이미 로컬
 * 상태를 접으므로 웹훅은 멱등하게 흡수된다.
 */
export async function deleteBillingKey(
  billingKey: string,
): Promise<TossBillingResult<Record<string, unknown>>> {
  const auth = authHeader();
  if (!auth) return { ok: false, status: 0, code: "NOT_CONFIGURED", message: "TOSS_SECRET_KEY 미설정" };
  try {
    const res = await fetch(`${API_BASE}/v1/billing/${encodeURIComponent(billingKey)}`, {
      method: "DELETE",
      headers: { Authorization: auth },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: typeof json.code === "string" ? json.code : null,
        message: typeof json.message === "string" ? json.message : `HTTP ${res.status}`,
      };
    }
    return { ok: true, data: json };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "NETWORK",
      message: e instanceof Error ? e.message : "네트워크 오류",
    };
  }
}
