"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";
import { useMoment } from "@/app/components/motion/MomentProvider";
import { EXPERT_TYPES, SPECIALTIES, type ExpertTypeId } from "@/lib/experts/taxonomy";
import { CITY_OPTIONS, DISTRICTS } from "@/lib/regions";

/* 전문가 등록/인증 신청 (953 개편) — POST /api/experts/register → submitExpertApplication
   (expert_verification_requests 적재 · 1차 자동검증). 심사 후 인증되면 상담 수신·
   견적 제안·내 매물 등록(중개사)·크리에이터 노출이 열리는 진입점.

   953 에서 바뀐 것
    · 유형·전문 분야를 분류 체계(lib/experts/taxonomy.ts)에서 읽는다 — 자유 입력이던
      전문 분야가 목록 필터·견적 카테고리와 같은 라벨로 저장된다.
    · 유형을 고르면 그 자격의 공개 조회처가 보인다 — 심사자가 무엇을 확인할지 신청자도 안다.
    · 활동 지역은 시/도 선택 + 시·군·구 선택(자유 입력은 기타 시/도만).
   정책상 받지 않는 유형은 분류 체계에 없다(법률 서비스 유료 입점 불가). */

type Phase = "idle" | "sending" | "done";

/* 등록번호 간단 형식 검증 — "제11-1234호", "11-1234", "2023-서울-1234" 류 */
const CERT_NUMBER_RE = /^제?[0-9A-Za-z가-힣]{1,12}(-[0-9A-Za-z가-힣]{1,12}){1,3}호?$/;

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const inputCls =
  "w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 t-sub font-bold text-text-2">
      {children}
      {hint && <span className="ml-1 font-normal text-text-3">{hint}</span>}
    </div>
  );
}

export function ExpertApplyCta({
  className = "btn-primary btn-cta rounded-xl px-5 py-2.5 t-body",
  label = "전문가 인증 신청",
}: {
  className?: string;
  label?: string;
}) {
  const { promptSignup } = useSoftSignup();
  const { showMoment } = useMoment();
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState<ExpertTypeId>("broker");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [city, setCity] = useState<string>("서울특별시");
  const [district, setDistrict] = useState("");
  const [customCity, setCustomCity] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [extraSpecialty, setExtraSpecialty] = useState("");
  const [yearsExp, setYearsExp] = useState("");
  const [bio, setBio] = useState("");
  const [documentUrls, setDocumentUrls] = useState<string[]>([""]);
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const type = EXPERT_TYPES.find((t) => t.id === typeId)!;
  const suggested = useMemo(
    () => [...SPECIALTIES].sort((a, b) => Number(b.types.includes(typeId)) - Number(a.types.includes(typeId))),
    [typeId],
  );
  const districts = (DISTRICTS as Record<string, string[]>)[city] ?? [];
  const isOtherCity = city === "기타(전국)";

  const toggleSpecialty = (label: string) =>
    setSpecialties((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : prev.length >= 6 ? prev : [...prev, label]));

  const submit = async () => {
    const cityValue = isOtherCity ? customCity.trim() : city;
    if (name.trim().length < 2) return setError("실명(대표자명)을 입력해 주세요.");
    if (!cityValue) return setError("활동 지역(시/도)을 입력해 주세요.");
    if (bio.trim().length < 20) return setError("소개는 20자 이상 입력해 주세요.");
    const cert = certNumber.trim().replace(/\s+/g, "");
    if (cert && !CERT_NUMBER_RE.test(cert)) {
      return setError("등록번호 형식을 확인해 주세요. (예: 제11-1234호)");
    }
    if (type.source && !cert) {
      return setError(`${type.label}는 ${type.source.label} 조회를 위해 등록·자격번호가 필요해요.`);
    }
    const docUrls = documentUrls.map((u) => u.trim()).filter(Boolean);
    if (docUrls.some((u) => !isValidHttpUrl(u))) {
      return setError("증빙 URL은 http(s)로 시작하는 주소여야 해요.");
    }
    if (!agree) return setError("전문가 운영정책 및 약관에 동의해 주세요.");
    setPhase("sending");
    setError(null);
    const extra = extraSpecialty
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await fetch("/api/experts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expertType: type.label,
          name: name.trim(),
          city: cityValue,
          district: district.trim(),
          bio: bio.trim(),
          organization: organization.trim() || null,
          certNumber: cert || null,
          businessRegNo: cert || null,
          specialties: [...specialties, ...extra].slice(0, 8),
          yearsExp: Math.max(0, Math.min(60, Number(yearsExp) || 0)),
          documentUrls: docUrls,
          consent: { terms: true },
        }),
      });
      if (res.status === 401) {
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
        className={className}
      >
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} label="전문가 인증 신청" maxWidth={520} dismissOnBackdrop={phase !== "sending"}>
        {phase === "done" ? (
          <div className="flex flex-col items-center gap-2.5 py-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-navy text-on-dark">
              <Icon name="shield" size={24} />
            </div>
            <div className="t-section text-ink">인증 신청이 접수됐어요</div>
            <p className="t-sub text-text-2">
              1차 자동 검증 → 서류 확인 → {type.source ? `${type.source.label} 조회` : "인터뷰"} 순서로 심사돼요.
              <br />
              인증되면 상담 수신·견적 제안{type.extraScope ? `·${type.extraScope.split(" +")[0]}` : ""}이 열립니다. 진행 상황은 알림으로 안내드려요.
            </p>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-primary rounded-xl px-6 py-2.5 t-body">
                확인
              </button>
              <Link href="/my/consultations" className="btn-soft rounded-xl px-5 py-2.5 t-body no-underline">
                상담함 보기
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <ModalHeader title="전문가 인증 신청" onClose={() => setOpen(false)} />
            <p className="t-sub text-text-3">
              자격을 검증한 뒤 &quot;인증&quot; 배지가 부여됩니다. 접수 → 1차 자동 검증(24시간) → 서류·출처 확인 → 승인.
            </p>

            {/* 유형 */}
            <div>
              <Label>전문가 유형</Label>
              <div className="flex flex-wrap gap-1.5">
                {EXPERT_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTypeId(t.id)}
                    aria-pressed={typeId === t.id}
                    className={`chip px-3 py-1.5 t-sub font-bold ${typeId === t.id ? "chip-active" : "border border-line bg-bg text-text-2"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 t-caption text-text-3">
                {type.desc}
                {type.source
                  ? ` · 자격 확인: ${type.source.label} (${type.source.searchHint})`
                  : " · 서류·인터뷰 심사로 확인해요"}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label>대표자명 (실명)</Label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="홍길동" className={inputCls} />
              </div>
              <div>
                <Label hint="(선택)">상호 · 사무소명</Label>
                <input value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={60} placeholder="예: 관양부동산" className={inputCls} />
              </div>
              <div>
                <Label hint={type.source ? "" : "(선택)"}>등록번호 · 자격번호</Label>
                <input value={certNumber} onChange={(e) => setCertNumber(e.target.value)} maxLength={40} placeholder="예: 제11-1234호" className={inputCls} />
              </div>
              <div>
                <Label>경력 (년)</Label>
                <input
                  value={yearsExp}
                  onChange={(e) => setYearsExp(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="예: 8"
                  aria-label="경력 (년)"
                  className={inputCls}
                />
              </div>
            </div>

            {/* 활동 지역 */}
            <div>
              <Label>주 활동 지역</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    setDistrict("");
                  }}
                  aria-label="시/도"
                  className={inputCls}
                >
                  {CITY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {isOtherCity ? (
                  <input value={customCity} onChange={(e) => setCustomCity(e.target.value)} maxLength={20} placeholder="시/도 (예: 대전광역시)" className={inputCls} />
                ) : (
                  <select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="시·군·구" className={inputCls}>
                    <option value="">시·군·구 (선택)</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <p className="mt-1.5 t-caption text-text-3">추가 지역은 인증 후 프로필 관리에서 최대 5곳까지 넣을 수 있어요.</p>
            </div>

            {/* 전문 분야 */}
            <div>
              <Label hint="최대 6개">전문 분야</Label>
              <div className="flex flex-wrap gap-1.5">
                {suggested.map((s) => {
                  const on = specialties.includes(s.label);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSpecialty(s.label)}
                      aria-pressed={on}
                      className={`${on ? "chip-check-active" : "chip-check"} px-2.5 py-1.5 t-sub`}
                    >
                      {on ? "✓ " : ""}
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <input
                value={extraSpecialty}
                onChange={(e) => setExtraSpecialty(e.target.value)}
                maxLength={60}
                placeholder="그 밖의 분야 (쉼표로 구분 · 예: 상가, 토지)"
                className={`${inputCls} mt-2`}
              />
            </div>

            {/* 증빙 URL */}
            <div className="flex flex-col gap-1.5">
              <Label hint="(선택 · 자격증 사본, 등록 조회 링크 등)">증빙 URL</Label>
              {documentUrls.map((u, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={u}
                    onChange={(e) => setDocumentUrls((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    maxLength={500}
                    inputMode="url"
                    placeholder="https://…"
                    className={inputCls}
                  />
                  {documentUrls.length > 1 && (
                    <button
                      type="button"
                      aria-label="증빙 URL 삭제"
                      onClick={() => setDocumentUrls((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 t-body text-text-3"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {documentUrls.length < 5 && (
                <button type="button" onClick={() => setDocumentUrls((prev) => [...prev, ""])} className="self-start t-sub font-bold text-primary">
                  + 증빙 URL 추가
                </button>
              )}
            </div>

            <div>
              <Label hint="20자 이상 · 프로필 소개로 복사돼요">소개</Label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="어떤 질문에 강한지, 어떻게 답하는지 적어 주세요. 예: 동안구 구축 갈아타기 순서를 실거래·대출 한도와 함께 정리해 드립니다."
                className={`${inputCls} resize-none`}
              />
            </div>

            <label className="flex items-start gap-2 t-sub text-text-2">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
              <span>
                <Link href="/legal/expert" className="font-bold text-primary" target="_blank">
                  전문가 운영정책
                </Link>{" "}
                및 자격 검증 절차에 동의합니다. 허위 기재·플랫폼 밖 결제 유도 시 인증이 거부·정지될 수 있어요.
              </span>
            </label>

            {error && <div className="t-sub font-semibold text-danger">{error}</div>}

            <button type="button" onClick={() => void submit()} disabled={phase === "sending"} className="btn-primary rounded-xl p-3 t-body disabled:opacity-60">
              {phase === "sending" ? "접수 중…" : "인증 신청하기"}
            </button>
            <p className="t-caption text-text-3">본인인증·서류 확인 후 심사됩니다 · 개인정보(계좌 등)는 이 단계에서 적지 마세요</p>
          </div>
        )}
      </Modal>
    </>
  );
}
