import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { howToJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { BrokerageFeeCalc } from "../BrokerageFeeCalc";
import { CalculatorNav } from "../CalculatorNav";

/* [#55] HowTo — 아래 "이용 방법" 목록에 실제로 렌더되는 단계와 같은 배열로만
   JSON-LD 를 만든다(화면에 없는 단계를 스키마에만 넣는 것은 허위 표기). */
const HOWTO_STEPS = [
  { name: "거래 유형 선택", text: "매매·전세·월세 중 내 거래 유형을 고릅니다. 월세는 보증금과 월세를 함께 입력합니다." },
  { name: "거래 금액 입력", text: "매매가 또는 보증금(월세 포함 시 환산보증금 자동 계산)을 입력하면 거래금액 구간이 정해집니다." },
  { name: "법정 상한액 확인 후 협의", text: "구간별 상한요율과 한도액으로 계산된 법정 상한액을 확인하고, 그 이내에서 중개사와 협의합니다. 부가세는 별도입니다." },
];

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

        {/* [#55] 이용 방법 — HowTo JSON-LD 와 같은 배열에서 렌더 */}
        <section className="rise-in-2 mt-6">
          <h2 className="mb-2 text-[13px] font-extrabold text-ink">이용 방법</h2>
          <ol className="flex list-none flex-col gap-2 p-0">
            {HOWTO_STEPS.map((s, i) => (
              <li key={s.name} className="card flex gap-3 rounded-xl px-4 py-3">
                <span className="text-[13px] font-extrabold tabular-nums text-primary">{i + 1}</span>
                <div>
                  <div className="text-[13px] font-bold text-ink">{s.name}</div>
                  <p className="mt-0.5 text-[13px] leading-[1.7] text-text-2">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript([
              howToJsonLd({
                name: "부동산 중개보수(중개수수료) 계산하는 방법",
                description: "법정 상한요율표로 매매·전세·월세 중개보수 상한액을 계산하는 3단계.",
                path: "/calculator/brokerage",
                steps: HOWTO_STEPS,
              }),
            ]),
          }}
        />
      </div>
    </PageShell>
  );
}
