import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 항목 46b — 이 페이지("use client")는 루트 레이아웃의 제목·설명을 그대로
   상속해 검색 결과에 홈과 같은 문구로 떴다. 세그먼트 레이아웃에서 개별
   메타데이터를 준다(/analysis/price 와 같은 방식). */
export const metadata = buildPageMetadata({
  title: "단지 비교 트레이",
  description:
    "관심 단지를 담아 실거래가·거래량·안전 지표를 나란히 비교하세요. 지도를 보다가 담은 단지가 여기 모입니다.",
  path: "/analysis/compare",
});

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
