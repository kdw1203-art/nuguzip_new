"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { RegionPicker } from "@/app/components/RegionPicker";
import { takeSignupHandoff } from "@/lib/onboarding/signup-handoff";
import { PROFILE_OPTIONS } from "@/lib/onboarding/profile-options";
import { HOME_CTA_NOTE, HOME_HERO_SUBLINE } from "@/lib/brand/home-copy";

/** 위저드 화면 진행 기록용 id — 퍼널 관측 전용.
    진짜 온보딩 스텝(explore·inspection·share)은 서버가 실데이터로 판정하므로
    (app/api/me/onboarding/verify.ts) 여기서 그 id 를 보내면 안 된다. 화면만 넘기고
    "관심 담기·첫 노트·공개 공유"가 완료된 것처럼 기록되던 문제의 재발 방지. */
const STEP_IDS = [
  "profile_region",
  "profile_budget",
  "profile_purpose",
  "profile_persona",
  "profile_demo",
] as const;

/** 관심 지역 선택 상한 — 가입 화면(/signup)과 같은 값 */
const MAX_REGIONS = 3;

type BudgetType = "sale" | "jeonse";
type BudgetBand = { id: string; label: string; min: number | null; max: number | null };

/** 예산 구간(억 단위) — 매매/전세별 */
const BUDGET_BANDS: Record<BudgetType, BudgetBand[]> = {
  sale: [
    { id: "sale-0-6", label: "6억 이하", min: null, max: 6 },
    { id: "sale-6-9", label: "6~9억", min: 6, max: 9 },
    { id: "sale-9-15", label: "9~15억", min: 9, max: 15 },
    { id: "sale-15-25", label: "15~25억", min: 15, max: 25 },
    { id: "sale-25", label: "25억 이상", min: 25, max: null },
  ],
  jeonse: [
    { id: "jeonse-0-3", label: "3억 이하", min: null, max: 3 },
    { id: "jeonse-3-5", label: "3~5억", min: 3, max: 5 },
    { id: "jeonse-5-7", label: "5~7억", min: 5, max: 7 },
    { id: "jeonse-7", label: "7억 이상", min: 7, max: null },
  ],
};

type PurposeId = "live" | "invest" | "jeonse";
const PURPOSE_OPTIONS: { id: PurposeId; label: string; emoji: string; desc: string }[] = [
  { id: "live", label: "실거주", emoji: "🏠", desc: "내가 살 집을 찾고 있어요" },
  { id: "invest", label: "투자", emoji: "📈", desc: "수익·미래가치를 보고 있어요" },
  { id: "jeonse", label: "전세", emoji: "🔑", desc: "전세로 거주할 집을 찾아요" },
];

/* 타깃 페르소나(방향성 리밸런싱) — '어떤 임장러인가'. purpose(무엇을 찾나)와 별개로
   '어떻게 부동산을 대하는가'를 잡아 홈·추천을 맞춘다. 이모지는 Icon 매핑 게이트를
   피하려 평문 텍스트로 그린다(아이콘 컴포넌트 미사용). */
type PersonaId = "investor" | "resident" | "crew" | "explorer";
const PERSONA_OPTIONS: { id: PersonaId; label: string; glyph: string; desc: string }[] = [
  { id: "investor", label: "실전 투자자", glyph: "📈", desc: "여러 단지를 비교하고 타이밍을 재요" },
  { id: "resident", label: "내집마련 실수요자", glyph: "🏠", desc: "내가 살 집, 신중하게 정할래요" },
  { id: "crew", label: "임장 스터디·크루", glyph: "👥", desc: "스터디·모임과 함께 임장 다녀요" },
  { id: "explorer", label: "아직 탐색 중", glyph: "🧭", desc: "부동산 공부를 막 시작했어요" },
];

export function WelcomeClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [regions, setRegions] = useState<string[]>([]);
  const [budgetType, setBudgetType] = useState<BudgetType>("sale");
  const [budgetBandId, setBudgetBandId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<PurposeId | null>(null);
  const [persona, setPersona] = useState<PersonaId | null>(null);
  const [busy, setBusy] = useState(false);

  /* 로그인 확인 겸 저장된 진행 상태 조회 — 401 이면 로그인으로 (소셜 포함, 로그인 후 복귀) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/onboarding", { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/welcome");
          return;
        }
      } catch {
        /* 네트워크 오류 시에도 온보딩 UI는 보여준다 */
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  /* 위저드 진행 기록 (fire-and-forget, 실패 무시) — 퍼널 관측용 wizardSteps 로만 쌓인다 */
  const recordStep = useCallback((index: number) => {
    const id = STEP_IDS[index];
    if (!id) return;
    fetch("/api/me/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: id }),
    }).catch(() => {});
  }, []);

  /* 가입 화면에서 이미 고른 값을 그대로 이어받는다 — 예전에는 전부 버려져서
     같은 질문을 두 번 받았고, 기본 정보 6줄은 어디에도 저장되지 않았다. */
  const [profile, setProfile] = useState<Record<string, string>>({});
  useEffect(() => {
    const carried = takeSignupHandoff();
    if (carried.regions.length > 0) setRegions(carried.regions.slice(0, MAX_REGIONS));
    if (Object.keys(carried.profile).length > 0) setProfile(carried.profile);
    if (carried.purpose) setPurpose(carried.purpose);
  }, []);

  const pickBudgetType = (t: BudgetType) => {
    setBudgetType(t);
    setBudgetBandId(null); // 유형 변경 시 구간 초기화
  };

  const nextFromStep1 = () => {
    recordStep(0);
    setStep(1);
  };

  const nextFromStep2 = () => {
    recordStep(1);
    setStep(2);
  };

  const nextFromStep3 = () => {
    recordStep(2);
    setStep(3);
  };

  const nextFromStep4 = () => {
    recordStep(3);
    setStep(4);
  };

  const setProfileField = (key: string, value: string) => {
    setProfile((prev) => {
      if (prev[key] === value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  /* step3 완료: 관심지역 알림 구독 + 개인화 저장 → 첫 행동(임장노트 쓰기)으로 (실패 무시, graceful) */
  const finish = useCallback(async () => {
    if (busy || !purpose) return;
    setBusy(true);
    recordStep(4); // 위저드 마지막 화면(기본 정보) 통과 기록 (완료 판정·보너스와 무관)

    const band = BUDGET_BANDS[budgetType].find((b) => b.id === budgetBandId) ?? null;
    const budget = band
      ? { type: budgetType, min: band.min, max: band.max, label: band.label }
      : null;

    await Promise.allSettled([
      // 관심지역 알림 구독 (기존 인프라)
      ...regions.map((value) =>
        fetch("/api/me/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "region", value }),
        }),
      ),
      // 개인화 저장 (관심 지역·예산·목적·페르소나)
      fetch("/api/me/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions, budget, purpose, persona, profile }),
      }),
    ]).catch(() => {});

    // 종착지: 첫 임장노트(+ AI 의도) — NoteForm 이 from=welcome 이면 저장 후 지도로 이어간다.
    const firstRegion = regions[0];
    const qs = new URLSearchParams({ from: "welcome", intent: "ai" });
    if (firstRegion) qs.set("region", firstRegion);
    try {
      window.localStorage.setItem("nz_onboarding_loop", "note");
    } catch {
      /* ignore */
    }
    router.push(`/notes/new?${qs.toString()}`);
  }, [busy, purpose, persona, recordStep, budgetType, budgetBandId, regions, profile, router]);

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[440px] items-center justify-center px-7">
        <span className="text-[13px] text-text-3">준비 중…</span>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col gap-4 px-7 pb-8"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
    >
      {/* 헤더 — progress dots + 건너뛰기 (항상 노출) */}
      <div className="flex items-center justify-between">
        <div
          className="flex items-center gap-1.5"
          aria-label={`온보딩 ${step + 1} / ${STEP_IDS.length} 단계`}
        >
          {STEP_IDS.map((id, i) => (
            <span
              key={id}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-5 bg-primary" : i < step ? "w-1.5 bg-primary" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>
        <Link
          href={`${HOME_CTA_NOTE.href}?from=welcome&intent=ai`}
          className="text-[13px] text-text-3"
        >
          건너뛰고 노트 쓰기
        </Link>
      </div>

      {step === 0 && (
        <>
          <h1 className="rise-in text-[21px] font-extrabold leading-[1.35] text-ink">
            어느 동네가
            <br />
            궁금하세요?
          </h1>
          <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
            전국 시·군·구에서 1~{MAX_REGIONS}곳 고르면 맞춤 시세·소식을 준비해 드려요
          </p>
          <div className="rise-in-2">
            <RegionPicker
              inputId="welcome-region-search"
              value={regions}
              onChange={setRegions}
              max={MAX_REGIONS}
            />
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={nextFromStep1}
            disabled={regions.length === 0}
            className="btn-primary btn-cta rise-in-3 rounded-2xl p-[15px] text-center text-[15px] disabled:opacity-60"
          >
            {regions.length > 0 ? `${regions.length}곳 선택 · 다음` : "지역을 선택해 주세요"}
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="rise-in text-[21px] font-extrabold leading-[1.35] text-ink">
            예산대는
            <br />
            어느 정도인가요?
          </h1>
          <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
            예산에 맞는 단지·매물을 우선 추려 드려요
          </p>

          {/* 매매 / 전세 토글 */}
          <div className="rise-in-2 flex gap-1.5 rounded-2xl bg-bg p-1">
            {(["sale", "jeonse"] as BudgetType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => pickBudgetType(t)}
                aria-pressed={budgetType === t}
                className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold transition ${
                  budgetType === t ? "bg-surface text-primary shadow-sm" : "text-text-3"
                }`}
              >
                {t === "sale" ? "매매" : "전세"}
              </button>
            ))}
          </div>

          {/* 예산 구간 선택 */}
          <div className="rise-in-2 grid grid-cols-2 gap-1.5">
            {BUDGET_BANDS[budgetType].map((b) => {
              const active = budgetBandId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBudgetBandId(b.id)}
                  aria-pressed={active}
                  className={`rounded-2xl px-3 py-3.5 text-center text-[13px] transition ${
                    active
                      ? "bg-primary-soft font-bold text-primary"
                      : "border border-line bg-surface text-text-2"
                  }`}
                >
                  {active ? "✓ " : ""}
                  {b.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />
          <button
            type="button"
            onClick={nextFromStep2}
            disabled={!budgetBandId}
            className="btn-primary btn-cta rise-in-3 rounded-2xl p-[15px] text-center text-[15px] disabled:opacity-60"
          >
            {budgetBandId ? "다음" : "예산대를 선택해 주세요"}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="rise-in text-[21px] font-extrabold leading-[1.35] text-ink">
            어떤 목적으로
            <br />
            찾고 계세요?
          </h1>
          <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
            목적에 맞춰 홈과 추천 문구를 바꿔 드려요
          </p>

          <div className="rise-in-2 flex flex-col gap-2">
            {PURPOSE_OPTIONS.map((o) => {
              const active = purpose === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setPurpose(o.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-3 rounded-2xl p-4 text-left transition ${
                    active
                      ? "bg-primary-soft ring-2 ring-primary/40"
                      : "border border-line bg-surface"
                  }`}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-[19px]">
                    <Icon name={o.emoji} size={22} />
                  </span>
                  <span className="flex flex-col">
                    <span
                      className={`text-[15px] font-extrabold ${active ? "text-primary" : "text-ink"}`}
                    >
                      {o.label}
                    </span>
                    <span className="text-[12px] text-text-2">{o.desc}</span>
                  </span>
                  {active && <span className="ml-auto text-primary">✓</span>}
                </button>
              );
            })}
          </div>

          {/* 선택 요약 */}
          {regions.length > 0 && (
            <div className="rise-in-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[12px] text-text-3">
                <Icon name="📍" size={12} />
                관심지역
              </span>
              {regions.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-primary-soft px-2.5 py-1 text-[12px] font-bold text-primary"
                >
                  {r}
                </span>
              ))}
            </div>
          )}

          <div className="flex-1" />
          <button
            type="button"
            onClick={nextFromStep3}
            disabled={!purpose}
            className="btn-primary btn-cta rise-in-3 rounded-2xl p-[15px] text-center text-[15px] disabled:opacity-60"
          >
            {purpose ? "다음" : "목적을 선택해 주세요"}
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="rise-in text-[21px] font-extrabold leading-[1.35] text-ink">
            어떤 임장러에
            <br />
            가까우세요?
          </h1>
          <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
            내집나우는 발로 뛰는 임장러를 위한 부동산 의사결정 플랫폼이에요. 골라 주시면
            홈·추천을 맞춰 드려요. (선택 사항)
          </p>

          <div className="rise-in-2 flex flex-col gap-2">
            {PERSONA_OPTIONS.map((o) => {
              const active = persona === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setPersona(active ? null : o.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-3 rounded-2xl p-4 text-left transition ${
                    active
                      ? "bg-primary-soft ring-2 ring-primary/40"
                      : "border border-line bg-surface"
                  }`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/70 text-[19px]">
                    {o.glyph}
                  </span>
                  <span className="flex flex-col">
                    <span
                      className={`text-[15px] font-extrabold ${active ? "text-primary" : "text-ink"}`}
                    >
                      {o.label}
                    </span>
                    <span className="text-[12px] text-text-2">{o.desc}</span>
                  </span>
                  {active && <span className="ml-auto text-primary">✓</span>}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />
          <button
            type="button"
            onClick={nextFromStep4}
            className="btn-primary btn-cta rise-in-3 rounded-2xl p-[15px] text-center text-[15px]"
          >
            {persona ? "다음" : "건너뛰고 다음"}
          </button>
        </>
      )}

      {step === 4 && (
        <>
          <h1 className="rise-in text-[21px] font-extrabold leading-[1.35] text-ink">
            맞춤에 쓸
            <br />
            기본 정보예요
          </h1>
          <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
            선택 사항이에요. 건너뛰어도 되고, 고른 값만 저장합니다.
          </p>

          <div className="rise-in-2 flex flex-col gap-4">
            {Object.entries(PROFILE_OPTIONS).map(([key, options]) => (
              <div key={key}>
                <div className="mb-1.5 text-[12px] font-bold text-text-2">{key}</div>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((opt) => {
                    const active = profile[key] === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setProfileField(key, opt)}
                        aria-pressed={active}
                        className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition ${
                          active
                            ? "bg-primary-soft text-primary"
                            : "border border-line bg-surface text-text-2"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="rise-in-2 rounded-2xl bg-bg px-4 py-3 text-[12px] leading-[1.6] text-text-2">
            <span className="font-extrabold text-ink">다음은 첫 임장노트 → AI → 지도예요.</span>{" "}
            {HOME_HERO_SUBLINE}
          </div>

          <div className="flex-1" />
          <button
            type="button"
            onClick={finish}
            disabled={busy || !purpose}
            className="btn-primary btn-cta rise-in-3 rounded-2xl p-[15px] text-center text-[15px] disabled:opacity-60"
          >
            {busy ? "저장 중…" : "완료하고 첫 임장노트 써보기"}
          </button>
        </>
      )}
    </main>
  );
}
