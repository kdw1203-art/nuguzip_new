import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { ExampleBadge } from "@/app/components/ExampleBadge";
import { Icon } from "@/app/components/Icon";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* P0-5 목업 정직화: 자산 등록은 예시 화면 — 저장·자동 시세 등 실기능 미연동을
   명시하고 죽은 버튼을 정직한 상태로 교체 */

const REPAY_STATS = [
  { label: "남은 대출금", value: "2.1억", tone: "text-ink" },
  { label: "납부한 이자 누계", value: "6,240만", tone: "text-danger" },
  { label: "남은 원리금 총액", value: "2.62억", tone: "text-ink" },
  { label: "월 상환액 (잔여 23년)", value: "98만원", tone: "text-ink" },
] as const;

/* 2026-07-27: 여기 로컬 Chip 컴포넌트가 있었다. 앱의 진짜 필터 칩과 똑같은 모양에
   파란 선택 상태(active)까지 칠했지만, 이 페이지는 상태가 없는 서버 컴포넌트라
   active 는 하드코딩된 값이었고 눌러도 영원히 아무 일도 일어나지 않았다.
   상단 "예시 화면" 배너는 숫자가 가상이라는 것만 알려 줄 뿐, 고를 수 있는 것처럼
   생긴 칩까지 변명해 주지는 않는다. 그래서 칩을 걷어내고, 이 카드가 이미 쓰고 있는
   "라벨 / 값" 행으로 통일했다 — 고를 수 없는 값은 고를 수 있게 생기면 안 된다. */

/** 예시 값 한 줄 (라벨 / 값) — 카드 내 다른 행과 동일한 정적 표기 */
function ExampleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-text-2">{label}</span>
      <span className="font-extrabold text-ink">{value}</span>
    </div>
  );
}

/* 최적화 10 — 홈과 같은 제목을 달고 있던 화면(analysis/cycle/page.tsx 주석 참고).
   여긴 noIndex 근거가 하나 더 있다: 이 화면은 <ExampleBadge/> 가 붙은 **예시
   화면**이고, 화면의 숫자(남은 대출금 2.1억, 납부 이자 6,240만 …)는 누구의
   것도 아니다. 색인되면 검색 결과에서 "자산 등록"으로 들어온 사람이 남의 것도
   자기 것도 아닌 숫자를 만난다 — 배지는 화면 안에서만 보이지 검색 결과에는
   안 따라간다. 실제 저장이 붙는 날 배지와 함께 noIndex 를 뗀다. */
export const metadata = buildPageMetadata({
  title: "자산 등록",
  description: "보유 자산과 대출을 등록하는 화면입니다. 현재는 예시 화면이며 저장·자동 시세는 연동되지 않았습니다.",
  path: "/my/assets",
  noIndex: true,
});

export default function AssetsPage() {
  return (
    <PageShell breadcrumb="마이 › 자산 등록">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3">
        <div className="rise-in flex items-center justify-between">
          <Link href="/my" className="text-base text-text-1" aria-label="닫기">
            ✕
          </Link>
          <h1 className="flex items-center gap-1.5 text-[15px] font-extrabold text-ink">
            자산 등록 <ExampleBadge />
          </h1>
          {/* 저장 API 미연동 — 가짜 저장 버튼 대신 정직한 표기 */}
          <span className="text-[13px] font-bold text-text-3">준비 중</span>
        </div>

        <div className="rise-in flex items-start gap-1.5 rounded-xl bg-[rgba(29,79,216,.06)] px-3.5 py-2.5 text-[11px] leading-[1.6] text-[#5b74b8]">
          <span>
            아래는 자산 등록 기능의 <b>예시 화면</b>이에요. 단지·금액은 가상의
            데이터이며 저장·자동 시세 연동은 준비 중입니다.{" "}
            {/* "오픈 소식은 알림으로 받아보세요" 였다 — /notifications 에는 기능 오픈
                알림 구독이 없어서 지키지 못할 약속이었다. 그 화면이 실제로 해 주는
                일(관심 지역·키워드 구독)로 문구를 맞춘다. */}
            <Link href="/notifications" className="font-bold text-primary underline">
              알림 센터
            </Link>
            에서 관심 지역·키워드 알림을 먼저 설정해 둘 수 있어요.
          </span>
        </div>

        {/* 끝의 `›` 를 뺐다 — 앱 전체에서 `›` 로 끝나는 카드 행은 눌러서 이동하는
            패턴인데 이건 Link 도 onClick 도 없는 <div> 였다. 이동할 곳이 없으면
            이동한다는 표시도 없어야 한다. */}
        <div className="rise-in-1 card flex items-center gap-2 rounded-[14px] px-3.5 py-3">
          <Icon name="🏠" size={16} className="shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-bold text-ink">평촌 초원마을 6단지 512동</div>
            <div className="text-[11px] text-text-3">주소 검색 자동 인식 · 59㎡</div>
          </div>
        </div>

        <div className="rise-in-2 card flex flex-col gap-2.5 rounded-2xl p-4">
          <ExampleRow label="형태" value="실거주" />
          <div className="flex justify-between border-t border-[#f0f3f8] pt-2 text-[13px]">
            <span className="text-text-2">취득 시기 / 취득가</span>
            <span className="font-extrabold text-ink">2019.05 · 4.9억</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-text-2">
              현재 시세 <span className="text-[10px] text-primary">자동</span>
            </span>
            <span className="font-extrabold text-ink">
              6.8억 <span className="text-[11px] text-primary">▼1.8%</span>
            </span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-text-2">대출 은행 / 상품</span>
            {/* `▾` 를 뗐다 — 펼쳐지는 선택기처럼 읽혔지만 select 도 버튼도 아닌 그냥 글자였다. */}
            <span className="font-extrabold text-ink">K은행 주담대 (변동)</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-text-2">최초 대출금 / 금리</span>
            <span className="font-extrabold text-ink">2.9억 · 3.8%</span>
          </div>
        </div>

        <div className="rise-in-3 card flex flex-col gap-2.5 rounded-2xl p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-extrabold text-ink">
              대출 상환 현황 <span className="text-[10px] font-bold text-primary">자동 계산</span>
            </span>
            <span className="text-[11px] text-text-3">2019.06 ~ · 87회차</span>
          </div>
          <div className="flex flex-col gap-[5px]">
            <div className="flex justify-between text-[11px]">
              <span className="text-text-3">상환 진행률</span>
              <span className="font-extrabold text-primary">28% (0.8억 상환)</span>
            </div>
            <div className="relative h-1.5 rounded-[3px] bg-[#eef1f6]">
              <div className="absolute left-0 top-0 h-1.5 w-[28%] rounded-[3px] bg-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {REPAY_STATS.map((s) => (
              <div key={s.label} className="rounded-[10px] bg-bg px-3 py-2.5">
                <div className="text-[10px] text-text-3">{s.label}</div>
                <div className={`text-[15px] font-extrabold ${s.tone}`}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-[5px] rounded-xl bg-[rgba(29,79,216,.06)] px-[13px] py-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-primary">
                갈아탈 만한 대출 (대환 추천)
              </span>
              <span className="text-[10px] text-[#5b74b8]">07.19 기준</span>
            </div>
            {/* 더미 1개 원칙 — 예시 추천 상품은 1건만 */}
            <div className="flex justify-between text-[11px]">
              <span className="text-[#5b74b8]">S은행 대환 고정 3.42%</span>
              <span className="font-extrabold text-primary">월 -9.8만 · 총 -2,700만</span>
            </div>
            {/* "자세히 ›" 는 상세 화면 링크처럼 보였지만 갈 곳이 없는 평문이었다 — 뺀다. */}
            <div className="text-[10px] text-text-3">
              중도상환수수료(잔여 0.4%) 반영한 실익 기준
            </div>
          </div>
        </div>

        <div className="rise-in-4 card flex flex-col gap-2.5 rounded-2xl p-4">
          <div className="text-[13px] font-extrabold text-ink">세금·대출 판정 정보</div>
          <ExampleRow label="보유 주택" value="2주택" />
          <ExampleRow label="생애최초" value="비해당" />
          <div className="flex justify-between text-[13px]">
            <span className="text-text-2">거주 기간</span>
            <span className="font-extrabold text-ink">
              7년 2개월 <span className="text-[10px] text-primary">비과세 요건 충족</span>
            </span>
          </div>
        </div>

        <div className="rise-in-5 ai-panel flex flex-col gap-1.5 rounded-2xl p-4">
          <div className="text-xs font-extrabold text-ai-accent">등록하면 바로</div>
          <div className="text-xs leading-[1.6] text-ai-text">
            순자산·LTV 자동 계산 · 갈아타기 시뮬레이션 · 양도세 예상 · 시세 변동 알림
          </div>
        </div>
      </div>
    </PageShell>
  );
}
