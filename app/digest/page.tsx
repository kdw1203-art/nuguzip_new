import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { HouseMark } from "@/app/components/Logo";

export default function DigestPage() {
  return (
    <PageShell breadcrumb="주간 다이제스트">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-2.5">
        {/* 푸시 미리보기 (11b) */}
        <div className="rise-in glass-strong flex gap-2.5 rounded-2xl px-3.5 py-3 shadow-[0_8px_24px_rgba(16,28,54,.12)]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary">
            <HouseMark size={17} />
          </div>
          <div className="flex-1">
            <div className="flex justify-between">
              <span className="text-xs font-extrabold text-ink">누구집 · 주간 브리핑</span>
              <span className="text-[10px] text-text-3">일 09:00</span>
            </div>
            <div className="mt-0.5 text-[11px] text-text-2">
              이번 주 관양동: 실거래 4건 · 새 노트 12건 · 내 후보 ▼0.4%
            </div>
          </div>
        </div>

        <h1 className="rise-in-1 mt-2 text-[17px] font-extrabold text-ink">
          7월 3주차, 대웅님의 브리핑
        </h1>

        {/* 내 후보 단지 (11b) */}
        <div className="rise-in-2 card flex flex-col gap-[7px] rounded-2xl px-4 py-3.5">
          <div className="text-xs font-extrabold text-ink">내 후보 단지</div>
          <div className="flex justify-between text-[11px]">
            <span className="text-text-2">
              공작 8.4억 ▼0.4% · <b className="text-danger">급매 1</b>
            </span>
            <Link href="/notes" className="font-extrabold text-primary">
              확인 ›
            </Link>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-text-2">동편3 10.2억 보합 · 새 노트 2</span>
            <Link href="/notes" className="font-extrabold text-primary">
              확인 ›
            </Link>
          </div>
        </div>

        {/* 시장 한 줄 (11b) */}
        <div className="rise-in-3 card flex flex-col gap-[7px] rounded-2xl px-4 py-3.5">
          <div className="text-xs font-extrabold text-ink">시장 한 줄</div>
          <div className="text-[11px] leading-[1.6] text-text-2">
            수도권 하락 폭 3주 연속 둔화 · 매수 신호 <b className="text-primary">62→68</b> · 과천 S7
            접수 D-2
          </div>
        </div>

        {/* 이번 주 할 일 (11b) */}
        <div className="rise-in-4 ai-panel flex flex-col gap-1.5 rounded-2xl px-4 py-3.5">
          <div className="text-[11px] font-extrabold text-[#7ea2ff]">이번 주 할 일 1개</div>
          <div className="text-xs leading-[1.6] text-ai-text">
            공작 302동 <b className="text-white">평일 저녁 임장 1회</b> — 완료하면 판단 준비가 끝나요.
          </div>
          <button
            type="button"
            className="btn-primary mt-1 rounded-[9px] p-[9px] text-center text-[11px]"
          >
            캘린더에 추가
          </button>
        </div>

        <p className="rise-in-5 text-center text-[10px] text-[#adb5bd]">
          매주 일요일 09:00 · <Link href="/my/settings" className="underline">설정</Link>에서
          요일·채널(푸시/이메일) 변경
        </p>
      </div>
    </PageShell>
  );
}
