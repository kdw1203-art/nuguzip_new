"use client";

import { useState } from "react";

/**
 * 결제 미개통 상태의 사전 등록 버튼 (항목 33).
 *
 * 사업자 고지 미완·PSP 미설정으로 결제가 열리지 않은 동안, 결제 버튼을
 * 눌러 실패 문구를 보게 하는 대신 사실을 먼저 말하고("결제 준비 중")
 * 구매 의사를 platform_event 로 기록한다 — 소프트 오픈 기간의 수요를
 * 셀 수 있는 유일한 기록이다. 결제가 열리면 이 명단에 인앱 알림을 보낸다.
 */
export function PreOrderCta({
  tier,
  billing,
  className,
  dark = false,
  weeklyAvailable = false,
}: {
  tier: "pro" | "expert";
  billing: "weekly" | "monthly" | "annual";
  className: string;
  /** 어두운 플랜 카드(PRO, bg #222830) 위 렌더 여부 — 안내 문구 색을 바꾼다.
      text-3(#606a77)는 어두운 배경에서 2.7:1 로 WCAG AA 미달이라 a11y 게이트가
      잡았다. 다크에서는 ai-muted(#9aa6b8, 6.0:1)를 쓴다. */
  dark?: boolean;
  /** [966] 월간·연간만 닫혀 있고 주간권은 살 수 있는 상태 — 문구를 그 사실대로 */
  weeklyAvailable?: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function register() {
    if (state === "busy" || state === "done") return;
    setState("busy");
    try {
      const res = await fetch("/api/platform/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: "plan_preorder_interest",
          source: "subscription",
          campaign: "preorder",
          path: "/subscription",
          metadata: { tier, billing },
        }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-[14px] bg-primary-soft p-[13px] text-center t-body font-bold text-primary">
        등록됐어요 — 결제가 열리면 알림으로 알려드릴게요
      </div>
    );
  }

  return (
    <>
      {/* [966] 결제 버튼(PlanCheckoutButton)과 같은 바탕 클래스 — 예전엔 className 만 받아
          패딩·라운드 없는 맨 테두리 버튼으로 그려졌다 */}
      <button
        type="button"
        onClick={register}
        disabled={state === "busy"}
        className={`rounded-[14px] p-[13px] text-center text-[13px] font-bold disabled:opacity-60 ${className}`}
      >
        {state === "busy" ? "등록 중…" : "오픈 알림 받기"}
      </button>
      <p
        className={`text-center text-[12px] leading-[1.6] ${dark ? "text-ai-muted" : "text-text-3"}`}
      >
        {weeklyAvailable
          ? "월간·연간 결제는 준비 중이에요 — 지금은 플러스 주간권(7일)만 구매할 수 있어요."
          : "결제 수단을 준비하고 있어요 — 아직 결제가 열리지 않았습니다."}
        {state === "error" && " 등록에 실패했어요. 잠시 후 다시 눌러 주세요."}
      </p>
    </>
  );
}
