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
      {/* 모바일 화면 패딩 20→16px — 타이포 축소와 비례(글자만 줄이면 성겨 보인다) */}
      <main
        id="main-content"
        className={`mx-auto w-full flex-1 px-4 pb-32 pt-4 md:px-5 md:pb-16 md:pt-5 ${
          wide ? "max-w-[1400px]" : "max-w-[1240px]"
        }`}
      >
        {breadcrumb && (
          <div className="mb-2 text-[13px] text-text-3">{breadcrumb}</div>
        )}
        {title && (
          <h1 className="rise-in mb-4 text-[19px] font-extrabold leading-[1.35] text-ink md:text-[21px]">
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
