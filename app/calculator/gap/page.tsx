import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { GapRatio } from "../realestate-tools";
import { CalculatorNav } from "../CalculatorNav";

/* [개선 #6] 갭·전세가율 계산기 — 검색 랜딩 (기존 도구 재사용, 로직 단일 출처). */

export const metadata = buildPageMetadata({
  title: "갭투자·전세가율 계산기",
  description:
    "매매가와 전세가로 갭(실투자금)과 전세가율을 계산합니다. 전세가율이 높을수록 적은 돈으로 사는 대신 역전세 위험도 커집니다.",
  path: "/calculator/gap",
  og: { badge: "계산기", sub: "갭(실투자금)과 전세가율을 한 번에" },
});

export const revalidate = 86400;

export default function GapCalculatorPage() {
  return (
    <PageShell breadcrumb="투자 도구 › 갭·전세가율 계산기" title="갭·전세가율 계산기">
      <div className="mx-auto w-full max-w-[640px]">
        <CalculatorNav current="/calculator/gap" />
        <p className="rise-in mb-4 text-[13px] leading-[1.75] text-text-2">
          매매가에서 전세가를 뺀 것이 <b className="text-ink">갭(실투자금)</b>,
          매매가 대비 전세가의 비율이 <b className="text-ink">전세가율</b>이에요.
          갭이 작을수록 진입은 쉽지만, 전세가가 빠지면 그만큼 돌려막을 돈이
          필요해집니다 — 두 숫자를 같이 보세요.
        </p>
        <div className="rise-in-1">
          <GapRatio />
        </div>
      </div>
    </PageShell>
  );
}
