import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { RentalYield } from "../realestate-tools";
import { CalculatorNav } from "../CalculatorNav";

/* [개선 #6] 임대수익률 계산기 — 검색 랜딩 (기존 도구 재사용, 로직 단일 출처). */

export const metadata = buildPageMetadata({
  title: "임대수익률 계산기",
  description:
    "매매가·보증금·월세로 연 임대수익률을 계산합니다. 대출 없이 순수 자기자본 기준의 수익률을 빠르게 확인해 보세요.",
  path: "/calculator/rental-yield",
  og: { badge: "계산기", sub: "실투자금 기준 연 수익률" },
});

export const revalidate = 86400;

export default function RentalYieldCalculatorPage() {
  return (
    <PageShell breadcrumb="투자 도구 › 임대수익률 계산기" title="임대수익률 계산기">
      <div className="mx-auto w-full max-w-[640px]">
        <CalculatorNav current="/calculator/rental-yield" />
        <p className="rise-in mb-4 text-[13px] leading-[1.75] text-text-2">
          월세 물건의 수익률은 <b className="text-ink">(연 월세 수입) ÷ (실투자금)</b>
          으로 봅니다. 매매가에서 보증금을 뺀 실투자금 기준이라, 보증금 비중이
          큰 물건일수록 수익률이 다르게 보여요.
        </p>
        <div className="rise-in-1">
          <RentalYield />
        </div>
      </div>
    </PageShell>
  );
}
