export type KakaoPayReadyInput = {
  orderId: string;
  userId: string;
  itemName: string;
  quantity: number;
  totalAmount: number;
  approvalUrl: string;
  cancelUrl: string;
  failUrl: string;
};

export type KakaoPayReadyResult = {
  tid: string;
  next_redirect_pc_url?: string;
  next_redirect_mobile_url?: string;
  next_redirect_app_url?: string;
  android_app_scheme?: string;
  ios_app_scheme?: string;
  created_at?: string;
};

export type KakaoPayApproveInput = {
  tid: string;
  partnerOrderId: string;
  partnerUserId: string;
  pgToken: string;
};

export type KakaoPayApproveResult = {
  aid?: string;
  tid?: string;
  cid?: string;
  partner_order_id?: string;
  partner_user_id?: string;
  payment_method_type?: string;
  amount?: {
    total?: number;
    tax_free?: number;
    vat?: number;
    point?: number;
    discount?: number;
  };
  approved_at?: string;
};

const READY_URL = "https://open-api.kakaopay.com/online/v1/payment/ready";
const APPROVE_URL = "https://open-api.kakaopay.com/online/v1/payment/approve";

export function isKakaoPayConfigured(): boolean {
  return Boolean(
    process.env.KAKAOPAY_CID?.trim() && process.env.KAKAOPAY_SECRET_KEY?.trim(),
  );
}

function authHeader(): string {
  const secret = process.env.KAKAOPAY_SECRET_KEY?.trim();
  if (!secret) throw new Error("KAKAOPAY_SECRET_KEY 가 설정되지 않았습니다.");
  return `SECRET_KEY ${secret}`;
}

function cid(): string {
  const value = process.env.KAKAOPAY_CID?.trim();
  if (!value) throw new Error("KAKAOPAY_CID 가 설정되지 않았습니다.");
  return value;
}

export async function createKakaoPayReady(
  input: KakaoPayReadyInput,
): Promise<KakaoPayReadyResult> {
  const res = await fetch(READY_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cid: cid(),
      partner_order_id: input.orderId,
      partner_user_id: input.userId,
      item_name: input.itemName.slice(0, 100),
      quantity: input.quantity,
      total_amount: input.totalAmount,
      vat_amount: Math.floor(input.totalAmount / 11),
      tax_free_amount: 0,
      approval_url: input.approvalUrl,
      cancel_url: input.cancelUrl,
      fail_url: input.failUrl,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (typeof data.msg === "string" && data.msg) ||
      (typeof data.message === "string" && data.message) ||
      "카카오페이 결제 준비에 실패했습니다.";
    throw new Error(msg);
  }

  const tid = typeof data.tid === "string" ? data.tid : "";
  if (!tid) throw new Error("카카오페이 tid 를 받지 못했습니다.");

  return {
    tid,
    next_redirect_pc_url:
      typeof data.next_redirect_pc_url === "string"
        ? data.next_redirect_pc_url
        : undefined,
    next_redirect_mobile_url:
      typeof data.next_redirect_mobile_url === "string"
        ? data.next_redirect_mobile_url
        : undefined,
    next_redirect_app_url:
      typeof data.next_redirect_app_url === "string"
        ? data.next_redirect_app_url
        : undefined,
    android_app_scheme:
      typeof data.android_app_scheme === "string"
        ? data.android_app_scheme
        : undefined,
    ios_app_scheme:
      typeof data.ios_app_scheme === "string" ? data.ios_app_scheme : undefined,
    created_at:
      typeof data.created_at === "string" ? data.created_at : undefined,
  };
}

export async function approveKakaoPay(
  input: KakaoPayApproveInput,
): Promise<KakaoPayApproveResult> {
  const res = await fetch(APPROVE_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cid: cid(),
      tid: input.tid,
      partner_order_id: input.partnerOrderId,
      partner_user_id: input.partnerUserId,
      pg_token: input.pgToken,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (typeof data.msg === "string" && data.msg) ||
      (typeof data.message === "string" && data.message) ||
      "카카오페이 결제 승인에 실패했습니다.";
    throw new Error(msg);
  }

  return data as KakaoPayApproveResult;
}
