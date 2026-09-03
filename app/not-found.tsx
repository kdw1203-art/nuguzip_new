import Link from "next/link";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 최적화 10 — 404 화면의 <title> 이 홈과 글자 하나까지 같았다. 주소를 잘못
   눌러 404 로 떨어져도 탭·방문 기록에는 "내집나우 — 임장 기록이 판단 근거가
   됩니다" 로 남아서, 나중에 기록을 되짚을 때 홈에 다녀온 것처럼 보였다.
   (not-found.tsx 에서 metadata export 가 먹는지는 문서로 믿지 않고 빌드
   산출물 _not-found.html 을 열어 확인했다 — 먹는다.)

   noIndex 는 **일부러 빼 뒀다**. 넣었더니 같은 문서에 robots 메타가 두 개
   나왔다(Next 가 404 에 자동으로 붙이는 `noindex` + 내 `noindex, nofollow`).
   색인 차단은 어차피 Next 쪽이 이미 하고 있고, 겹쳐 봐야 서로 다른 값 두 개를
   내보내는 것뿐이다. 게다가 남는 `noindex`(follow 허용) 쪽이 404 에는 더 맞다 —
   크롤러가 이 화면의 "홈으로" 링크는 따라가는 편이 낫다. */
export const metadata = buildPageMetadata({
  title: "페이지를 찾을 수 없어요",
  description: "주소가 바뀌었거나 삭제된 페이지입니다.",
});

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col items-center justify-center gap-3.5 px-10 text-center">
      <div className="rise-in text-[36px] font-extrabold tracking-[2px] md:text-[44px] text-on-dark-muted">404</div>
      <h1 className="rise-in-1 text-[15px] font-extrabold text-ink">이 집은 이사 갔어요</h1>
      <p className="rise-in-2 text-[13px] leading-[1.6] text-text-3">
        주소가 바뀌었거나 삭제된 페이지예요.
        <br />
        홈에서 다시 찾아볼까요?
      </p>
      <div className="rise-in-3 flex gap-2">
        <Link
          href="/"
          className="btn-primary btn-cta rounded-[14px] px-[22px] py-3 text-[13px]"
        >
          홈으로
        </Link>
        <Link
          href="/map"
          className="rounded-[14px] border border-line bg-surface px-[22px] py-3 text-[13px] font-bold text-text-1"
        >
          지도 열기
        </Link>
      </div>
      <div className="rise-in-4 mt-1 flex gap-1.5">
        {/* 사실 우선: 라벨이 "공작아파트 단지 홈"이었다 — 링크는 /search 로 가는데
            존재하지 않는 특정 단지를 가리키는 것처럼 읽혔다. 하는 일 그대로 쓴다. */}
        <Link
          href="/search"
          className="rounded-full bg-primary-soft px-[13px] py-[7px] text-[12px] font-bold text-primary"
        >
          단지 검색
        </Link>
        <Link
          href="/notes"
          className="rounded-full bg-bg px-[13px] py-[7px] text-[12px] font-bold text-text-1"
        >
          내 임장노트
        </Link>
        {/* 고도화 46 — 잘못 들어온 방문자·크롤러의 최다 목적지 2곳 추가 */}
        <Link
          href="/tx"
          className="rounded-full bg-bg px-[13px] py-[7px] text-[12px] font-bold text-text-1"
        >
          실거래 시세
        </Link>
        <Link
          href="/town"
          className="rounded-full bg-bg px-[13px] py-[7px] text-[12px] font-bold text-text-1"
        >
          동네이야기
        </Link>
      </div>
    </main>
  );
}
