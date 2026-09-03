"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/app/components/toast/ToastProvider";
import { Icon } from "@/app/components/Icon";
import { RESPONSE_TIME_OPTIONS, SPECIALTIES } from "@/lib/experts/taxonomy";
import { CITY_OPTIONS, DISTRICTS } from "@/lib/regions";

/* 전문가 프로필 수정 폼 (953 개편) — PATCH /api/experts/[id] (소유자·관리자만).
   953 에서 바뀐 것
    · 전문 분야: 분류 체계 칩(다중 선택) + 자유 입력 — 목록 필터와 같은 라벨로 저장.
    · 활동 지역: 시/도·시·군·구 선택으로 추가(최대 5곳).
    · 응답 시간 안내: 선택지(실측 응답 시간이 쌓이면 상세 페이지는 실측을 우선 표시).
    · 프로필 완성도 미터 — 무엇을 더 채우면 노출·신청이 늘어나는지 보여 준다.
   서버가 값 검증(lib/experts/profile-input.ts)을 하므로 폼은 UX 만 맡는다. */

type ExpertEditable = {
  id: string;
  name: string;
  title: string;
  category: string;
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
  reviews: number;
  rating: number;
  consultations: number;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
  "w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary";

const KNOWN = new Set(SPECIALTIES.map((s) => s.label));

export function ExpertProfileForm({ expert }: { expert: ExpertEditable }) {
  const { showToast } = useToast();
  const [intro, setIntro] = useState(expert.introduction);
  const [specialties, setSpecialties] = useState<string[]>(expert.specialties);
  const [extra, setExtra] = useState("");
  const [regions, setRegions] = useState<string[]>(expert.regions);
  const [city, setCity] = useState<string>("서울특별시");
  const [district, setDistrict] = useState("");
  const [experience, setExperience] = useState(expert.experience);
  const [consultationFee, setConsultationFee] = useState(String(expert.consultationFee || ""));
  const [reportFee, setReportFee] = useState(String(expert.reportFee || ""));
  const [responseTime, setResponseTime] = useState(expert.responseTime);
  const [organization, setOrganization] = useState(expert.organization ?? "");
  const [contactPhone, setContactPhone] = useState(expert.contactPhone ?? "");
  const [contactKakao, setContactKakao] = useState(expert.contactKakao ?? "");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const mark = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  const districts = (DISTRICTS as Record<string, string[]>)[city] ?? [];
  const addRegion = () => {
    const label = city === "기타(전국)" ? "전국" : district ? `${city.replace(/특별시|광역시|도$/g, "")} ${district}` : city;
    if (!label || regions.includes(label) || regions.length >= 5) return;
    mark(setRegions)([...regions, label]);
  };
  const toggleSpecialty = (label: string) =>
    mark(setSpecialties)(
      specialties.includes(label) ? specialties.filter((x) => x !== label) : specialties.length >= 8 ? specialties : [...specialties, label],
    );
  const customSpecialties = specialties.filter((s) => !KNOWN.has(s));

  const completeness = useMemo(() => {
    const checks: Array<{ ok: boolean; label: string }> = [
      { ok: intro.trim().length >= 60, label: "소개 60자 이상" },
      { ok: specialties.length >= 2, label: "전문 분야 2개 이상" },
      { ok: regions.length >= 1, label: "활동 지역 1곳 이상" },
      { ok: Boolean(experience.trim()), label: "경력" },
      { ok: Boolean(responseTime.trim()), label: "응답 시간 안내" },
      { ok: Boolean(organization.trim()), label: "상호" },
      { ok: Boolean(contactPhone.trim() || contactKakao.trim()), label: "연락처 1개" },
    ];
    const done = checks.filter((c) => c.ok).length;
    return { pct: Math.round((done / checks.length) * 100), missing: checks.filter((c) => !c.ok).map((c) => c.label) };
  }, [intro, specialties, regions, experience, responseTime, organization, contactPhone, contactKakao]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const extraList = extra
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter(Boolean);
      const res = await fetch(`/api/experts/${expert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          introduction: intro.trim().slice(0, 1000),
          specialties: [...specialties, ...extraList].slice(0, 8),
          regions: regions.slice(0, 5),
          experience: experience.trim().slice(0, 30),
          consultationFee: Math.max(0, Math.min(10_000_000, Number(consultationFee) || 0)),
          reportFee: Math.max(0, Math.min(10_000_000, Number(reportFee) || 0)),
          responseTime: responseTime.trim().slice(0, 30),
          organization: organization.trim().slice(0, 60) || null,
          contactPhone: contactPhone.trim().slice(0, 20) || null,
          contactKakao: contactKakao.trim().slice(0, 120) || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; expert?: { specialties?: string[] } };
      if (!res.ok) {
        showToast(data.error ?? "저장에 실패했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      if (data.expert?.specialties) {
        setSpecialties(data.expert.specialties);
        setExtra("");
      }
      setDirty(false);
      showToast("프로필이 저장됐어요 — 목록·상세에 바로 반영돼요");
    } catch {
      showToast("네트워크 오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 머리: 이름·자격·인증·미리보기 */}
      <div className="brand-navy-card flex flex-col gap-3 rounded-[18px] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-hanji t-section text-brand-hanji-ink" aria-hidden="true">
              {Array.from(expert.name.trim())[0] ?? "전"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="t-section text-on-dark">{expert.name}</span>
                {expert.isVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-brand-hanji chip-pad t-caption font-extrabold text-brand-hanji-ink">
                    <Icon name="shield" size={11} /> 인증
                  </span>
                ) : (
                  <span className="rounded-md border border-on-dark-faint chip-pad t-caption font-semibold text-on-dark-muted">심사 중</span>
                )}
              </div>
              <div className="t-sub text-on-dark-muted">
                {expert.category}
                {expert.title && expert.title !== expert.category ? ` · ${expert.title}` : ""}
              </div>
            </div>
          </div>
          <Link href={`/town/experts/${expert.id}`} className="brand-photo-chip rounded-lg px-3 py-1.5 t-sub font-bold no-underline">
            공개 프로필 보기 ↗
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-on-dark-faint pt-3">
          <div>
            <div className="t-section t-num text-on-dark">{expert.consultations}</div>
            <div className="t-caption text-on-dark-muted">답변 완료</div>
          </div>
          <div>
            <div className="t-section t-num text-on-dark">{expert.reviews > 0 ? expert.rating.toFixed(1) : "—"}</div>
            <div className="t-caption text-on-dark-muted">{expert.reviews > 0 ? `후기 ${expert.reviews}건` : "후기 없음"}</div>
          </div>
          <div>
            <div className="t-section t-num text-on-dark">{completeness.pct}%</div>
            <div className="t-caption text-on-dark-muted">프로필 완성도</div>
          </div>
        </div>
        {completeness.missing.length > 0 && (
          <p className="t-caption text-on-dark-muted">
            더 채우면 좋아요: {completeness.missing.join(" · ")}
          </p>
        )}
      </div>

      <div className="card flex flex-col gap-4 rounded-[18px] p-5 md:p-6">
        <Field label="소개" hint="상담자에게 보이는 첫 문단 · 60자 이상 권장">
          <textarea
            value={intro}
            onChange={(e) => mark(setIntro)(e.target.value)}
            rows={5}
            maxLength={1000}
            placeholder="어떤 질문에 강한지, 어떻게 답하는지, 어떤 자료를 함께 보는지 적어 주세요. 예: 동안구 구축 갈아타기 순서를 실거래·대출 한도와 함께 정리해 드립니다."
            className={`${inputCls} resize-none`}
          />
          <span className="t-caption text-text-3">{intro.length}/1000</span>
        </Field>

        {/* 전문 분야 */}
        <div className="flex flex-col gap-1.5">
          <span className="t-sub font-bold text-text-2">
            전문 분야 <span className="ml-1 font-medium text-text-3">최대 8개 · 목록 필터와 견적 요청이 이 라벨로 연결돼요</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SPECIALTIES.map((s) => {
              const on = specialties.includes(s.label);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSpecialty(s.label)}
                  aria-pressed={on}
                  title={s.desc}
                  className={`${on ? "chip-check-active" : "chip-check"} px-2.5 py-1.5 t-sub`}
                >
                  {on ? "✓ " : ""}
                  {s.label}
                </button>
              );
            })}
          </div>
          {customSpecialties.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customSpecialties.map((s) => (
                <button key={s} type="button" onClick={() => toggleSpecialty(s)} className="chip-check-active px-2.5 py-1.5 t-sub" title="누르면 제거">
                  {s} ✕
                </button>
              ))}
            </div>
          )}
          <input
            value={extra}
            onChange={(e) => mark(setExtra)(e.target.value)}
            maxLength={60}
            placeholder="그 밖의 분야 (쉼표로 구분 · 예: 상가, 토지) — 저장 시 추가돼요"
            className={inputCls}
          />
        </div>

        {/* 활동 지역 */}
        <div className="flex flex-col gap-1.5">
          <span className="t-sub font-bold text-text-2">
            활동 지역 <span className="ml-1 font-medium text-text-3">최대 5곳 · 목록의 지역 칩이 여기서 나와요</span>
          </span>
          {regions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {regions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => mark(setRegions)(regions.filter((x) => x !== r))}
                  className="chip-check-active px-2.5 py-1.5 t-sub"
                  title="누르면 제거"
                >
                  {r} ✕
                </button>
              ))}
            </div>
          )}
          {regions.length < 5 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
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
              <select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="시·군·구" className={inputCls} disabled={districts.length === 0}>
                <option value="">{districts.length === 0 ? "전국" : "시·군·구 (선택)"}</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addRegion} className="btn-soft rounded-xl px-4 py-3 t-body">
                추가
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="경력" hint="예: 8년">
            <input value={experience} onChange={(e) => mark(setExperience)(e.target.value)} maxLength={30} placeholder="예: 8년" className={inputCls} />
          </Field>
          <Field label="응답 시간 안내" hint="실측 응답 시간이 쌓이면 그 값을 우선 보여 줘요">
            <select value={responseTime} onChange={(e) => mark(setResponseTime)(e.target.value)} className={inputCls}>
              <option value="">안내 안 함</option>
              {RESPONSE_TIME_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              {responseTime && !(RESPONSE_TIME_OPTIONS as readonly string[]).includes(responseTime) && (
                <option value={responseTime}>{responseTime}</option>
              )}
            </select>
          </Field>
          <Field label="상담료 (원)" hint="0 = 미표기 · 안내 금액">
            <input
              value={consultationFee}
              onChange={(e) => mark(setConsultationFee)(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              maxLength={8}
              placeholder="예: 30000"
              className={inputCls}
            />
          </Field>
          <Field label="리포트료 (원)" hint="0 = 미표기">
            <input
              value={reportFee}
              onChange={(e) => mark(setReportFee)(e.target.value.replace(/[^0-9]/g, ""))}
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
            <input value={organization} onChange={(e) => mark(setOrganization)(e.target.value)} maxLength={60} placeholder="예: 관양부동산공인중개사사무소" className={inputCls} />
          </Field>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="전화번호">
              <input
                value={contactPhone}
                onChange={(e) => mark(setContactPhone)(e.target.value.replace(/[^0-9\-+ ]/g, ""))}
                inputMode="tel"
                maxLength={20}
                placeholder="예: 031-123-4567"
                className={inputCls}
              />
            </Field>
            <Field label="카카오톡 채널·오픈채팅 링크" hint="pf.kakao.com · open.kakao.com 만">
              <input value={contactKakao} onChange={(e) => mark(setContactKakao)(e.target.value)} maxLength={120} placeholder="예: https://pf.kakao.com/…" className={inputCls} />
            </Field>
          </div>
          <p className="t-caption text-text-3">플랫폼 밖 선결제 유도는 신고 대상이에요. 연락처는 상담·문의 연결 용도로만 노출됩니다.</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="t-sub text-text-3">{dirty ? "저장하지 않은 변경이 있어요" : "저장된 내용이 목록·상세에 그대로 보여요"}</span>
          <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary rounded-xl px-6 py-3 t-body disabled:opacity-60">
            {busy ? "저장 중…" : "프로필 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
