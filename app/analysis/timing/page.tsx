import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
import {
  TEMPERATURE_REGIONS,
  computeRegionTemperature,
  currentYyyymm,
} from "@/lib/market/temperature";
import { TimingClient } from "./TimingClient";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* ── ISR 전환 (사용량 절감 13차, 2026-08-11) ────────────────────────────────
   예전에는 force-dynamic + ?region= 서버 재렌더(요청·지역 전환마다 함수 실행
   + 지수/거래량 쿼리)였다. 지역이 62개라 전량을 페이지에 실으면 재생성마다
   124회 쿼리가 되므로, auctions 선례의 삼분할을 쓴다:
   ① 기본 지역(첫 항목) 하나만 ISR 로 계산·프리렌더
   ② 지역 전환은 /api/timing?region= — 지역별 CDN 캐시(s-maxage 1800)
   ③ ?region/?complexId/?apt 는 TimingClient 가 마운트 후 location.search 로
   지수·월별 거래량 원천이라 10분(600초)이면 충분히 신선하고, 하위 로더가
   실패를 null/[] 로 삼키는 기존 설계(스냅샷 크론과 공유)라 실패 화면이
   생기더라도 이 주기 이상 눌러앉지 않는다. */
export const revalidate = 600;

/* N7 — ?region=·?complexId=·?apt= 조합마다 별개 URL 로 색인되지 않도록 canonical 을
   파라미터 없는 경로로 고정한다. 지역별 랜딩은 /region/[id] 가 따로 맡는다. */
export const metadata = buildPageMetadata({
  title: "시세·타이밍 분석 — 시장 온도와 거래량 추세",
  description:
    "지역 매매가격지수 추세·모멘텀, 월별 실거래 거래량, 시장 온도를 함께 봅니다. 모든 수치는 실측 자료로만 그리고, 없는 구간은 없다고 표시합니다.",
  path: "/analysis/timing",
});

/* ============================================================
   시세·타이밍 분석 — 전 구간 실데이터.
   예전의 하드코딩 사이클 그림·"매수 신호 62/100"은 제거했다 — 구체적인
   숫자는 실측처럼 읽히므로, 실측이 아니면 그리지 않는다.
   지역 목록·추세 판정·시장 온도 계산은 lib/market/temperature.ts 한 곳
   (이 화면·지역 전환 API·주간 스냅샷 크론이 같은 함수를 부른다).
   ============================================================ */
const REGION_OPTIONS = TEMPERATURE_REGIONS;

export default async function TimingPage() {
  const defaultRegion = REGION_OPTIONS[0];
  const { trend, volume, temp } = await computeRegionTemperature(defaultRegion);

  return (
    <PageShell breadcrumb="AI 분석 › 시세·타이밍">
      <TimingClient
        regions={REGION_OPTIONS.map((r) => ({ id: r.id, label: r.label }))}
        defaultRegionId={defaultRegion.id}
        initialData={{ trend, volume, temp }}
        builtYyyymm={currentYyyymm()}
      />

      {/* 15h-44 분석→행동: 결과 끝 다음 행동 카드 */}
      <div className="mt-5">
        <NextActions
          actions={[
            { label: "알림 기준 설정", href: "/notifications", primary: true },
            { label: "시나리오 확인", href: "/analysis/scenario" },
          ]}
        />
      </div>
    </PageShell>
  );
}
