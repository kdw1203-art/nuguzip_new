"use client";

/* 중개사 제휴 신청 폼 — POST /api/partners (3회/시간) */

import { useState } from "react";
import { DISTRICTS } from "@/lib/regions";

export function PartnerForm() {
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const seoulGus = DISTRICTS["서울특별시"];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, name, licenseNo, phone, email, region, message }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "접수에 실패했어요. 잠시 후 다시 시도해 주세요.");
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
      <div className="card card-pad-sm flex flex-col items-start gap-2 py-8">
        <div className="text-[16px] font-extrabold text-ink">제휴 신청이 접수됐어요</div>
        <p className="text-[13px] leading-[1.7] text-text-2">
          <b>검토 후 연락드립니다.</b> 남겨주신 연락처(이메일·전화)로 영업일 기준
          2~3일 내 안내드려요.
        </p>
      </div>
    );
  }

  const label = "mb-1.5 block text-[13px] font-bold text-ink";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="company">
            상호(중개사무소명) <span className="text-[#d64545]">*</span>
          </label>
          <input
            id="company"
            className="input w-full"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="예: OO공인중개사사무소"
            maxLength={80}
            required
          />
        </div>
        <div>
          <label className={label} htmlFor="name">
            대표자명 <span className="text-[#d64545]">*</span>
          </label>
          <input
            id="name"
            className="input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="licenseNo">
          중개사무소 등록번호 <span className="text-[#d64545]">*</span>
        </label>
        <input
          id="licenseNo"
          className="input w-full"
          value={licenseNo}
          onChange={(e) => setLicenseNo(e.target.value)}
          placeholder="예: 11680-2024-00000"
          maxLength={60}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="phone">
            연락처(전화)
          </label>
          <input
            id="phone"
            className="input w-full"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="예: 010-0000-0000"
            maxLength={40}
          />
        </div>
        <div>
          <label className={label} htmlFor="email">
            이메일 <span className="text-[#d64545]">*</span>
          </label>
          <input
            id="email"
            className="input w-full"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="회신받을 이메일"
            maxLength={120}
            required
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="region">
          주요 활동 지역
        </label>
        <select
          id="region"
          className="input w-full"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="">선택 안 함</option>
          {seoulGus.map((g) => (
            <option key={g} value={`서울 ${g}`}>
              서울 {g}
            </option>
          ))}
          <option value="서울 외 지역">서울 외 지역</option>
        </select>
      </div>

      <div>
        <label className={label} htmlFor="message">
          문의 내용
        </label>
        <textarea
          id="message"
          className="input min-h-[100px] w-full"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="보유 매물 수, 주력 단지 등 자유롭게 남겨 주세요."
          maxLength={1000}
        />
      </div>

      {error && (
        <div className="rounded-xl bg-[rgba(214,69,69,.08)] px-4 py-3 text-[13px] font-bold text-[#d64545]">
          {error}
        </div>
      )}

      <button type="submit" className="btn-primary btn-lg" disabled={submitting}>
        {submitting ? "접수 중…" : "제휴 신청하기"}
      </button>
    </form>
  );
}
