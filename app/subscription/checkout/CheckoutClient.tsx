"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  isTossTestEnv,
  loadTossSdk,
  tossClientKey,
  type TossWidgets,
} from "../toss-rail";

/* ============================================================
   결제위젯 주문서형 클라이언트.

   흐름 (docs.tosspayments.com/guides/v2/get-started/payment-flow):
     1) URL ?tier=&billing= 검증 → 서버 주문 생성(/api/payments/toss/create —
        금액은 서버가 계산·저장, 로그인 필수 401)
     2) SDK widgets() → setAmount → renderPaymentMethods + renderAgreement
     3) 결제하기 → requestPayment → successUrl 리다이렉트(paymentKey·orderId·amount)
     4) /payment/success 가 서버 confirm(금액 대조·멱등키) 호출

   사실 우선:
   - 테스트 키(test_ck_)면 "실제 청구 없음"을 화면에 명시한다.
   - 위젯 렌더 실패는 실패라고 말하고(구독 페이지로 되돌아가는 길 제공),
     빈 화면으로 결제가 되는 척하지 않는다.
   ============================================================ */

type Phase =
  | { kind: "loading"; msg: string }
  | { kind: "ready"; orderId: string; amount: number }
  | { kind: "login" }
  | { kind: "error"; msg: string };

const TIER_LABEL: Record<string, string> = { pro: "플러스", expert: "프로" };

function parseParams(): { tier: "pro" | "expert"; billing: "monthly" | "annual" } | null {
  try {
    const sp = new URLSearchParams(window.location.search);
    const tier = sp.get("tier");
    const billing = sp.get("billing") === "annual" ? "annual" : "monthly";
    if (tier !== "pro" && tier !== "expert") return null;
    return { tier, billing };
  } catch {
    return null;
  }
}

export function CheckoutClient() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading", msg: "주문 준비 중…" });
  const [params, setParams] = useState<{
    tier: "pro" | "expert";
    billing: "monthly" | "annual";
  } | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const widgetsRef = useRef<TossWidgets | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return; // StrictMode 이중 실행 방지
    startedRef.current = true;

    const p = parseParams();
    if (!p) {
      setPhase({ kind: "error", msg: "결제할 플랜 정보가 없어요. 구독 페이지에서 다시 시작해 주세요." });
      return;
    }
    setParams(p);

    if (!tossClientKey()) {
      setPhase({
        kind: "error",
        msg: "결제 서비스가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }

    void (async () => {
      // 1) 로그인 확인
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const j = (await res.json().catch(() => null)) as
          | { user?: { email?: string | null } }
          | null;
        if (!j?.user?.email) {
          setPhase({ kind: "login" });
          return;
        }
        setEmail(j.user.email);
      } catch {
        setPhase({ kind: "login" });
        return;
      }

      // 2) 서버 주문 생성 (금액은 서버 계산 — 클라이언트 금액을 믿지 않는다)
      setPhase({ kind: "loading", msg: "주문 생성 중…" });
      let orderId: string;
      let amount: number;
      try {
        const res = await fetch("/api/payments/toss/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tier: p.tier,
            billing: p.billing,
            source: "subscription",
            campaign: "widget-checkout",
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          orderId?: string;
          amount?: number;
          error?: string;
        };
        if (res.status === 401) {
          setPhase({ kind: "login" });
          return;
        }
        if (!res.ok || !j.orderId || !Number.isFinite(j.amount)) {
          setPhase({
            kind: "error",
            msg: j.error ?? "주문을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.",
          });
          return;
        }
        orderId = j.orderId;
        amount = Number(j.amount);
      } catch {
        setPhase({ kind: "error", msg: "네트워크 오류로 주문을 생성하지 못했어요." });
        return;
      }

      // 3) 위젯 렌더
      setPhase({ kind: "loading", msg: "결제 수단 불러오는 중…" });
      try {
        const TossPayments = await loadTossSdk();
        const widgets = TossPayments(tossClientKey() as string).widgets({
          /* 개인정보(이메일)를 토스 대시보드 식별자로 남기지 않는다 —
             일회성 결제라 비회원 상수로 충분하다(빌링 전환 시 서버 발급 키로). */
          customerKey: TossPayments.ANONYMOUS,
        });
        await widgets.setAmount({ currency: "KRW", value: amount });
        await Promise.all([
          /* variantKey 미지정 → 기본 UI. 계약 완료 후 상점관리자 결제위젯
             어드민에서 만든 UI 는 variantKey 로 지정한다(코드 수정 없이 관리). */
          widgets.renderPaymentMethods({ selector: "#toss-payment-methods" }),
          widgets.renderAgreement({ selector: "#toss-agreement" }),
        ]);
        widgetsRef.current = widgets;
        setPhase({ kind: "ready", orderId, amount });
      } catch (e) {
        setPhase({
          kind: "error",
          msg:
            e instanceof Error && e.message
              ? `결제 화면을 불러오지 못했어요 (${e.message.slice(0, 80)})`
              : "결제 화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        });
      }
    })();
  }, []);

  async function pay() {
    if (paying || phase.kind !== "ready" || !widgetsRef.current || !params) return;
    setPaying(true);
    try {
      const origin = window.location.origin;
      await widgetsRef.current.requestPayment({
        orderId: phase.orderId,
        orderName: `누구집 ${TIER_LABEL[params.tier]} ${params.billing === "annual" ? "연간" : "월간"} 구독`,
        successUrl: `${origin}/payment/success`,
        failUrl: `${origin}/payment/fail`,
        ...(email ? { customerEmail: email } : {}),
      });
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
      if (code !== "USER_CANCEL" && code !== "PAY_PROCESS_CANCELED") {
        setPhase({
          kind: "error",
          msg: "결제 요청에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
      }
    } finally {
      setPaying(false);
    }
  }

  const label = params ? (TIER_LABEL[params.tier] ?? params.tier) : "";
  const billingLabel = params?.billing === "annual" ? "연간" : "월간";

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3">
      {params && (
        <p className="text-[13px] text-text-2">
          {label} 플랜 · {billingLabel} 결제
        </p>
      )}
      {isTossTestEnv() && (
        <p className="rounded-xl bg-[rgba(245,158,11,.12)] px-3.5 py-2.5 text-[12px] font-bold text-[#b45309]">
          테스트 결제 환경 — 승인이 가상으로 이루어져 실제 금액이 청구되지 않아요.
        </p>
      )}

      {phase.kind === "login" && (
        <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
          <p className="text-[14px] font-extrabold text-ink">결제하려면 로그인이 필요해요</p>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(
              typeof window !== "undefined"
                ? window.location.pathname + window.location.search
                : "/subscription",
            )}`}
            className="btn-primary btn-sm no-underline"
          >
            로그인하기
          </Link>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
          <p className="text-[14px] font-extrabold text-ink">결제를 시작하지 못했어요</p>
          <p className="text-[12px] leading-[1.6] text-text-3">{phase.msg}</p>
          <Link href="/subscription" className="btn-soft btn-sm no-underline">
            구독 페이지로 돌아가기
          </Link>
        </div>
      )}

      {phase.kind === "loading" && (
        <div className="card rounded-2xl px-4 py-8 text-center text-[13px] text-text-3">
          {phase.msg}
        </div>
      )}

      {/* 위젯 마운트 지점 — 렌더 호출 전에 DOM 에 있어야 하므로 항상 마운트.
          display:none 컨테이너에는 위젯이 크기를 못 재므로 숨기지 않는다
          (로딩 중에는 비어 있어 자리만 차지하지 않는다). */}
      <div className="flex flex-col gap-2">
        <div id="toss-payment-methods" className="overflow-hidden rounded-2xl" />
        <div id="toss-agreement" className="overflow-hidden rounded-2xl" />
        {phase.kind === "ready" && (
          <>
            <button
              type="button"
              onClick={() => void pay()}
              disabled={paying}
              className="btn-primary btn-cta rounded-[14px] p-[14px] text-center text-[15px] font-bold disabled:opacity-60"
            >
              {paying
                ? "결제창 여는 중…"
                : `${phase.amount.toLocaleString("ko-KR")}원 결제하기`}
            </button>
            <p className="text-center text-[11px] text-text-3">
              결제 완료 후 자동으로 구독이 활성화돼요 · 주문번호 {phase.orderId}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
