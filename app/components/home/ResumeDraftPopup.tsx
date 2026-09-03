"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import {
  readNoteDraftSummary,
  type NoteDraftSummary,
} from "@/lib/notes/draft-summary";

/* 홈 개인화 블록(PersonalHome) 제거에 따른 대체 — 소유자 지시(2026-08-16):
 * "팝업형식 또는 제거". 블록이 담던 것 중 실제로 잃으면 아까운 단 하나
 * — **작성 중이던 노트 복귀** — 만 작은 팝업 카드로 남긴다.
 *
 * - 임시저장(localStorage nz_note_draft)이 있을 때만 뜬다. 없으면 아무것도 없다.
 * - 세션당 1회: 닫으면 sessionStorage 에 기록해 이 탭에서는 다시 안 뜬다.
 * - 위치: 데스크탑 우하단, 모바일은 탭바 위. 화면을 가리는 모달이 아니라
 *   구석 카드다 — 첫 화면(검색)의 주도권을 뺏지 않는다.
 * - 나머지 개인화(최근 본 단지·임장 레벨)는 이미 새 홈에 흡수됐다
 *   (검색 칩·KPI ④) — 여기 다시 그리지 않는다.
 */

const DISMISS_KEY = "nz_resume_popup_dismissed";

function savedAgo(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return null;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

export function ResumeDraftPopup() {
  const [draft, setDraft] = useState<NoteDraftSummary | null>(null);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* sessionStorage 접근 불가(시크릿 등) — 그냥 보여준다 */
    }
    setDraft(readNoteDraftSummary());
  }, []);

  if (!draft) return null;

  const where = draft.aptName ?? draft.region;
  const ago = savedAgo(draft.savedAt);

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* 저장 실패해도 이 렌더에서는 닫힌다 */
    }
    setDraft(null);
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-40 md:inset-x-auto md:bottom-6 md:right-6 md:w-[320px]">
      <div className="card flex items-center gap-3 rounded-2xl border-primary/25 p-3.5 shadow-[0_16px_44px_rgba(16,28,54,.18)] [animation:riseIn_240ms_var(--ease-out)_backwards]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon name="notebook-pen" size={17} />
        </span>
        <Link href="/notes/new" className="min-w-0 flex-1 no-underline">
          <span className="block text-[13px] font-extrabold leading-tight text-ink">
            작성 중인 노트 이어서 쓰기
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-text-3">
            {[where, ago ? `${ago} 저장됨` : null].filter(Boolean).join(" · ") ||
              "임시저장된 노트가 있어요"}
          </span>
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="이어서 쓰기 알림 닫기"
          className="relative shrink-0 rounded-full p-1 text-[13px] text-text-3 after:absolute after:-inset-2 after:content-['']"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
