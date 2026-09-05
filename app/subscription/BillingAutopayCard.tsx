"use client";

import { useState } from "react";
import { planLabel } from "@/lib/subscriptions/labels";
import Link from "next/link";

/**
 * 자동결제 상태 카드 + 해지 버튼 (구독 관리 패널 안).
 *
 * 서버(BillingPanel)가 넘겨주는 값은 공개 필드뿐이다 — billingKey·customerKey 는
 * 서버 저장소 밖으로 나오지 않는다. 해지는 즉시 반영되고, 이미 결제한 기간은
 * 만료일까지 유지된다는 사실을 버튼 옆에 그대로 적는다.
 */

type Props = {
  plan: string;
  billing: string;
  amount: number;
  status: string;
  cardCompany: string | null;
  cardNumberMasked: string | null;
  nextChargeAt: string | null;
  /** [966] 이용 만료(app_users.plan_expires_at) — 해지 확인 문구에 "언제까지" 를 적는다 */
  planExpiresAt?: string | null;
};

/* 플랜명은 단일 출처를 쓴다 — 지역 맵은 곧 다른 화면과 어긋난다. */

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function BillingAutopayCard(props: Props) {
  const [state, setState] = useState<"idle" | "confirm" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function cancel() {
    setState("working");
    try {
      const res = await fetch("/api/payments/toss/billing/cancel", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && j.ok) {
        setState("done");
        setMessage(j.message ?? "자동결제를 해지했어요.");
      } else {
        setState("error");
        setMessage(j.error ?? "해지 처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setState("error");
      setMessage("네트워크 오류로 해지하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl bg-[rgba(29,79,216,.04)] px-4 py-3 t-sub text-text-2">
        {message}
      </div>
    );
  }

  const suspended = props.status === "suspended";

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="t-sub font-extrabold text-ink">
          자동결제 이용 중 · {planLabel(props.plan)}{" "}
          {props.billing === "annual" ? "연간" : "월간"}
        </span>
        <span className="t-sub font-bold text-ink">
          {props.amount.toLocaleString("ko-KR")}원 / {props.billing === "annual" ? "년" : "월"}
        </span>
      </div>
      <p className="t-sub text-text-2">
        {props.cardCompany || props.cardNumberMasked ? (
          <>
            결제 카드: {props.cardCompany ?? "카드"} {props.cardNumberMasked ?? ""} ·{" "}
          </>
        ) : null}
        {suspended ? (
          <b>결제 실패로 자동결제가 잠시 멈춰 있어요 — 카드를 다시 등록하면 이어서 이용할 수 있어요.</b>
        ) : (
          <>
            다음 결제 예정일: <b>{fmtDate(props.nextChargeAt)}</b>
          </>
        )}
      </p>
      {state === "confirm" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-sub text-text-2">
            {props.planExpiresAt
              ? `해지해도 ${fmtDate(props.planExpiresAt)}까지는 그대로 이용되고, 그 뒤 무료 플랜으로 전환돼요. 다음 결제일(${fmtDate(props.nextChargeAt)})에는 청구되지 않아요. 해지할까요?`
              : "해지해도 이미 결제한 기간은 만료일까지 그대로 이용돼요. 다음 결제일에는 청구되지 않아요. 해지할까요?"}
          </span>
          <button
            type="button"
            onClick={() => void cancel()}
            className="btn-soft btn-sm rounded-lg px-3 py-1.5 t-sub font-bold text-danger"
          >
            해지 확정
          </button>
          <button
            type="button"
            onClick={() => setState("idle")}
            className="btn-soft btn-sm rounded-lg px-3 py-1.5 t-sub font-bold"
          >
            유지하기
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link
            href={`/subscription/billing?tier=${props.plan}&billing=${props.billing}&mode=card`}
            className="btn-soft btn-sm w-fit rounded-lg px-3 py-1.5 t-sub font-bold no-underline"
          >
            {suspended ? "카드 다시 등록" : "카드 변경"}
          </Link>
          <button
            type="button"
            onClick={() => setState("confirm")}
            disabled={state === "working"}
            className="btn-soft btn-sm w-fit rounded-lg px-3 py-1.5 t-sub font-bold disabled:opacity-60"
          >
            {state === "working" ? "해지 처리 중…" : "자동결제 해지"}
          </button>
          {state === "error" && message && (
            <span className="t-sub text-danger">{message}</span>
          )}
        </div>
      )}
    </div>
  );
}
