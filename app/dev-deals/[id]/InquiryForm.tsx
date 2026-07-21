"use client";

/* 참여 문의 폼 — POST /api/dev-deals/inquiry (로그인 필수) */

import { useState } from "react";
import Link from "next/link";
import { PARTNER_TYPES } from "@/lib/dev-deals/types";

export function InquiryForm({
  dealId,
  isSample,
}: {
  dealId: string;
  isSample: boolean;
}) {
  const [fromCompany, setFromCompany] = useState("");
  const [partnerType, setPartnerType] = useState<string>("");
  const [message, setMessage] = useState("");
  const [proposedTerms, setProposedTerms] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [done, setDone] = useState(false);

  const callbackUrl = `/dev-deals/${dealId}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedLogin(false);
    if (message.trim().length < 5) {
      setError("문의 내용을 5자 이상 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/dev-deals/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          fromCompany: fromCompany.trim() || null,
          partnerType: partnerType || null,
          message: message.trim(),
          proposedTerms: proposedTerms.trim() || null,
        }),
      });
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "문의 접수에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setDone(true);
    } catch {
      setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-5">
        <div className="text-[15px] font-extrabold text-ink">참여 문의가 접수됐어요</div>
        <p className="text-[13px] leading-[1.7] text-text-2">
          등록자에게 문의가 전달됩니다. 이후 계약·정산 조건은 <b>당사자 간에 직접</b>{" "}
          협의·확인해 주세요. 누구집은 소개·매칭만 담당합니다.
        </p>
      </div>
    );
  }

  const label = "mb-1.5 block text-[13px] font-bold text-ink";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {isSample && (
        <div
          className="rounded-xl px-4 py-2.5 text-[12px] leading-[1.6]"
          style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
        >
          예시 데이터입니다. 실제 문의는 접수되지만 응답을 받지 못할 수 있어요.
        </div>
      )}

      <div>
        <label className={label} htmlFor="fromCompany">
          회사명
        </label>
        <input
          id="fromCompany"
          className="input w-full"
          value={fromCompany}
          onChange={(e) => setFromCompany(e.target.value)}
          placeholder="예: (주)한빛종합건설"
          maxLength={120}
        />
      </div>

      <div>
        <label className={label} htmlFor="partnerType">
          협력 유형
        </label>
        <select
          id="partnerType"
          className="input w-full"
          value={partnerType}
          onChange={(e) => setPartnerType(e.target.value)}
        >
          <option value="">선택 안 함</option>
          {PARTNER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={label} htmlFor="message">
          문의 내용 <span className="text-[#d64545]">*</span>
        </label>
        <textarea
          id="message"
          className="input min-h-[110px] w-full"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="참여 관심 분야, 회사 소개, 문의 사항 등을 적어 주세요."
          maxLength={3000}
          required
        />
      </div>

      <div>
        <label className={label} htmlFor="proposedTerms">
          제안 조건 (선택)
        </label>
        <textarea
          id="proposedTerms"
          className="input min-h-[80px] w-full"
          value={proposedTerms}
          onChange={(e) => setProposedTerms(e.target.value)}
          placeholder="예: 시공 도급 방식, 예상 공사비 수준, 참여 조건 등"
          maxLength={2000}
        />
      </div>

      {needLogin && (
        <div className="rounded-xl bg-[rgba(214,69,69,.08)] px-4 py-3 text-[13px] leading-[1.7] text-[#d64545]">
          문의는 로그인 후 이용할 수 있어요.{" "}
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-bold underline"
          >
            로그인 후 문의
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-[rgba(214,69,69,.08)] px-4 py-3 text-[13px] font-bold text-[#d64545]">
          {error}
        </div>
      )}

      <button type="submit" className="btn-primary btn-md" disabled={submitting}>
        {submitting ? "접수 중…" : "참여 문의 보내기"}
      </button>
      <p className="text-[11px] leading-[1.6] text-text-3">
        소개·문의는 무료입니다. 중개 수수료는 매칭 성사 시에만, 사업 규모에 따라 협의됩니다.
      </p>
    </form>
  );
}
