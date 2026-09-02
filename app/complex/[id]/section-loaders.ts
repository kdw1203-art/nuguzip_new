import "server-only";
import { cache } from "react";
import { getComplexRentHistoryByNames } from "@/lib/market/complex-rent";
import { listQuestionsForComplex } from "@/lib/qna/store";
import { listProjects } from "@/lib/redevelopment/store";
import { getAreaBands, getRegionRelative } from "@/lib/complex/complex-store";
import { getSupplyForAreaStrict } from "@/lib/market/supply";
import { buildLiveToolContextCached } from "@/lib/ai/live-context";
import { unstable_cache } from "next/cache";

/* [949 · 대규모 최적화] 단지 허브 곁다리 섹션의 조회를 **한 곳에서 React cache() 로
   감싼다** — 그래야 페이지 본문이 대표행을 받는 순간 미리 불을 붙여 두고(prefetch),
   섹션 컴포넌트가 같은 인자로 다시 부르면 이미 돌고 있는 약속을 그대로 받는다.

   왜 필요한가(실측 2026-09-02): 단지 콜드 렌더는 ①대표행 → ②대장 enrich →
   ③곁다리 5종 → (본문 확정 뒤) ④섹션 컴포넌트 7종 순으로 **네 파도**였다.
   ④는 ③이 끝나야 시작되는데 내용은 ①만 있으면 시작할 수 있는 것들이다
   (전월세 이력·Q&A·정비사업·면적대·지역 대비·입주물량·축 요약). 여기서 ④를 ③과
   같은 파도로 당긴다. 실사용 web_vitals 14일: /complex TTFB p75 1.42s, LCP p75 3.24s —
   ISR 미스는 스트리밍 없이 전체 렌더가 끝나야 첫 바이트가 나가므로 파도 수가
   곧 TTFB 다.

   규칙: 섹션 컴포넌트는 반드시 **여기 로더를 같은 인자로** 불러야 dedupe 가 된다.
   인자가 다르면 조용히 두 번 조회한다(틀리진 않지만 이득이 사라진다). 그래서
   지역 문자열 같은 파생 인자는 아래 헬퍼로만 만든다. */

/** ComplexRentSection·ComplexQna 가 쓰는 지역 문자열 — 본문 v.city/v.dong 과 같은 규칙. */
export function sectionRegionLabel(city: string | null | undefined, district: string | null | undefined): string {
  const dong = district || city || "지역";
  return `${city ?? ""} ${dong}`.trim();
}

/** ComplexAxisSummary 가 쓰는 지역명 — dec.region 포맷("서울 중랑구"), city===dong 중복 방어. */
export function axisRegionName(city: string | null | undefined, dong: string | null | undefined): string {
  return city && dong && city !== dong ? `${city} ${dong}` : (city ?? dong ?? "");
}

export const loadRentHistory = cache((region: string, name: string) =>
  getComplexRentHistoryByNames(region, name),
);

export const loadComplexQuestions = cache((name: string) => listQuestionsForComplex(name, 5));

export const loadRedevelopment = cache((sigungu: string) =>
  listProjects({ sigungu, limit: 6 }),
);

export const loadAreaBands = cache((complexId: string) => getAreaBands(complexId));

export const loadRegionRelative = cache((complexId: string) => getRegionRelative(complexId));

/* 입주물량은 지역 키 데이터 캐시(948) 위에 요청 내 dedupe 를 한 겹 더 얹는다. */
const loadSupplyDataCached = unstable_cache(
  (area: string) => getSupplyForAreaStrict(area, 24),
  ["upcoming-supply-v1"],
  { revalidate: 21_600, tags: ["supply"] },
);
export const loadUpcomingSupply = cache((area: string) => loadSupplyDataCached(area));

export const loadAxisContext = cache((complexId: string, regionName: string) =>
  buildLiveToolContextCached(complexId, regionName || null),
);

/**
 * 본문 로더가 대표행을 받은 직후 부른다. 결과는 기다리지 않는다 — 섹션이 같은
 * 로더를 부를 때 이미 돌고 있는 약속을 받는다. 거절은 여기서 표식만 남긴다
 * (unhandled rejection 방지); 실제 실패 처리는 섹션 컴포넌트가 예전처럼 한다.
 */
const swallow = (p: Promise<unknown>) => {
  void p.catch(() => undefined);
};

export function prefetchComplexSections(args: {
  /** URL 의 순수 id — 면적대·지역 대비가 쓰는 키 */
  complexId: string;
  name: string;
  city: string | null;
  district: string | null;
}): void {
  const region = sectionRegionLabel(args.city, args.district);
  const dong = args.district || args.city || "지역";
  swallow(loadRentHistory(region, args.name));
  swallow(loadComplexQuestions(args.name.trim()));
  swallow(loadRedevelopment(dong.trim()));
  swallow(loadAreaBands(args.complexId));
  swallow(loadRegionRelative(args.complexId));
  swallow(loadUpcomingSupply(dong.trim()));
}

/** 축 요약은 enrich 가 끝난 뒤의 id(kapt 매칭 시 kapt 형태)를 키로 쓴다 — 따로 띄운다. */
export function prefetchAxisSummary(args: {
  rowId: string;
  city: string | null;
  district: string | null;
}): void {
  const dong = args.district || args.city || "지역";
  swallow(loadAxisContext(args.rowId, axisRegionName(args.city, dong)));
}
