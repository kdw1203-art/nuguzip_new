"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * 해지 요청 — 즉시 해지 API가 없어 고객센터 접수와 동일한 경로로 구조화 요청.
 *
 * [966] `window.confirm` 을 버렸다 — 브라우저 모달은 페이지 이벤트를 통째로 막고
 * 문구도 다듬을 수 없다(PlanCheckoutButton 이 같은 이유로 2단계 인라인 확인을
 * 쓴다). 확인 문구가 "다음 결제일은 시스템상 미저장" 이라는 내부 사정을 사용자에게
 * 말하던 것도 걷어냈다 — 대신 **언제까지 쓸 수 있는지**(만료일)를 말한다.
 * 이탈 사유는 선택 입력으로 받아 티켓에 붙인다(원인을 세는 유일한 기록).
 */
const REASONS = [
  { id: "price", label: "가격이 부담돼요" },
  { id: "usage", label: "생각보다 안 쓰게 됐어요" },
  { id: "feature", label: "필요한 기능이 없어요" },
  { id: "done", label: "집을 구했어요(목적 달성)" },
  { id: "other", label: "기타" },
] as const;

export function CancelRequestButton({
  currentPlan,
  expiresAtLabel = null,
}: {
  currentPlan: string;
  /** "10월 12일" 처럼 표기된 만료일 — 없으면 날짜를 말하지 않는다 */
  expiresAtLabel?: string | null;
}) {
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [reason, setReason] = useState<(typeof REASONS)[number]["id"] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const reasonLabel = REASONS.find((r) => r.id === reason)?.label ?? "(선택 안 함)";
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "결제·환불",
          subject: `구독 해지 요청 (${currentPlan})`,
          message:
            `현재 플랜: ${currentPlan}\n요청: 구독 해지\n경로: /subscription BillingPanel\n` +
            `이용 만료: ${expiresAtLabel ?? "미상"}\n사유: ${reasonLabel}${note.trim() ? `\n메모: ${note.trim().slice(0, 500)}` : ""}\n\n` +
            "해지·환불은 약관 제8조에 따라 처리해 주세요.",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "접수에 실패했습니다.");
        return;
      }
      setDone(true);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="t-sub font-semibold text-primary">
        해지 요청이 접수됐어요. 영업일 1일 이내 알림함·이메일로 접수 확인을 보내 드려요.{" "}
        <Link href="/notifications" className="underline">
          알림 보기
        </Link>
      </p>
    );
  }

  if (step === "confirm") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-3.5 py-3">
        <p className="t-sub text-text-1">
          {expiresAtLabel ? (
            <>
              이용권은 <b>{expiresAtLabel}까지</b> 그대로 쓸 수 있고, 그 뒤 무료 플랜으로 전환돼요.
              결제 후 7일 이내라면 환불(청약철회) 대상인지도 함께 확인해 드려요.
            </>
          ) : (
            <>접수하면 약관 제8조에 따라 처리하고, 영업일 1일 이내 확인 안내를 보내 드려요.</>
          )}
        </p>
        <fieldset className="flex flex-col gap-1">
          <legend className="t-caption font-bold text-text-3">떠나는 이유 (선택)</legend>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setReason(r.id)}
                aria-pressed={reason === r.id}
                className={`chip px-2.5 py-1 t-caption font-bold ${reason === r.id ? "chip-active" : "border border-line bg-surface text-text-2"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </fieldset>
        {reason === "other" && (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="어떤 점이 아쉬웠는지 알려 주시면 개선에 참고할게요"
            className="rounded-[8px] border border-line bg-surface px-3 py-2 t-sub text-ink outline-none focus:border-primary"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="btn-soft rounded-[10px] px-3.5 py-2 t-sub font-bold text-danger disabled:opacity-50"
          >
            {busy ? "접수 중…" : "해지 요청 접수"}
          </button>
          <button
            type="button"
            onClick={() => setStep("idle")}
            disabled={busy}
            className="btn-soft rounded-[10px] px-3.5 py-2 t-sub font-bold"
          >
            유지하기
          </button>
        </div>
        {error && (
          <p role="alert" className="t-sub font-semibold text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setStep("confirm")}
      disabled={currentPlan === "free"}
      className="btn-soft w-fit rounded-[10px] px-3.5 py-2 t-sub font-bold disabled:opacity-50"
    >
      해지 요청하기
    </button>
  );
}
