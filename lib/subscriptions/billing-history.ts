/**
 * 결제 내역 조회 (E1)
 *
 * 왜 별도 모듈인가: 같은 질의를 `GET /api/subscriptions`(JSON)와
 * `/subscription` 화면(서버 렌더)이 동시에 필요로 한다. 한쪽에만 두면
 * 화면과 API가 서로 다른 컬럼·정렬을 보게 되고, 그 순간부터 "영수증이
 * API엔 있는데 화면엔 없다" 같은 차이가 생긴다. 돈에 관한 화면이라
 * 단일 출처로 묶어 둔다.
 *
 * 사실 우선 원칙:
 *  - `public.payments` 는 현재 0행이다(2026-07 확인). 그래서 이 모듈은
 *    절대 예시 행을 만들어내지 않는다. 없으면 빈 배열을 돌려주고,
 *    화면이 "아직 결제 내역이 없어요"라고 정직하게 말하게 한다.
 *  - Supabase 미연결(로컬·프리뷰)일 때도 빈 배열이다. 조회 실패와
 *    "결제가 없음"을 화면에서 구분해야 하므로 `ok` 플래그를 함께 준다.
 */

import { getServiceSupabase } from "@/lib/supabase/service";

export type PaymentRecord = {
  id: string;
  orderId: string | null;
  plan: string | null;
  billing: string | null;
  amount: number | null;
  status: string | null;
  method: string | null;
  receiptUrl: string | null;
  requestedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
};

export type BillingHistory = {
  /** 조회 자체가 성공했는지 — false 면 "내역 없음"이 아니라 "확인 불가" */
  ok: boolean;
  payments: PaymentRecord[];
};

/** 결제 상태 한글 라벨 — DB 값이 예상 밖이면 원문을 그대로 보여준다(임의 번역 금지). */
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  requested: "결제 진행 중",
  paid: "결제 완료",
  done: "결제 완료",
  failed: "결제 실패",
  cancelled: "결제 취소",
  canceled: "결제 취소",
  refunded: "환불 완료",
};

export const PAYMENT_PLAN_LABEL: Record<string, string> = {
  free: "무료",
  pro: "플러스",
  expert: "프로 (전문가)",
};

export async function loadBillingHistory(
  userEmail: string,
  limit = 10,
): Promise<BillingHistory> {
  const email = userEmail.trim().toLowerCase();
  if (!email) return { ok: false, payments: [] };

  const sb = getServiceSupabase();
  if (!sb) return { ok: false, payments: [] };

  const { data, error } = await sb
    .from("payments")
    .select(
      "id, order_id, plan, billing, amount, status, method, receipt_url, requested_at, paid_at, cancelled_at",
    )
    .eq("user_email", email)
    .order("requested_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, limit)));

  if (error) return { ok: false, payments: [] };

  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    ok: true,
    payments: rows.map((r) => ({
      id: String(r.id ?? ""),
      orderId: r.order_id != null ? String(r.order_id) : null,
      plan: r.plan != null ? String(r.plan) : null,
      billing: r.billing != null ? String(r.billing) : null,
      amount: typeof r.amount === "number" ? r.amount : null,
      status: r.status != null ? String(r.status) : null,
      method: r.method != null ? String(r.method) : null,
      receiptUrl: r.receipt_url != null ? String(r.receipt_url) : null,
      requestedAt: r.requested_at != null ? String(r.requested_at) : null,
      paidAt: r.paid_at != null ? String(r.paid_at) : null,
      cancelledAt: r.cancelled_at != null ? String(r.cancelled_at) : null,
    })),
  };
}
