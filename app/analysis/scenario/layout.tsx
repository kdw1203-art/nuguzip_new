import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata = buildPageMetadata({
  title: "시나리오 계산 예시",
  description: "데모용 시나리오 계산기입니다. 예시 시세를 기본값으로 씁니다.",
  path: "/analysis/scenario",
  noIndex: true,
});

export default function ScenarioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
