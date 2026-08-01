import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata = buildPageMetadata({
  title: "AI 제안가 예시",
  description: "데모용 예시 화면입니다. 실시세·실거래와 무관합니다.",
  path: "/analysis/price",
  noIndex: true,
});

export default function PriceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
