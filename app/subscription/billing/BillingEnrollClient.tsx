"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isTossTestEnv, loadTossSdk, tossBillingClientKey } from "../toss-rail";

/* ============================================================
   자동결제(빌링) 카드 등록 클라이언트.

   흐름 (빌링 결제창 연동 문서):
     1) 서버에 등록 시작 요청(/api/payments/toss/billing/start) —
        customerKey(서버 발급 무작위 UUID)와 서버 계산 금액을 받는다.
     2) SDK payment({ customerKey }).requestBillingAuth({ method: "CARD" }) —
        카드 등록창이 열리고, 완료되면 successUrl 로 customerKey+authKey 가 간다.
     3) successUrl(/api/payments/toss/billing/register)이 서버에서 빌링키를
        발급받아 저장하고 첫 결제를 승인한 뒤 결과 화면으로 보낸다.

   사실 우선:
   - 빌링키·authKey 는 이 컴포넌트에 절대 오지 않는다(서버 전용).
   - 테스트 키면 "실제 청구 없음"을 명시한다.
   - 서버가 503(전자계약 대기)을 주면 그 사실을 그대로 보여 준다 —
     되는 척하는 버튼을 만들지 않는다.
   ============================================================ */

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; amount: number }
  | { kind: "login" }
  | { kind: "unavailable"; msg: string }
  | { kind: "error"; msg: string };

const TIER_LABEL: Record<string, string> = { pro: "플러스", expert: "프로" };

type EnrollParams = {
  tier: "pro" | "expert" | null;
  billing: "monthly" | "annual";
  /** mode=card — 살아 있는 구독의 결제 카드만 교체(추가 결제 없음) */
  cardChange: boolean;
};

function parseParams(): EnrollParams | null {
  try {
    const sp = new URLSearchParams(window.location.search);
    const cardChange = sp.get("mode") === "card";
    const tier = sp.get("tier");
    const billing = sp.get("billing") === "annual" ? "annual" : "monthly";
    if (tier !== "pro" && tier !== "expert") {
      // 카드 변경은 서버가 구독에서 플랜을 찾아 주므로 tier 없이도 진행
      return cardChange ? { tier: null, billing, cardChange } : null;
    }
    return { tier, billing, cardChange };
  } catch {
    return null;
  }
}

export function BillingEnrollClient() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [params, setParams] = useState<EnrollParams | null>(null);
  const [customerKey, setCustomerKey] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const p = parseParams();
    if (!p) {
      setPhase({ kind: "error", msg: "등록할 플랜 정보가 없어요. 구독 페이지에서 다시 시작해 주세요." });
      return;
    }
    setParams(p);
    void (async () => {
      try {
        const sess = await fetch("/api/auth/session", { cache: "no-store" });
        const sj = (await sess.json().catch(() => null)) as { user?: { email?: string | null } } | null;
        if (!sj?.user?.email) {
          setPhase({ kind: "login" });
          return;
        }
        setEmail(sj.user.email);
        const res = await fetch("/api/payments/toss/billing/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            p.cardChange ? { mode: "card" } : { tier: p.tier, billing: p.billing },
          ),
        });
        const j = (await res.json().catch(() => ({}))) as {
          customerKey?: string;
          amount?: number;
          error?: string;
          plan?: string;
          billing?: string;
        };
        if (res.status === 401) {
          setPhase({ kind: "login" });
          return;
        }
        if (res.status === 503) {
          setPhase({
            kind: "unavailable",
            msg: j.error ?? "자동결제는 아직 준비 중이에요.",
          });
          return;
        }
        if (!res.ok || !j.customerKey || !Number.isFinite(j.amount)) {
          setPhase({ kind: "error", msg: j.error ?? "등록을 시작하지 못했어요." });
          return;
        }
        setCustomerKey(j.customerKey);
        // 카드 변경 — 서버가 구독에서 찾아 준 플랜·주기로 표기를 맞춘다
        if (p.cardChange && (j.plan === "pro" || j.plan === "expert")) {
          setParams({
            tier: j.plan,
            billing: j.billing === "annual" ? "annual" : "monthly",
            cardChange: true,
          });
        }
        setPhase({ kind: "ready", amount: Number(j.amount) });
        void loadTossSdk().catch(() => {}); // 사파리 제스처 차단 대비 프리로드
      } catch {
        setPhase({ kind: "error", msg: "네트워크 오류로 등록을 시작하지 못했어요." });
      }
    })();
  }, []);

  async function openBillingAuth() {
    if (opening || phase.kind !== "ready" || !customerKey || !params) return;
    setOpening(true);
    try {
      const TossPayments = await loadTossSdk();
      /* 자동결제 MID 의 클라이언트 키 — 일반결제 키로는 카드 등록이 안 된다 */
      const payment = TossPayments(tossBillingClientKey() as string).payment({ customerKey });
      const origin = window.location.origin;
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${origin}/api/payments/toss/billing/register${params.cardChange ? "?mode=card" : ""}`,
        failUrl: `${origin}/payment/fail`,
        ...(email ? { customerEmail: email } : {}),
      });
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
      if (code !== "USER_CANCEL" && code !== "PAY_PROCESS_CANCELED") {
        const detail = [code, e instanceof Error ? e.message : ""].filter(Boolean).join(" · ").slice(0, 140);
        setPhase({
          kind: "error",
          msg: `카드 등록창을 열지 못했어요${detail ? ` (${detail})` : ""}. 잠시 후 다시 시도해 주세요.`,
        });
      }
    } finally {
      setOpening(false);
    }
  }

  const label = params?.tier ? (TIER_LABEL[params.tier] ?? params.tier) : "";
  const billingLabel = params?.billing === "annual" ? "연간" : "월간";

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3">
      {params && (
        <p className="t-body text-text-2">
          {params.cardChange
            ? `자동결제 카드 변경${label ? ` — ${label} 플랜 · ${billingLabel}` : ""}`
            : `${label} 플랜 · ${billingLabel} 자동결제 등록`}
        </p>
      )}
      {isTossTestEnv() && (
        <p className="rounded-xl bg-[rgba(245,158,11,.12)] px-3.5 py-2.5 t-sub font-bold text-[#b45309]">
          테스트 환경 — 카드 등록·결제가 가상으로 이루어져 실제 금액이 청구되지 않아요.
        </p>
      )}

      {phase.kind === "loading" && (
        <div className="card rounded-2xl px-4 py-8 text-center t-body text-text-3">
          자동결제 등록 준비 중…
        </div>
      )}

      {phase.kind === "login" && (
        <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
          <p className="t-section text-ink">카드를 등록하려면 로그인이 필요해요</p>
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

      {phase.kind === "unavailable" && (
        <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
          <p className="t-section text-ink">자동결제는 아직 준비 중이에요</p>
          <p className="t-sub text-text-3">{phase.msg}</p>
          <Link href="/subscription" className="btn-soft btn-sm no-underline">
            단건 결제로 이용하기
          </Link>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
          <p className="t-section text-ink">등록을 시작하지 못했어요</p>
          <p className="t-sub text-text-3">{phase.msg}</p>
          <Link href="/subscription" className="btn-soft btn-sm no-underline">
            구독 페이지로 돌아가기
          </Link>
        </div>
      )}

      {phase.kind === "ready" && (
        <>
          <div className="card flex flex-col gap-2 rounded-2xl px-4 py-5">
            <div className="flex items-center justify-between t-body">
              <span className="text-text-3">플랜</span>
              <span className="font-bold text-ink">
                {label} · {billingLabel} 자동결제
              </span>
            </div>
            <div className="flex items-center justify-between t-body">
              <span className="text-text-3">결제 금액</span>
              <span className="font-extrabold text-ink">
                {phase.amount.toLocaleString("ko-KR")}원 / {billingLabel === "연간" ? "년" : "월"}
              </span>
            </div>
            <p className="mt-1 t-sub text-text-3">
              {params?.cardChange ? (
                <>
                  새 카드를 등록하면 지금 등록된 카드를 대체해요 — 추가 결제 없이 다음
                  결제일부터 새 카드로 청구돼요. 결제 실패로 멈춘 구독은 새 카드 등록 즉시
                  재개돼요. 카드 정보는 토스페이먼츠에만 저장되며 누구집 서버에는 카드번호가
                  남지 않아요.
                </>
              ) : (
                <>
                  카드를 등록하면 첫 결제가 바로 진행되고, 이후 같은 금액이{" "}
                  {billingLabel === "연간" ? "매년" : "매달"} 자동으로 결제돼요. 해지는 언제든
                  구독 관리에서 할 수 있고, 해지해도 이미 결제한 기간은 만료일까지 그대로
                  이용할 수 있어요. 카드 정보는 토스페이먼츠에만 저장되며 누구집 서버에는
                  카드번호가 남지 않아요.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void openBillingAuth()}
            disabled={opening}
            className="btn-primary btn-cta rounded-[14px] p-[14px] text-center t-body font-bold disabled:opacity-60"
          >
            {opening
              ? "카드 등록창 여는 중…"
              : params?.cardChange
                ? "새 카드로 변경하기"
                : "카드 등록하고 자동결제 시작"}
          </button>
          <p className="text-center t-sub text-text-3">
            결제 7일 이내 청약철회(전액 환불) 가능 ·{" "}
            <Link href="/legal/terms#refund" className="underline underline-offset-2">
              환불 규정
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
