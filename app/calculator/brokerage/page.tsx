import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { BrokerageFeeCalc } from "../BrokerageFeeCalc";
import { CalculatorNav } from "../CalculatorNav";

/* [개선 #6] 중개보수 계산기 — 검색 랜딩.
   "중개수수료 계산"은 거래 직전마다 반복되는 검색 수요인데 우리 계산기는
   /calculator 한 장에 뭉쳐 있었다. 법정 상한요율표 전문과 함께 독립 랜딩으로. */

export const metadata = buildPageMetadata({
  title: "부동산 중개보수(중개수수료) 계산기",
  description:
    "매매·전세·월세 중개수수료 상한을 법정 요율표로 계산합니다. 거래금액 구간별 상한요율·한도액, 오피스텔·상가 요율까지 한 화면에.",
  path: "/calculator/brokerage",
  og: { badge: "계산기", sub: "법정 상한요율표 기준 · 매매·전세·월세" },
});

export const revalidate = 86400; // 법정 요율 — 하루 한 번이면 충분

export default function BrokerageCalculatorPage() {
  return (
    <PageShell breadcrumb="투자 도구 › 중개보수 계산기" title="중개보수 계산기">
      <div className="mx-auto w-full max-w-[640px]">
        <CalculatorNav current="/calculator/brokerage" />
        <p className="rise-in mb-4 text-[13px] leading-[1.75] text-text-2">
          중개보수는 <b className="text-ink">법으로 정한 상한요율 이내에서 협의</b>로
          정합니다. 매매가나 보증금·월세를 넣으면 내 거래의 법정 상한액이 바로
          나와요 — 협의의 출발점으로 쓰세요.
        </p>
        <div className="rise-in-1">
          <BrokerageFeeCalc />
        </div>
      </div>
    </PageShell>
  );
}
