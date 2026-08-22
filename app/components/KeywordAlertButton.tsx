"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import type { SavedSearchScope } from "@/lib/saved-search/types";

/* [개선 #13] 지역·키워드 알림 원탭 구독 버튼.
 *
 * 저장 검색(saved_searches)은 스토어·매처·크론·관리 화면까지 다 있는데 실제
 * 구독이 0건이었다 — 만들 수 있는 곳이 /my/saved-searches 뿐이라 아무도 못
 * 찾아서다. 이 버튼은 콘텐츠가 있는 자리(지역 허브·뉴스)에서 지금 보고 있는
 * 키워드를 한 번에 구독시킨다(생성과 동시에 alert_enabled=true).
 *
 * 동작: 클릭 → 목록 조회로 중복 확인 → 없으면 생성. 비로그인(401)은 로그인
 * 링크로 안내. 실패는 문구로 보여 주고 조용히 삼키지 않는다.
 */

type Phase = "idle" | "busy" | "done" | "exists" | "need-login" | "error";

export function KeywordAlertButton({
  scope,
  query,
  label,
  className = "",
}: {
  scope: SavedSearchScope;
  query: string;
  /** saved_searches.label 로 저장될 이름 — 기본값 "{query} 새 소식" */
  label?: string;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");

  const q = query.trim();
  if (!q) return null;

  async function subscribe() {
    if (phase === "busy" || phase === "done" || phase === "exists") return;
    setPhase("busy");
    try {
      // 중복 확인 — 같은 scope+query 가 이미 있으면 새로 만들지 않는다.
      const listRes = await fetch("/api/saved-searches", { cache: "no-store" });
      if (listRes.ok) {
        const body = (await listRes.json().catch(() => null)) as {
          items?: Array<{ scope?: string; query?: string }>;
        } | null;
        const exists = (body?.items ?? []).some(
          (it) => it.scope === scope && (it.query ?? "").trim().toLowerCase() === q.toLowerCase(),
        );
        if (exists) {
          setPhase("exists");
          return;
        }
      }
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: (label ?? `${q} 새 소식`).slice(0, 80),
          query: q,
          scope,
          filters: {},
          alertEnabled: true,
        }),
      });
      if (res.status === 401) {
        setPhase("need-login");
        return;
      }
      setPhase(res.ok ? "done" : "error");
    } catch {
      setPhase("error");
    }
  }

  if (phase === "done" || phase === "exists") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-text-2 ${className}`}>
        <Icon name="check" size={14} />
        {phase === "done" ? "알림 설정됨" : "이미 받고 있어요"} ·{" "}
        <Link href="/my/saved-searches" className="underline underline-offset-2">
          관리
        </Link>
      </span>
    );
  }

  if (phase === "need-login") {
    return (
      <Link
        href="/login"
        className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink tap-ripple ${className}`}
      >
        <Icon name="bell" size={14} />
        로그인하고 알림 받기
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={phase === "busy"}
      className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink transition-opacity tap-ripple disabled:opacity-60 ${className}`}
    >
      <Icon name="bell" size={14} />
      {phase === "busy" ? "설정 중…" : phase === "error" ? "다시 시도" : `‘${q}’ 새 소식 알림`}
    </button>
  );
}
