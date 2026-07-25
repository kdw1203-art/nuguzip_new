import type { Metadata } from "next";
import Link from "next/link";
import { RetryButton } from "./RetryButton";

/**
 * G9 — 오프라인 폴백.
 *
 * 서비스워커가 install 시점에 이 문서를 미리 받아 두었다가, 네트워크가 끊긴 상태의
 * 페이지 이동에서 크롬 공룡 화면 대신 이 화면을 돌려준다.
 *
 * 여기에 시세·매물·노트 같은 **데이터는 절대 넣지 않는다**. 캐시된 부동산 숫자는
 * 언제 찍힌 값인지 알 수 없고, 오래된 시세를 지금 값처럼 보여주는 건 이 서비스에서
 * 가장 하면 안 되는 일이다. 그래서 이 페이지는 데이터 조회가 하나도 없는 정적
 * 문서이며, 캐시하는 것도 이 문서 하나뿐이다.
 */
export const metadata: Metadata = {
  title: "오프라인 — 누구집",
  description: "인터넷 연결이 끊겼습니다.",
  robots: { index: false, follow: false },
};

/* 데이터가 없으니 재검증할 것도 없다 — 빌드 시 한 번 만들고 정적으로 서빙 */
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-[70vh] w-full max-w-[420px] flex-col items-center justify-center gap-5 px-6 text-center"
    >
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-3xl"
      >
        📡
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-[20px] font-extrabold text-slate-900">
          인터넷에 연결되어 있지 않아요
        </h1>
        <p className="text-[14px] leading-relaxed text-slate-500">
          누구집은 시세·실거래를 항상 최신으로 보여주기 위해 오프라인에서는 데이터를
          저장해 두지 않습니다. 연결이 돌아오면 그대로 이어서 볼 수 있어요.
        </p>
      </div>

      <RetryButton />

      <Link
        href="/"
        className="text-[13px] font-semibold text-[#1d4fd8] underline underline-offset-4"
      >
        홈으로 가기
      </Link>
    </main>
  );
}
