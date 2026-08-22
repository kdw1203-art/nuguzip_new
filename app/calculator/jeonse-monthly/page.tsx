import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { JeonseWolse } from "../realestate-tools";
import { CalculatorNav } from "../CalculatorNav";

/* [개선 #6] 전월세 전환 계산기 — 검색 랜딩 (기존 도구 재사용, 로직 단일 출처). */

export const metadata = buildPageMetadata({
  title: "전월세 전환 계산기 — 전세↔월세 환산",
  description:
    "전세 보증금을 월세로, 월세를 전세로 환산합니다. 전월세 전환율을 직접 조정해 우리 집 조건으로 계산해 보세요.",
  path: "/calculator/jeonse-monthly",
  og: { badge: "계산기", sub: "전세 ↔ 월세 환산 · 전환율 조정" },
});

export const revalidate = 86400;

export default function JeonseMonthlyCalculatorPage() {
  return (
    <PageShell breadcrumb="투자 도구 › 전월세 전환 계산기" title="전월세 전환 계산기">
      <div className="mx-auto w-full max-w-[640px]">
        <CalculatorNav current="/calculator/jeonse-monthly" />
        <p className="rise-in mb-4 text-[13px] leading-[1.75] text-text-2">
          전세와 월세 조건을 같은 저울에 올리는 계산기예요. 보증금을 낮추는 대신
          월세를 얼마나 내는 게 손해가 아닌지, <b className="text-ink">전환율</b>을
          바꿔 가며 비교해 보세요.
        </p>
        <div className="rise-in-1">
          <JeonseWolse />
        </div>
      </div>
    </PageShell>
  );
}
