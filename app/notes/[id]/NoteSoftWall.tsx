"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* [개선 #5, 2026-08-22] 공개 노트 소프트월 — 비회원 하루 3편까지.
 *
 * 실측 배경: 공개 노트가 전면 무료 열람이라 가입할 이유가 없었다(30일 가입
 * 완료 3명). 4편째부터는 본문 하단을 가리고 무료 가입을 권한다.
 *
 * 지키는 선:
 *  - **검색엔진·SEO 무손상**: 본문은 서버가 항상 전부 렌더한다. 이 벽은
 *    브라우저에서 localStorage 를 읽은 뒤에만 나타난다(봇은 JS 상태가 없어
 *    영향 없음 — 클로킹이 아니라 전 사용자 동일 마크업).
 *  - 로그인 사용자는 세션 쿠키로 판정해 아예 그리지 않는다.
 *  - 하루 단위로 초기화 — "오늘은 여기까지"이지 영구 차단이 아니다.
 *  - localStorage 를 못 읽는 환경(프라이빗 모드)은 벽을 세우지 않는다 —
 *    가드가 실패하면 열리는 쪽이 안전하다(콘텐츠는 어차피 공개물).
 */

const KEY = "nz_note_reads";
const FREE_PER_DAY = 3;

function hasSessionCookie(): boolean {
  try {
    return /(?:^|;\s*)(?:__Secure-)?(?:next-auth|authjs)\.session-token=/.test(document.cookie);
  } catch {
    return false;
  }
}

export function NoteSoftWall({ noteId }: { noteId: string }) {
  const [walled, setWalled] = useState(false);

  useEffect(() => {
    if (hasSessionCookie()) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = localStorage.getItem(KEY);
      let state: { date: string; ids: string[] } = { date: today, ids: [] };
      if (raw) {
        const parsed = JSON.parse(raw) as { date?: string; ids?: string[] };
        if (parsed.date === today && Array.isArray(parsed.ids)) {
          state = { date: today, ids: parsed.ids.map(String) };
        }
      }
      const already = state.ids.includes(noteId);
      if (!already && state.ids.length >= FREE_PER_DAY) {
        setWalled(true); // 무료 쿼터 소진 — 이 글은 세지 않고 벽만 세운다
        return;
      }
      if (!already) {
        state.ids.push(noteId);
        localStorage.setItem(KEY, JSON.stringify(state));
      }
    } catch {
      /* 저장소 접근 불가 — 벽 없이 통과 */
    }
  }, [noteId]);

  if (!walled) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70]">
      {/* 본문 하단을 덮는 그라디언트 — 위쪽 내용은 그대로 보인다(소프트) */}
      <div
        aria-hidden
        className="pointer-events-none h-[38vh] w-full"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,.9) 45%, #ffffff 80%)",
        }}
      />
      <div className="bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-1">
        <div className="mx-auto flex w-full max-w-[440px] flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-5 text-center shadow-[0_18px_44px_rgba(15,23,42,.16)]">
          <div className="t-section text-ink">
            오늘 무료 열람 {FREE_PER_DAY}편을 다 보셨어요
          </div>
          <p className="t-body text-text-2">
            무료로 가입하면 모든 임장노트를 제한 없이 읽고, 내 노트도 기록할 수
            있어요. 가입만 해도 출석·기록으로 포인트가 쌓입니다.
          </p>
          <Link href="/signup" className="btn-primary btn-cta rounded-2xl p-3.5 t-body no-underline">
            30초 무료 가입하고 계속 읽기
          </Link>
          <Link href="/login" className="t-sub font-bold text-text-3 no-underline">
            이미 계정이 있어요 — 로그인
          </Link>
        </div>
      </div>
    </div>
  );
}
