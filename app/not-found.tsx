import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col items-center justify-center gap-3.5 px-10 text-center">
      <div className="rise-in text-[44px] font-extrabold tracking-[2px] text-[#dbe3f2]">404</div>
      <h1 className="rise-in-1 text-[17px] font-extrabold text-ink">이 집은 이사 갔어요</h1>
      <p className="rise-in-2 text-[13px] leading-[1.6] text-text-3">
        주소가 바뀌었거나 삭제된 페이지예요.
        <br />
        홈에서 다시 찾아볼까요?
      </p>
      <div className="rise-in-3 flex gap-2">
        <Link
          href="/"
          className="btn-primary btn-cta rounded-[14px] px-[22px] py-3 text-sm"
        >
          홈으로
        </Link>
        <Link
          href="/map"
          className="rounded-[14px] border border-[#e2e7ee] bg-surface px-[22px] py-3 text-sm font-bold text-text-1"
        >
          지도 열기
        </Link>
      </div>
      <div className="rise-in-4 mt-1 flex gap-1.5">
        <Link
          href="/search"
          className="rounded-full bg-primary-soft px-[13px] py-[7px] text-[11px] font-bold text-primary"
        >
          공작아파트 단지 홈
        </Link>
        <Link
          href="/notes"
          className="rounded-full bg-[#f2f4f8] px-[13px] py-[7px] text-[11px] font-bold text-text-1"
        >
          내 임장노트
        </Link>
      </div>
    </main>
  );
}
