"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** 온보딩 3스텝 → 기존 온보딩 인프라(user_onboarding progress) 스텝 매핑 */
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

export function WelcomeClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [regions, setRegions] = useState<string[]>([]);
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

  const nextFromStep1 = () => {
    recordStep(0);
    setStep(1);
  };

  const nextFromStep2 = () => {
    recordStep(1);
    setStep(2);
  };

  /* step3: 선택 지역 알림 구독 (실패 무시) → 홈 */
  const finish = useCallback(
    async (subscribe: boolean) => {
      if (busy) return;
      setBusy(true);
      recordStep(2);
      if (subscribe) {
        await Promise.allSettled(
          regions.map((value) =>
            fetch("/api/me/alerts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "region", value }),
            }),
          ),
        ).catch(() => {});
      }
      router.push("/");
    },
    [busy, recordStep, regions, router],
  );

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
            {regions.length > 0 ? `${regions.length}곳 선택 완료` : "지역을 선택해 주세요"}
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="rise-in text-[22px] font-extrabold leading-[1.35] text-ink">
            첫 임장노트를
            <br />
            남겨볼까요?
          </h1>
          <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
            직접 본 집의 느낌은 그날 기록해야 남아요
          </p>
          <div className="rise-in-2 card flex flex-col gap-3 rounded-[20px] p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-lg">
              📝
            </span>
            <div className="text-[15px] font-extrabold text-ink">체크리스트로 3분 만에 기록</div>
            <ul className="flex flex-col gap-1.5 text-[13px] leading-[1.6] text-text-2">
              <li>✓ 채광·소음·주차 같은 필수 항목 자동 체크</li>
              <li>✓ 사진을 붙이면 AI 가 노트로 정리</li>
              <li>✓ 여러 집을 나란히 비교</li>
            </ul>
            <Link
              href="/notes/new"
              onClick={() => recordStep(1)}
              className="btn-primary btn-cta mt-1 rounded-2xl p-[13px] text-center text-[15px]"
            >
              첫 임장노트 쓰러 가기
            </Link>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={nextFromStep2}
            className="rise-in-3 rounded-2xl border border-[#e2e7ee] bg-surface p-[15px] text-center text-base font-bold text-text-1"
          >
            다음에 쓸게요 · 다음
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="rise-in text-[22px] font-extrabold leading-[1.35] text-ink">
            선택한 동네 소식,
            <br />
            놓치지 않게 알려드릴까요?
          </h1>
          <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
            급매·시세 변동을 관심 지역 기준으로 모아 드려요
          </p>
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[20px] p-6">
            <div className="text-[13px] font-extrabold text-ink">알림 받을 지역</div>
            {regions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {regions.map((r) => (
                  <span
                    key={r}
                    className="rounded-full bg-primary-soft px-[13px] py-[7px] text-xs font-bold text-primary"
                  >
                    {r}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-text-3">
                선택한 지역이 없어요. 나중에 알림 설정에서 추가할 수 있어요.
              </p>
            )}
            <p className="text-[11px] text-text-3">알림은 언제든 설정에서 끌 수 있어요</p>
          </div>
          <div className="flex-1" />
          <div className="rise-in-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => finish(true)}
              disabled={busy || regions.length === 0}
              className="btn-primary btn-cta rounded-2xl p-[15px] text-center text-base disabled:opacity-60"
            >
              {busy ? "설정 중…" : "알림 받고 시작하기"}
            </button>
            <button
              type="button"
              onClick={() => finish(false)}
              disabled={busy}
              className="rounded-2xl p-2 text-center text-[13px] text-text-3 disabled:opacity-60"
            >
              알림 없이 시작하기
            </button>
          </div>
        </>
      )}
    </main>
  );
}
