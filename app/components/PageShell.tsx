import { Header } from "./Header";
import { TabBar } from "./TabBar";

/** 공통 페이지 셸 — 글래스 헤더 + 본문 컨테이너 + 모바일 탭바 */
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
      <main
        className={`mx-auto w-full flex-1 px-5 pb-32 pt-5 md:pb-16 ${
          wide ? "max-w-[1400px]" : "max-w-[1240px]"
        }`}
      >
        {breadcrumb && (
          <div className="mb-2 text-[13px] text-text-3">{breadcrumb}</div>
        )}
        {title && (
          <h1 className="rise-in mb-4 text-[21px] font-extrabold leading-[1.35] text-ink">
            {title}
          </h1>
        )}
        {children}
      </main>
      <TabBar />
    </>
  );
}
