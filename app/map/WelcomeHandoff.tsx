"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";

/**
 * /welcome → 노트 저장 → /map?from=welcome 핸드오프 배너.
 * 쿼리만 받고 실제 지도 포커스는 page/map-client 가 처리한다.
 */
export function WelcomeHandoff() {
  const sp = useSearchParams();
  const { promptUpgrade } = useUpgradePaywall();
  const [show, setShow] = useState(false);
  const fromWelcome = sp.get("from") === "welcome";
  const noteId = sp.get("noteId");
  const quota = sp.get("quota") === "1";
  const ai = sp.get("ai");

  useEffect(() => {
    if (!fromWelcome) return;
    setShow(true);
    try {
      window.localStorage.setItem("nz_journey_loop", "map");
      window.localStorage.removeItem("nz_onboarding_loop");
    } catch {
      /* ignore */
    }
    if (quota) {
      promptUpgrade({
        title: "AI 월간 한도 도달",
        message:
          "노트는 저장됐고 지도 비교로 이어졌어요. AI LLM 정리는 구독에서 이어서 쓸 수 있어요.",
        ctaLabel: "구독하고 AI 이어서 쓰기",
      });
    }
  }, [fromWelcome, quota, promptUpgrade]);

  if (!show || !fromWelcome) return null;

  const aiLabel =
    ai === "ok" ? "AI 정리 완료" : ai === "rule" ? "규칙 기반 요약" : "노트 저장됨";

  return (
    <div
      className="pointer-events-auto absolute left-3 right-3 top-[max(12px,env(safe-area-inset-top))] z-30 md:left-auto md:right-4 md:w-[340px]"
      role="status"
    >
      <div className="card flex flex-col gap-2 rounded-2xl px-3.5 py-3 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="t-body font-extrabold text-ink">온보딩 루프 완료</div>
            <p className="mt-0.5 t-sub text-text-2">
              {aiLabel} · 같은 생활권 후보를 지도에서 비교해 보세요
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="shrink-0 t-sub font-semibold text-text-3"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {noteId && (
            <Link
              href={`/notes/${encodeURIComponent(noteId)}`}
              className="chip border border-primary/30 bg-primary-soft px-2.5 py-1 t-sub font-bold text-primary no-underline"
            >
              방금 쓴 노트
            </Link>
          )}
          <Link
            href="/notes/new"
            className="chip border border-line bg-surface px-2.5 py-1 t-sub font-bold text-text-1 no-underline"
          >
            노트 더 쓰기
          </Link>
        </div>
      </div>
    </div>
  );
}

export default WelcomeHandoff;
