"use client";

import { useState } from "react";
import { Icon } from "@/app/components/Icon";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";
import { useMoment } from "@/app/components/motion/MomentProvider";

/* 전문가 등록/인증 신청 — POST /api/experts/register → submitExpertApplication
   (expert_verification_requests 적재 · 1차 자동검증). 심사 후 인증되면
   내 매물 등록(중개사 게이트)·크리에이터 노출이 열리는 진입점. */

/* "법무사·변호사"는 뺐다 — 토스페이먼츠 심사 정책상 법률 서비스(변호사·법무사
   상담) 유료 입점이 불가하다(계약 담당자 회신). 법률 자문을 전문가 상담 상품으로
   받지 않으므로 신청 유형에서도 제외한다. */
const TYPES = [
  "공인중개사",
  "세무사",
  "감정평가사",
  "대출상담사",
  "기타 전문가",
] as const;

type Phase = "idle" | "sending" | "done";

/* 등록번호 간단 형식 검증 — "제11-1234호", "11-1234", "2023-서울-1234" 류.
   숫자·한글 토큰이 대시로 1회 이상 연결된 형태만 통과시킨다(공백 무시). */
const CERT_NUMBER_RE = /^제?[0-9A-Za-z가-힣]{1,12}(-[0-9A-Za-z가-힣]{1,12}){1,3}호?$/;

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function ExpertApplyCta() {
  const { promptSignup } = useSoftSignup();
  const { showMoment } = useMoment();
  const [open, setOpen] = useState(false);
  const [expertType, setExpertType] = useState<(typeof TYPES)[number]>("공인중개사");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [yearsExp, setYearsExp] = useState("");
  const [bio, setBio] = useState("");
  const [documentUrls, setDocumentUrls] = useState<string[]>([""]);
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length < 2) return setError("실명(대표자명)을 입력해 주세요.");
    if (!city.trim()) return setError("활동 지역(시/도)을 입력해 주세요.");
    if (bio.trim().length < 20) return setError("소개는 20자 이상 입력해 주세요.");
    const cert = certNumber.trim().replace(/\s+/g, "");
    if (cert && !CERT_NUMBER_RE.test(cert)) {
      return setError("등록번호 형식을 확인해 주세요. (예: 제11-1234호)");
    }
    const docUrls = documentUrls.map((u) => u.trim()).filter(Boolean);
    if (docUrls.some((u) => !isValidHttpUrl(u))) {
      return setError("증빙 URL은 http(s)로 시작하는 주소여야 해요.");
    }
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
          yearsExp: Math.max(0, Math.min(60, Number(yearsExp) || 0)),
          documentUrls: docUrls,
          consent: { terms: true },
        }),
      });
      if (res.status === 401) {
        // 프롬프트를 닫으면 입력하던 폼이 그대로 남는다 → phase 를 되돌려야 버튼이 다시 눌린다.
        setPhase("idle");
        promptSignup({
          action: "expert_register",
          title: "전문가 인증을 접수할까요?",
          benefit:
            "인증 신청은 계정에 연결해서 접수해요. 1차 자동 검증 결과와 이후 심사 안내를 내 알림함으로 받아보실 수 있습니다.",
          callbackUrl: "/town/experts",
        });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "접수에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setPhase("idle");
        return;
      }
      setPhase("done");
      /* "접수"까지가 사실이다. 인증됐다고 쓰면 심사 전에 통과한 것으로 읽힌다. */
      showMoment({
        title: "인증 신청이 접수됐어요",
        subtitle: "1차 자동 검증 결과를 알림으로 보내드릴게요",
      });
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
        className="btn-primary btn-cta rounded-xl px-[22px] py-[11px] t-body"
      >
        전문가 인증 신청
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        label="전문가 인증 신청"
        dismissOnBackdrop={phase !== "sending"}
      >
        {phase === "done" ? (
          <div className="flex flex-col items-center gap-2.5 py-5 text-center">
            {/* 예전엔 name="🛡" 였다 — Icon 은 이모지를 키로 받지 않아 아무것도
                그려지지 않았다. 실제 아이콘 키(shield)로 고친다. */}
            <Icon name="shield" size={26} className="text-primary" />
            <div className="t-section text-ink">인증 신청이 접수됐어요</div>
            <p className="text-xs leading-[1.7] text-text-2">
              자격·서류 심사 후 인증됩니다. 인증이 완료되면 상담·리포트 판매와
              <br />내 매물 등록 권한이 열려요. 진행 상황은 알림으로 안내드려요.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-primary mt-1 rounded-xl px-6 py-2.5 t-body"
            >
              확인
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ModalHeader title="전문가 인증 신청" onClose={() => setOpen(false)} />
            <p className="t-sub text-text-3">
              자격을 검증한 뒤 &quot;인증&quot; 배지가 부여됩니다. 인증 후 상담·리포트
              수익과 매물 등록(중개사)·크리에이터 활동이 열려요.
            </p>

            <div>
              <div className="mb-1.5 t-sub font-bold text-text-2">전문가 유형</div>
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
                className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
              />
              <input
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                maxLength={60}
                placeholder="상호 (예: 관양부동산)"
                className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
              />
            </div>

            <input
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              maxLength={40}
              placeholder="중개등록번호 / 자격번호 (예: 제11-1234호)"
              className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
            />

            {/* 경력(년) — 예전엔 안 물어봐서 프로필 '경력' 이 항상 비었다 */}
            <input
              value={yearsExp}
              onChange={(e) => setYearsExp(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              maxLength={2}
              placeholder="경력 (년 · 예: 8)"
              aria-label="경력 (년)"
              className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
            />

            {/* 증빙 URL — 자격증·등록증 사본, 사무소 등록 조회 링크 등. 심사 자료로 실전송된다. */}
            <div className="flex flex-col gap-1.5">
              <div className="t-sub font-bold text-text-2">
                증빙 URL <span className="font-normal text-text-3">(선택 · 자격증 사본, 등록 조회 링크 등)</span>
              </div>
              {documentUrls.map((u, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={u}
                    onChange={(e) =>
                      setDocumentUrls((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                    }
                    maxLength={500}
                    inputMode="url"
                    placeholder="https://…"
                    className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
                  />
                  {documentUrls.length > 1 && (
                    <button
                      type="button"
                      aria-label="증빙 URL 삭제"
                      onClick={() =>
                        setDocumentUrls((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="shrink-0 t-body text-text-3"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {documentUrls.length < 5 && (
                <button
                  type="button"
                  onClick={() => setDocumentUrls((prev) => [...prev, ""])}
                  className="self-start t-sub font-bold text-primary"
                >
                  + 증빙 URL 추가
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={20}
                placeholder="활동 시/도 (예: 경기)"
                className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
              />
              <input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                maxLength={40}
                placeholder="시·군·구 (예: 안양시 동안구)"
                className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
              />
            </div>

            <input
              value={specialties}
              onChange={(e) => setSpecialties(e.target.value)}
              maxLength={80}
              placeholder="전문 분야 (쉼표로 구분 · 예: 재건축, 갈아타기)"
              className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
            />

            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="경력·강점을 소개해 주세요 (20자 이상)"
              className="w-full resize-none rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
            />

            <label className="flex items-start gap-2 t-sub text-text-2">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <span>전문가 운영정책 및 자격 검증 절차에 동의합니다. (허위 기재 시 인증이 거부될 수 있어요)</span>
            </label>

            {error && <div className="t-sub font-semibold text-danger">{error}</div>}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={phase === "sending"}
              className="btn-primary rounded-xl p-3 t-body disabled:opacity-60"
            >
              {phase === "sending" ? "접수 중…" : "인증 신청하기"}
            </button>
            <p className="t-caption text-text-3">
              본인인증·서류 확인 후 심사됩니다 · 개인정보(계좌 등)는 이 단계에서 적지 마세요
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
