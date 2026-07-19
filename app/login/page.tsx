import Link from "next/link";
import { Logo } from "@/app/components/Logo";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-7 pb-8 pt-5">
      <div className="flex justify-end">
        <Link href="/" className="text-[17px] text-text-3" aria-label="닫기">
          ✕
        </Link>
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-3.5">
        <div className="rise-in">
          <Logo size={34} />
        </div>
        <h1 className="rise-in-1 text-[22px] font-extrabold leading-[1.35] text-ink">
          방금 쓴 노트,
          <br />
          잃어버리지 않게 저장할게요
        </h1>
        <p className="rise-in-2 text-sm text-text-2">3초 로그인 — 작성한 내용은 그대로 유지됩니다</p>

        <div className="rise-in-3 card flex items-center gap-2.5 rounded-[14px] px-4 py-3.5">
          <span className="text-[13px]">📝</span>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-ink">공작아파트 302동 · 오늘</div>
            <div className="text-[11px] text-text-3">체크 6항목 · 사진 4장 · 고려사항 2건</div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="rise-in-4 flex flex-col gap-2.5">
          <button
            type="button"
            className="rounded-[14px] bg-[#fee500] p-3.5 text-center text-[15px] font-bold text-[#191919]"
          >
            카카오로 3초 만에 시작
          </button>
          <button
            type="button"
            className="rounded-[14px] bg-[#03c75a] p-3.5 text-center text-[15px] font-bold text-white"
          >
            네이버로 시작
          </button>
          <button
            type="button"
            className="rounded-[14px] border border-[#e2e7ee] bg-surface p-3.5 text-center text-[15px] font-bold text-text-1"
          >
            Apple로 시작
          </button>
        </div>
        <div className="rise-in-5 text-center text-xs text-[#adb5bd]">
          처음이신가요?{" "}
          <Link href="/signup" className="font-bold text-primary">
            회원가입 온보딩
          </Link>
        </div>
        <p className="text-center text-[11px] leading-[1.6] text-[#adb5bd]">
          시작하면 이용약관·개인정보처리방침에 동의하게 됩니다
        </p>
      </div>
    </main>
  );
}
