import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* ============================================================
   /safety 메타데이터 홀더.

   page.tsx 가 "use client" 라 거기서는 metadata 를 내보낼 수 없다
   (Next 는 클라이언트 모듈의 metadata export 를 무시한다). 그래서
   서버 컴포넌트인 이 중첩 레이아웃에 메타데이터만 얹고 children 은
   그대로 통과시킨다. <html>/<body> 는 루트 레이아웃 소관이라 여기 없다.

   description 주의: 이 화면에는 자동 진단 엔진이 없다(page.tsx 상단 주석
   참고 — 결과를 지어내지 않고 체크리스트만 안내한다). 검색 결과에
   "위험도 진단" 처럼 쓰면 없는 기능을 파는 셈이라 "체크리스트" 로 적는다.
   ============================================================ */
export const metadata = buildPageMetadata({
  title: "전세 안전 체크리스트",
  description:
    "계약 전 직접 확인할 항목을 정리했습니다. 등기부·건축물대장·보증보험 등 무엇을 어디서 보는지 안내합니다.",
  path: "/safety",
});

export default function SafetyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
