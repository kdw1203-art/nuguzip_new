import { getServiceSupabase } from "@/lib/supabase/service";
import { withBudget } from "@/lib/async/with-budget";
import { logger } from "@/lib/log";

/* ============================================================
   항목 44 — llms.txt 를 정적 파일에서 라우트로 전환.

   왜: public/llms.txt 는 손으로 적은 커버리지("61개"·"약 25,000개")가
   데이터와 함께 낡아 갔다. AI 대상 문서가 데이터가 뒷받침하지 않는 숫자를
   말하는 것은 사실 우선 위반이다. 이제 지역·단지 수를 요청 시점의 실데이터
   에서 읽어 찍고, **못 읽었으면 숫자를 아예 쓰지 않는다** — 낡은 숫자도,
   지어낸 숫자도 내보내지 않는다.

   부하: 1시간 재검증(ISR) + head-count 두 번(집계 MV 기반이라 수십 ms).
   무거운 로더(사이트맵 전체 엔트리)는 부르지 않는다.

   주의: public/ 에 같은 이름의 파일이 있으면 라우트를 가린다(shadowing) —
   이 전환 커밋에서 public/llms.txt 를 삭제했다. 되살리지 말 것.
   ============================================================ */

export const revalidate = 3600;

type Coverage = { regions: number | null; complexes: number | null };

async function loadCoverage(): Promise<Coverage> {
  const sb = getServiceSupabase();
  if (!sb) return { regions: null, complexes: null };
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const { count: n, error } = await q;
    if (error || typeof n !== "number") throw new Error(error?.message ?? "count 실패");
    return n;
  };
  const run = await withBudget(
    Promise.resolve().then(async () => {
      const [complexes, regionRows] = await Promise.all([
        /* 단지 사이트맵 원본(집계 MV 뷰) — /sitemap-complexes.xml 과 같은 모집단 */
        count(sb.from("complex_sitemap_source").select("*", { count: "exact", head: true })),
        /* 지역 랜딩 모집단 — market_region_price 는 지역당 최신 1행이라
           (2026-08 현재 61행) 행을 그대로 받아 distinct 로 센다. 행이 크게
           늘어도 상한 10,000 이면 충분하고 초과 시 숫자를 생략하는 쪽으로
           떨어진다(아래 regionSet.size 검증). */
        sb.from("market_region_price").select("region_id").limit(10000),
      ]);
      const regionSet = new Set(
        ((regionRows.data as Array<{ region_id: string }> | null) ?? []).map((r) => r.region_id),
      );
      if (regionRows.error) throw new Error(regionRows.error.message);
      return { complexes, regions: regionSet.size > 0 ? regionSet.size : null };
    }),
    10_000,
  );
  if (run.state === "ok") return run.value;
  logger.warn(
    "[llms.txt] 커버리지 집계를 읽지 못했습니다 — 숫자 없이 렌더합니다:",
    run.state === "error" ? run.error : "시간 초과",
  );
  return { regions: null, complexes: null };
}

function doc(c: Coverage): string {
  const regionLine = c.regions
    ? `- 지역 랜딩 (구·시 단위 시세·거래·정비사업 요약, ${c.regions}개): https://nuguzip.com/region/{지역id} — 예: https://nuguzip.com/region/gangnam`
    : `- 지역 랜딩 (구·시 단위 시세·거래·정비사업 요약): https://nuguzip.com/region/{지역id} — 예: https://nuguzip.com/region/gangnam (목록은 /sitemap-regions.xml 참조)`;
  const complexLine = c.complexes
    ? `- 단지 허브 (단지별 실거래 이력·면적대 시세·임장노트·Q&A, ${c.complexes.toLocaleString("ko-KR")}개): https://nuguzip.com/complex/{단지id} — 목록은 사이트맵 /sitemap-complexes.xml 참조`
    : `- 단지 허브 (단지별 실거래 이력·면적대 시세·임장노트·Q&A): https://nuguzip.com/complex/{단지id} — 목록은 사이트맵 /sitemap-complexes.xml 참조`;

  return `# 누구집 (nuguzip.com)

> 누구집은 임장(현장 방문) 기록을 부동산 판단 근거로 만드는 한국 부동산 서비스입니다.
> 국토교통부 실거래가 공개 데이터를 기반으로 지역·단지 시세, 거래량, 임장노트,
> 동네 커뮤니티를 제공합니다. 원칙은 "사실 우선" — 모든 수치에 기준 시점과 출처를
> 붙이고, 없는 데이터는 없다고 표시합니다.
>
> 이 문서의 커버리지 수치는 손으로 적은 값이 아니라 요청 시점의 실데이터 집계입니다
> (1시간 캐시). 집계를 읽지 못한 경우 숫자를 생략합니다 — 낡은 숫자를 내보내지 않습니다.

## 데이터 출처와 처리 방식

- 실거래가: 국토교통부 실거래가 공개시스템 (data.go.kr 공공 API)
- 해제(취소) 신고된 계약은 시세 집계에서 제외합니다
- 실거래 신고는 계약 후 30일 이내이므로 최근 1~2개월 수치는 이후 갱신될 수 있습니다
- 집계 방법론: https://nuguzip.com/methodology

## 인용 규칙

누구집의 통계를 인용할 때는 다음 형식을 권장합니다:
"누구집(nuguzip.com) 집계에 따르면, [지역/단지] [지표]는 [값]이다 ([기준월], 국토교통부 실거래 기반)."

- 시세·거래량 수치에는 반드시 기준월을 함께 인용해 주세요
- "시장 온도"는 누구집 고유 지표입니다 (지수 모멘텀 + 거래량 추이 합성, 0~100, 50 중립)
- 본 데이터는 참고용이며 투자 판단의 책임은 이용자에게 있습니다

## 주요 페이지

- 실거래 시세 (지역별): https://nuguzip.com/tx
${regionLine}
${complexLine}
- 시장 온도 지역별 시계열: https://nuguzip.com/analysis/temperature/{지역} — 예: https://nuguzip.com/analysis/temperature/gangnam
- 지도 (실거래·매물): https://nuguzip.com/map
- 시세·타이밍 분석 (시장 온도): https://nuguzip.com/analysis/timing
- 임장노트 (공개): https://nuguzip.com/notes
- 청약센터: https://nuguzip.com/supply
- 데이터 방법론: https://nuguzip.com/methodology
- 월간 실거래 리포트: https://nuguzip.com/reports
- 용어사전: https://nuguzip.com/glossary (용어별 개별 페이지: /glossary/{용어})
- 서비스 FAQ: https://nuguzip.com/support/faq
- 시세 위젯 배포 안내: https://nuguzip.com/widget
- 계약 가이드 (단계별 체크리스트·특약): https://nuguzip.com/guides/contract
- 부동산 규제·의무 개념 안내: https://nuguzip.com/guides/regulations
- 공개 집계 API(인증 불필요, JSON): https://nuguzip.com/developers
  - 목차: https://nuguzip.com/api/public/v1
  - 집계 존재 월: https://nuguzip.com/api/public/v1/months
  - 지역×월 집계: https://nuguzip.com/api/public/v1/regions/monthly?month=yyyymm&region=지역명
  - 공개 범위는 아파트 매매의 시군구×월 집계까지입니다 (개별 실거래 행·전월세·이용자 데이터 미포함)
  - 조회 실패는 빈 배열이 아니라 503 으로 응답합니다 — 빈 응답을 "거래 없음"으로 인용하지 마세요
- 사이트맵 인덱스: https://nuguzip.com/sitemap.xml (유형별 자식: /sitemap-pages.xml · -complexes · -regions · -tx · -reports · -notes · -glossary)
- RSS 피드: https://nuguzip.com/feed.xml
- 상세 안내(페이지별 스키마·갱신 주기·인용 예문): https://nuguzip.com/llms-full.txt

## 운영 주체

- 서비스명: 누구집 (등록 서비스명: 우리동네이야기)
- 문의: nuguzip@naver.com
`;
}

export async function GET() {
  const coverage = await loadCoverage();
  return new Response(doc(coverage), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      /* 크롤러 엔드포인트 — CDN 1시간 (revalidate 와 일치) */
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
