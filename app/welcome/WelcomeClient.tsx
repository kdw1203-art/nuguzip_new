"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** 온보딩 3스텝 → 기존 온보딩 인프라(app_users.onboarding_progress) 스텝 매핑 */
const STEP_IDS = ["explore", "inspection", "share"] as const;

/** 서울·경기·인천 주요 지역 (알림 구독 value 로 그대로 전송, ≤30자) */
const REGION_GROUPS: { label: string; regions: string[] }[] = [
  {
    label: "서울",
    regions: [
      "서울 강남구",
      "서울 서초구",
      "서울 송파구",
      "서울 마포구",
      "서울 성동구",
      "서울 영등포구",
      "서울 노원구",
    ],
  },
  {
    label: "경기",
    regions: [
      "성남 분당구",
      "수원 영통구",
      "용인 수지구",
      "고양 일산",
      "안양 동안구",
      "화성 동탄",
      "과천시",
    ],
  },
  {
    label: "인천",
    regions: ["인천 연수구 송도", "인천 서구 청라", "인천 부평구"],
  },
];

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

export function WelcomeClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [regions, setRegions] = useState<string[]>([]);
  const [budgetType, setBudgetType] = useState<BudgetType>("sale");
  const [budgetBandId, setBudgetBandId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<PurposeId | null>(null);
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

  /* 기존 온보딩 인프라에 스텝 기록 (fire-and-forget, 실패 무시) */
  const recordStep = useCallback((index: number) => {
    const id = STEP_IDS[index];
    if (!id) return;
    fetch("/api/me/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: id }),
    }).catch(() => {});
  }, []);

  const toggleRegion = (r: string) =>
    setRegions((prev) =>
      prev.includes(r) ? prev.filter((v) => v !== r) : prev.length < 3 ? [...prev, r] : prev,
    );

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

  /* step3 완료: 관심지역 알림 구독 + 개인화 저장 + 온보딩 완료 → 홈 (실패 무시, graceful) */
  const finish = useCallback(async () => {
    if (busy || !purpose) return;
    setBusy(true);
    recordStep(2); // 3스텝 모두 기록 → onboarding_completed_at 세팅

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
      // 개인화 저장 (관심 지역·예산·목적)
      fetch("/api/me/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions, budget, purpose }),
      }),
    ]).catch(() => {});

    router.push("/");
  }, [busy, purpose, recordStep, budgetType, budgetBandId, regions, router]);

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
        <div className="flex items-center gap-1.5" aria-label={`온보딩 ${step + 1} / 3 단계`}>
          {STEP_IDS.map((id, i) => (
            <span
              key={id}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-5 bg-primary" : i < step ? "w-1.5 bg-primary" : "w-1.5 bg-[#e2e7ee]"
              }`}
            />
          ))}
        </div>
        <Link href="/" className="text-[13px] text-text-3">
          건너뛰기
        </Link>
      </div>

      {step === 0 && (
        <>
          <h1 className="rise-in text-[22px] font-extrabold leading-[1.35] text-ink">
            어느 동네가
            <br />
            궁금하세요?
          </h1>
          <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
            관심 지역을 1~3곳 고르면 맞춤 시세·소식을 준비해 드려요
          </p>
          <div className="rise-in-2 flex flex-col gap-3">
            {REGION_GROUPS.map((g) => (
              <div key={g.label} className="flex flex-col gap-1.5">
                <span className="text-[12px] font-extrabold text-text-2">{g.label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {g.regions.map((r) => {
                    const active = regions.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleRegion(r)}
                        aria-pressed={active}
                        className={`rounded-full px-[13px] py-[7px] text-xs transition ${
                          active
                            ? "bg-primary-soft font-bold text-primary"
                            : "border border-[#e2e7ee] bg-surface text-text-2"
                        }`}
                      >
                        {active ? "✓ " : ""}
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={nextFromStep1}
            disabled={regions.length === 0}
            className="btn-primary btn-cta rise-in-3 rounded-2xl p-[15px] text-center text-base disabled:opacity-60"
          >
            {regions.length > 0 ? `${regions.length}곳 선택 · 다음` : "지역을 선택해 주세요"}
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="rise-in text-[22px] font-extrabold leading-[1.35] text-ink">
            예산대는
            <br />
            어느 정도인가요?
          </h1>
          <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
            예산에 맞는 단지·매물을 우선 추려 드려요
          </p>

          {/* 매매 / 전세 토글 */}
          <div className="rise-in-2 flex gap-1.5 rounded-2xl bg-[#f2f4f8] p-1">
            {(["sale", "jeonse"] as BudgetType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => pickBudgetType(t)}
                aria-pressed={budgetType === t}
                className={`flex-1 rounded-xl py-2.5 text-[14px] font-bold transition ${
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
                  className={`rounded-2xl px-3 py-3.5 text-center text-sm transition ${
                    active
                      ? "bg-primary-soft font-bold text-primary"
                      : "border border-[#e2e7ee] bg-surface text-text-2"
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
            className="btn-primary btn-cta rise-in-3 rounded-2xl p-[15px] text-center text-base disabled:opacity-60"
          >
            {budgetBandId ? "다음" : "예산대를 선택해 주세요"}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="rise-in text-[22px] font-extrabold leading-[1.35] text-ink">
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
                      : "border border-[#e2e7ee] bg-surface"
                  }`}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-lg">
                    {o.emoji}
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
              <span className="text-[11px] text-text-3">📍 관심지역</span>
              {regions.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary"
                >
                  {r}
                </span>
              ))}
            </div>
          )}

          <div className="flex-1" />
          <button
            type="button"
            onClick={finish}
            disabled={busy || !purpose}
            className="btn-primary btn-cta rise-in-3 rounded-2xl p-[15px] text-center text-base disabled:opacity-60"
          >
            {busy ? "저장 중…" : "설정 완료하고 시작하기"}
          </button>
        </>
      )}
    </main>
  );
}
