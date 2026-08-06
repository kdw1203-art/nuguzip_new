import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* ============================================================
   사이클 전망 — 전망 모델이 없으므로 전망 그림을 그리지 않는다.

   이전 화면에는 "공작아파트 84㎡"라는 특정 단지를 걸어놓고 팬차트가 있었다.
   그 곡선(적극적/기준/보수적)의 좌표는 전부 손으로 찍은 path 문자열이었고,
   "10.4억 +24%", "3년 기대값 9.2억 (+9.5%)", "기준 시나리오 확률 55%,
   적극 25%, 보수 20%" 같은 값도 어떤 모델에서도 나온 적이 없다. 확률은
   특히 위험하다 — 근거 없이 적어도 계산된 수치처럼 읽힌다.
   1년/3년/5년/10년 탭은 계산을 다시 하는 게 아니라 미리 적어둔 네 벌의
   문자열 뭉치를 바꿔 끼울 뿐이어서, 조작 가능한 컨트롤처럼 보인 것도 거짓이었다.
   우측 하단에는 점선 상자 안에 "AD / AdSense 320×72" 라고 적힌 디자인 시안
   잔재까지 그대로 배포되고 있었다(AdSlot 은 서버 컴포넌트라 이 화면에서
   대체 렌더할 수도 없고, AdSlot 자체가 채울 광고가 없으면 빈 상자를 남기지
   않는다는 방침이므로 자리째 삭제한다).

   같은 판단으로 /analysis/timing 은 이미 하드코딩 사이클 그림을 걷어내고
   실측 지수·거래량만 그린다. 이 화면도 실측이 붙기 전까지는 비워두고,
   실제 데이터가 있는 그 화면으로 보낸다.

   시나리오 "가정"만 남긴다 — 금리·공급 같은 조건이 시나리오를 어떻게
   가르는지에 대한 설명이고, 특정 단지의 가격을 주장하지 않는다.
   상태(useState)가 사라져 "use client" 도 필요 없어졌다.
   ============================================================ */

const SCENARIO_ASSUMPTIONS = [
  { name: "적극적", tone: "text-danger", cond: "금리 인하 · 정비사업 가시화 · 공급 부족" },
  { name: "기준", tone: "text-primary", cond: "금리 동결 · 과거 사이클 평균 회복" },
  { name: "보수적", tone: "text-text-3", cond: "금리 인상 · 입주 물량 증가" },
] as const;

/* 최적화 10 — 이 화면의 <title> 이 홈과 **글자 하나까지 같았다**
   ("누구집 — 임장 기록이 판단 근거가 됩니다"). 오늘 실측: 프리렌더된
   108개 페이지 중 14개가 이 제목을 공유했고, 그중 홈만 맞는 제목이었다.
   같은 제목이 여러 URL 에 걸리면 검색 결과에서 어느 게 뭔지 구분되지 않고,
   브라우저 탭·북마크·방문 기록도 전부 "홈"으로 보인다.

   noIndex 를 같이 거는 이유는 SEO 기교가 아니라 사실 우선이다. 이 화면의
   본문은 전부 "가격 전망 그래프는 아직 없어요" 다. 색인되면 검색 결과에
   "사이클 전망 | 누구집" 이라는 제목만 뜨고, 눌러서 들어온 사람은 없는
   기능을 만난다 — 검색 결과 한 줄이 곧 빈 약속이 된다. 전망 모델이 실제로
   붙는 날 noIndex 를 떼면 된다. */
export const metadata = buildPageMetadata({
  title: "사이클 전망",
  description: "가격 사이클 전망 모델은 아직 준비 중입니다. 지금은 지역 시세와 임장노트로 판단 근거를 모을 수 있어요.",
  path: "/analysis/cycle",
  noIndex: true,
});

export default function CyclePage() {
  return (
    <PageShell breadcrumb="AI 분석 › 시세·타이밍 › 사이클 전망">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">사이클 전망</h1>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rise-in-1">
          <EmptyState
            icon="bar"
            title="가격 전망 그래프는 아직 없어요"
            desc="상승·기준·하락 시나리오별 경로와 확률은 시장 데이터로 추정하는 모델이 있어야 그릴 수 있어요. 그 모델이 아직 없어서 전망 곡선이나 목표가·확률을 지어내지 않습니다. 대신 실제로 집계된 매매가격지수 추세와 거래량은 시세·타이밍에서 볼 수 있어요."
            action={{ label: "실데이터 시세·타이밍 보기", href: "/analysis/timing" }}
          />
        </div>

        {/* 숫자 없는 정성적 설명 — 어떤 조건이 시나리오를 가르는지에 대한 안내라 남긴다 */}
        <div className="rise-in-2 card flex flex-col gap-2 rounded-[18px] p-[18px]">
          <div className="text-[13px] font-extrabold text-ink">
            시나리오는 이런 조건으로 갈립니다{" "}
            <span className="text-[11px] font-medium text-text-3">일반 설명 · 전망치 아님</span>
          </div>
          {SCENARIO_ASSUMPTIONS.map((s, i) => (
            <div
              key={s.name}
              className={`flex justify-between gap-3 py-[7px] text-xs ${
                i < SCENARIO_ASSUMPTIONS.length - 1 ? "border-b border-[#f0f3f8]" : ""
              }`}
            >
              <span className={`shrink-0 font-bold ${s.tone}`}>{s.name}</span>
              <span className="text-right text-text-2">{s.cond}</span>
            </div>
          ))}
          <div className="text-[10px] leading-[1.5] text-text-3">
            어느 시나리오가 얼마나 유력한지는 판단하지 않습니다. 본 안내는 참고용이며 투자
            판단의 책임은 이용자에게 있습니다.
          </div>
        </div>

        {/* 15h-44 분석→행동: 결과 끝 다음 행동 카드 */}
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
