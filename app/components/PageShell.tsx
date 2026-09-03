import { Header } from "./Header";
import { TabBar } from "./TabBar";
import { Footer } from "./Footer";

/** 공통 페이지 셸 — 글래스 헤더 + 본문 컨테이너 + 공통 푸터 + 모바일 탭바 */
export function PageShell({
  children,
  title,
  breadcrumb,
  wide = false,
}: {
  children: React.ReactNode;
  title?: string;
  breadcrumb?: string;
  wide?: boolean;
}) {
  return (
    <>
      <Header />
      {/* 모바일 화면 패딩 14px — 2026-08-03 2차 축소(요소 ~90%·글자 유지) */}
      {/* data-autotrim — 내용이 없어진 블록이 자리를 차지하지 않게 한다.
          규칙은 globals.css 3.5 절. */}
      <main
        id="main-content"
        data-autotrim=""
        className={`mx-auto w-full flex-1 px-3.5 pb-32 pt-3.5 md:px-5 md:pb-16 md:pt-5 ${
          wide ? "max-w-[1400px]" : "max-w-[1240px]"
        }`}
      >
        {breadcrumb && (
          <div className="mb-2 t-sub text-text-3">{breadcrumb}</div>
        )}
        {title && (
          <h1 className="rise-in mb-3.5 t-title text-ink md:mb-4">
            {title}
          </h1>
        )}
        {children}
      </main>
      <Footer />
      <TabBar />
    </>
  );
}
