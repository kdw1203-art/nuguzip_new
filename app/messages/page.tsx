import Link from "next/link";
import { PageShell } from "../components/PageShell";

/* P0-5 목업 정직화: 하드코딩 쪽지함(받은·보낸 가짜 대화)을 제거하고
   정직한 "준비 중" 상태로 전환 — 실제 대화가 가능한 임장 모임 채팅으로 안내 */

export const metadata = {
  robots: { index: false, follow: false },
};

export default function MessagesPage() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[480px]">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">쪽지함</h1>

        <div className="rise-in-1 card mt-4 flex flex-col items-center gap-3 rounded-[20px] px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-[22px]">
            ✉️
          </div>
          <div className="text-[15px] font-extrabold text-ink">
            쪽지 기능 준비 중이에요
          </div>
          <p className="text-[13px] leading-[1.7] text-text-2">
            1:1 쪽지는 아직 열리지 않았어요.
            <br />
            지금은 임장 모임 채팅에서 이웃들과 대화할 수 있어요.
          </p>
          <Link
            href="/town/groups"
            className="btn-primary mt-1 rounded-xl px-6 py-3 text-[13px] no-underline"
          >
            임장 모임 채팅 이용하기
          </Link>
          <Link
            href="/notifications"
            className="text-xs font-semibold text-primary no-underline"
          >
            쪽지 오픈 알림 받기 ›
          </Link>
        </div>

        <div className="rise-in-2 mt-3 text-center text-[11px] text-[#adb5bd]">
          쪽지는 닉네임으로만 오가도록 준비하고 있어요 · 연락처 요구는 신고
          대상입니다
        </div>
      </div>
    </PageShell>
  );
}
