"use client";

/* 협력업체 등록 폼 — POST /api/dev-deals/partner (로그인 필수) */

import { useState } from "react";
import Link from "next/link";
import { PARTNER_TYPES, PARTNER_FIELDS } from "@/lib/dev-deals/types";

export function PartnerForm() {
  const [companyName, setCompanyName] = useState("");
  const [partnerType, setPartnerType] = useState<string>(PARTNER_TYPES[0]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [region, setRegion] = useState("");
  const [intro, setIntro] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [done, setDone] = useState(false);

  function toggleSpecialty(s: string) {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedLogin(false);
    if (companyName.trim().length < 2) {
      setError("회사명을 2자 이상 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/dev-deals/partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          partnerType,
          specialties,
          region: region.trim() || null,
          intro: intro.trim() || null,
          portfolioUrl: portfolioUrl.trim() || null,
          contactPhone: contactPhone.trim() || null,
        }),
      });
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
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
      <div className="rise-in card flex max-w-[640px] flex-col items-start gap-3 p-6">
        <div className="text-[16px] font-extrabold text-ink">협력업체 등록이 완료됐어요</div>
        <p className="text-[13px] leading-[1.7] text-text-2">
          디렉터리에 노출되며, 조건에 맞는 개발물건 매칭·참여 기회를 안내받을 수 있어요.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/dev-deals/partners" className="btn-primary btn-md no-underline">
            협력업체 목록 보기
          </Link>
          <Link href="/dev-deals" className="btn-outline btn-md no-underline">
            개발물건 보기
          </Link>
        </div>
      </div>
    );
  }

  const label = "mb-1.5 block text-[13px] font-bold text-ink";

  return (
    <form onSubmit={onSubmit} className="flex max-w-[680px] flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="companyName">
            회사명 <span className="text-[#d64545]">*</span>
          </label>
          <input
            id="companyName"
            className="input w-full"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="예: (주)한빛종합건설"
            maxLength={120}
            required
          />
        </div>
        <div>
          <label className={label} htmlFor="partnerType">
            협력업체 유형 <span className="text-[#d64545]">*</span>
          </label>
          <select
            id="partnerType"
            className="input w-full"
            value={partnerType}
            onChange={(e) => setPartnerType(e.target.value)}
          >
            {PARTNER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 전문 분야 */}
      <div>
        <span className={label}>전문 분야 (복수 선택)</span>
        <div className="flex flex-wrap gap-1.5">
          {PARTNER_FIELDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSpecialty(s)}
              className={`chip px-4 py-2 text-[13px] ${
                specialties.includes(s)
                  ? "chip-active"
                  : "bg-[rgba(255,255,255,.7)] text-text-2"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 지역 */}
      <div>
        <label className={label} htmlFor="region">
          주요 활동 지역 (선택)
        </label>
        <input
          id="region"
          className="input w-full"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="예: 수도권 / 전국"
          maxLength={60}
        />
      </div>

      {/* 소개 */}
      <div>
        <label className={label} htmlFor="intro">
          회사 소개 (선택)
        </label>
        <textarea
          id="intro"
          className="input min-h-[120px] w-full"
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder="주요 실적, 시공·설계 역량, 참여 희망 사업 규모 등을 적어 주세요."
          maxLength={2000}
        />
      </div>

      {/* 포트폴리오 URL */}
      <div>
        <label className={label} htmlFor="portfolioUrl">
          포트폴리오 URL (선택)
        </label>
        <input
          id="portfolioUrl"
          className="input w-full"
          type="url"
          inputMode="url"
          value={portfolioUrl}
          onChange={(e) => setPortfolioUrl(e.target.value)}
          placeholder="https://..."
          maxLength={500}
        />
      </div>

      {/* 연락처 */}
      <div>
        <label className={label} htmlFor="contactPhone">
          연락처 (선택)
        </label>
        <input
          id="contactPhone"
          className="input w-full"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="예: 010-0000-0000 (일부만 공개 표시됩니다)"
          maxLength={40}
        />
        <p className="mt-1 text-[11px] text-text-3">
          공개 화면에는 가운데를 가린 형태로만 표시됩니다.
        </p>
      </div>

      {needLogin && (
        <div className="rounded-xl bg-[rgba(214,69,69,.08)] px-4 py-3 text-[13px] leading-[1.7] text-[#d64545]">
          등록은 로그인 후 이용할 수 있어요.{" "}
          <Link
            href="/login?callbackUrl=/dev-deals/partners/new"
            className="font-bold underline"
          >
            로그인 후 등록
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-[rgba(214,69,69,.08)] px-4 py-3 text-[13px] font-bold text-[#d64545]">
          {error}
        </div>
      )}

      <button type="submit" className="btn-primary btn-lg" disabled={submitting}>
        {submitting ? "등록 중…" : "협력업체 등록"}
      </button>
    </form>
  );
}
