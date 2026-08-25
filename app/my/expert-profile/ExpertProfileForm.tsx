"use client";

import { useState } from "react";
import { useToast } from "@/app/components/toast/ToastProvider";

/* 전문가 프로필 수정 폼 — PATCH /api/experts/[id] (소유자·관리자만, 서버가 권한 검사).
   저장 성공 시 서버가 돌려준 정규화 값으로 화면을 맞춘다. */

type ExpertEditable = {
  id: string;
  name: string;
  title: string;
  introduction: string;
  specialties: string[];
  regions: string[];
  experience: string;
  consultationFee: number;
  reportFee: number;
  responseTime: string;
  organization: string | null;
  contactPhone: string | null;
  contactKakao: string | null;
  isVerified: boolean;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="t-sub font-bold text-text-2">
        {label}
        {hint && <span className="ml-1 font-medium text-text-3">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary";

export function ExpertProfileForm({ expert }: { expert: ExpertEditable }) {
  const { showToast } = useToast();
  const [intro, setIntro] = useState(expert.introduction);
  const [specialties, setSpecialties] = useState(expert.specialties.join(", "));
  const [regions, setRegions] = useState(expert.regions.join(", "));
  const [experience, setExperience] = useState(expert.experience);
  const [consultationFee, setConsultationFee] = useState(String(expert.consultationFee || ""));
  const [reportFee, setReportFee] = useState(String(expert.reportFee || ""));
  const [responseTime, setResponseTime] = useState(expert.responseTime);
  const [organization, setOrganization] = useState(expert.organization ?? "");
  const [contactPhone, setContactPhone] = useState(expert.contactPhone ?? "");
  const [contactKakao, setContactKakao] = useState(expert.contactKakao ?? "");
  const [busy, setBusy] = useState(false);

  const splitList = (s: string, max: number) =>
    s
      .split(/[,，]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, max);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/experts/${expert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          introduction: intro.trim().slice(0, 1000),
          specialties: splitList(specialties, 8),
          regions: splitList(regions, 5),
          experience: experience.trim().slice(0, 30),
          consultationFee: Math.max(0, Math.min(10_000_000, Number(consultationFee) || 0)),
          reportFee: Math.max(0, Math.min(10_000_000, Number(reportFee) || 0)),
          responseTime: responseTime.trim().slice(0, 30),
          organization: organization.trim().slice(0, 60) || null,
          contactPhone: contactPhone.trim().slice(0, 20) || null,
          contactKakao: contactKakao.trim().slice(0, 60) || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(data.error ?? "저장에 실패했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      showToast("프로필이 저장됐어요");
    } catch {
      showToast("네트워크 오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-col gap-4 rounded-[20px] p-5 md:p-6">
      <div className="flex items-center justify-between">
        <div className="t-section text-ink">
          {expert.name}
          <span className="ml-1.5 t-sub font-semibold text-text-3">{expert.title}</span>
        </div>
        {expert.isVerified && (
          <span className="rounded-full bg-success-soft px-2.5 py-1 t-caption font-extrabold text-success">
            ✓ 인증 전문가
          </span>
        )}
      </div>

      <Field label="소개" hint="상담자에게 보이는 첫 문단이에요">
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="어떤 분야를 어떻게 도와드릴 수 있는지 적어주세요"
          className={`${inputCls} resize-none leading-[1.6]`}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="전문 분야" hint="쉼표로 구분 · 최대 8개">
          <input
            value={specialties}
            onChange={(e) => setSpecialties(e.target.value)}
            maxLength={200}
            placeholder="예: 재건축, 갭투자, 임대차"
            className={inputCls}
          />
        </Field>
        <Field label="활동 지역" hint="쉼표로 구분 · 최대 5곳">
          <input
            value={regions}
            onChange={(e) => setRegions(e.target.value)}
            maxLength={150}
            placeholder="예: 서울 강남구, 서초구"
            className={inputCls}
          />
        </Field>
        <Field label="경력" hint="예: 8년">
          <input
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            maxLength={30}
            placeholder="예: 8년"
            className={inputCls}
          />
        </Field>
        <Field label="응답 시간 안내" hint="예: 보통 3시간 내">
          <input
            value={responseTime}
            onChange={(e) => setResponseTime(e.target.value)}
            maxLength={30}
            placeholder="예: 보통 3시간 내"
            className={inputCls}
          />
        </Field>
        <Field label="상담료 (원)" hint="0 = 미표기">
          <input
            value={consultationFee}
            onChange={(e) => setConsultationFee(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            maxLength={8}
            placeholder="예: 30000"
            className={inputCls}
          />
        </Field>
        <Field label="리포트료 (원)" hint="0 = 미표기">
          <input
            value={reportFee}
            onChange={(e) => setReportFee(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            maxLength={8}
            placeholder="예: 50000"
            className={inputCls}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-bg p-4">
        <div className="t-sub font-extrabold text-ink">
          상호 · 공개 연락처
          <span className="ml-1 t-sub font-medium text-text-3">
            직접 채운 값만 공개돼요 (비우면 미노출{expert.isVerified ? "" : " · 인증 승인 후 노출"})
          </span>
        </div>
        <Field label="상호 (사무소명)">
          <input
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            maxLength={60}
            placeholder="예: 관양부동산공인중개사사무소"
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="전화번호">
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value.replace(/[^0-9\-+ ]/g, ""))}
              inputMode="tel"
              maxLength={20}
              placeholder="예: 031-123-4567"
              className={inputCls}
            />
          </Field>
          <Field label="카카오톡 채널·오픈채팅 링크">
            <input
              value={contactKakao}
              onChange={(e) => setContactKakao(e.target.value)}
              maxLength={60}
              placeholder="예: https://pf.kakao.com/…"
              className={inputCls}
            />
          </Field>
        </div>
        <p className="t-caption text-text-3">
          플랫폼 밖 선결제 유도는 신고 대상이에요. 연락처는 상담·문의 연결 용도로만
          노출됩니다.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="btn-primary rounded-xl p-3.5 t-body disabled:opacity-60"
      >
        {busy ? "저장 중…" : "프로필 저장"}
      </button>
    </div>
  );
}
