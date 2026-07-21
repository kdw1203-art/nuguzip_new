"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";

/* 전문가 등록/인증 신청 — POST /api/experts/register → submitExpertApplication
   (expert_verification_requests 적재 · 1차 자동검증). 심사 후 인증되면
   내 매물 등록(중개사 게이트)·크리에이터 노출이 열리는 진입점. */

const TYPES = [
  "공인중개사",
  "세무사",
  "감정평가사",
  "대출상담사",
  "법무사·변호사",
  "기타 전문가",
] as const;

type Phase = "idle" | "sending" | "done";

export function ExpertApplyCta() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expertType, setExpertType] = useState<(typeof TYPES)[number]>("공인중개사");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [bio, setBio] = useState("");
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length < 2) return setError("실명(대표자명)을 입력해 주세요.");
    if (!city.trim()) return setError("활동 지역(시/도)을 입력해 주세요.");
    if (bio.trim().length < 20) return setError("소개는 20자 이상 입력해 주세요.");
    if (!agree) return setError("전문가 운영정책 및 약관에 동의해 주세요.");
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/experts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expertType,
          name: name.trim(),
          city: city.trim(),
          district: district.trim(),
          bio: bio.trim(),
          organization: organization.trim() || null,
          certNumber: certNumber.trim() || null,
          businessRegNo: certNumber.trim() || null,
          specialties: specialties
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
          consent: { terms: true },
        }),
      });
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent("/town/experts")}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "접수에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setPhase("idle");
        return;
      }
      setPhase("done");
    } catch {
      setError("접수에 실패했어요. 네트워크를 확인해 주세요.");
      setPhase("idle");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setPhase("idle");
          setError(null);
        }}
        className="btn-primary btn-cta rounded-xl px-[22px] py-[11px] text-[13px]"
      >
        전문가 인증 신청
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(16,24,40,.4)] backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="전문가 인증 신청"
        >
          <div className="max-h-[90vh] w-full max-w-[460px] overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
            {phase === "done" ? (
              <div className="flex flex-col items-center gap-2.5 py-5 text-center">
                <div className="text-2xl"><Icon name="🛡" size={24} /></div>
                <div className="text-[15px] font-extrabold text-ink">인증 신청이 접수됐어요</div>
                <p className="text-xs leading-[1.7] text-text-2">
                  자격·서류 심사 후 인증됩니다. 인증이 완료되면 상담·리포트 판매와
                  <br />내 매물 등록 권한이 열려요. 진행 상황은 알림으로 안내드려요.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-primary mt-1 rounded-xl px-6 py-2.5 text-[13px]"
                >
                  확인
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-ink">전문가 인증 신청</span>
                  <button
                    type="button"
                    aria-label="닫기"
                    onClick={() => setOpen(false)}
                    className="text-[15px] text-text-3"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-[11px] leading-[1.6] text-text-3">
                  자격을 검증한 뒤 &quot;인증&quot; 배지가 부여됩니다. 인증 후 상담·리포트
                  수익과 매물 등록(중개사)·크리에이터 활동이 열려요.
                </p>

                <div>
                  <div className="mb-1.5 text-[11px] font-bold text-text-2">전문가 유형</div>
                  <div className="flex flex-wrap gap-1.5">
                    {TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setExpertType(t)}
                        className={`chip px-3 py-1.5 text-[12px] font-bold ${
                          expertType === t ? "chip-active" : "border border-line bg-bg text-text-2"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    placeholder="대표자명 (실명)"
                    className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                  />
                  <input
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    maxLength={60}
                    placeholder="상호 (예: 관양부동산)"
                    className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                  />
                </div>

                <input
                  value={certNumber}
                  onChange={(e) => setCertNumber(e.target.value)}
                  maxLength={40}
                  placeholder="중개등록번호 / 자격번호 (예: 제11-XXXX호)"
                  className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                />

                <div className="flex gap-2">
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    maxLength={20}
                    placeholder="활동 시/도 (예: 경기)"
                    className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                  />
                  <input
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    maxLength={40}
                    placeholder="시·군·구 (예: 안양시 동안구)"
                    className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                  />
                </div>

                <input
                  value={specialties}
                  onChange={(e) => setSpecialties(e.target.value)}
                  maxLength={80}
                  placeholder="전문 분야 (쉼표로 구분 · 예: 재건축, 갈아타기)"
                  className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                />

                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="경력·강점을 소개해 주세요 (20자 이상)"
                  className="w-full resize-none rounded-xl border border-line bg-bg p-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                />

                <label className="flex items-start gap-2 text-[12px] leading-[1.5] text-text-2">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>전문가 운영정책 및 자격 검증 절차에 동의합니다. (허위 기재 시 인증이 거부될 수 있어요)</span>
                </label>

                {error && <div className="text-[11px] font-semibold text-danger">{error}</div>}

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={phase === "sending"}
                  className="btn-primary rounded-xl p-3 text-[13px] disabled:opacity-60"
                >
                  {phase === "sending" ? "접수 중…" : "인증 신청하기"}
                </button>
                <p className="text-[10px] leading-[1.5] text-text-3">
                  본인인증·서류 확인 후 심사됩니다 · 개인정보(계좌 등)는 이 단계에서 적지 마세요
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
