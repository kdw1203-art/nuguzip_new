import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
import { EmptyState } from "@/app/components/ui/EmptyState";

/* ============================================================
   포트폴리오 분석 — 등록된 자산이 있어야 성립하는 화면인데, 자산을 저장하는
   경로 자체가 아직 없다(/my/assets 도 "준비 중" 예시 화면이다).

   그런데도 이전 화면은 "총 자산 14.2억 / 순자산 9.4억 / 3개월 ▼3,200만",
   "평촌 초원마을 59㎡ 2019 취득 · 대출 잔액 2.1억", "인천 검단 오피스텔"처럼
   특정인의 대차대조표를 그려놓고 있었다. 자산을 하나도 등록하지 않은 사람이
   들어와도 똑같은 화면이 나왔다 — 보는 사람의 재산을 지어낸 셈이라
   "예시" 배지를 달아 넘길 수 있는 종류가 아니다.

   함께 있던 것들도 같은 이유로 걷어냈다.
   - "1년 / 3년 / 전체" 알약 탭: 서버 컴포넌트의 <span> 이라 눌러도 아무 일이
     없는데 "3년"만 활성 색으로 칠해져 있었다. 게다가 아래 순자산 추이 SVG 의
     d= 는 고정 문자열이어서 기간을 바꿀 것도 없었다.
   - 순자산 추이 곡선·자산 구성 막대·리밸런싱 제안(실현손익 -1,600만 등):
     전부 위 가짜 자산에서 파생된 숫자였다.

   지금은 "등록된 자산 0건"이라는 사실만 말하고, 무엇을 하면 채워지는지 안내한다.
   자산 저장이 열리면 이 자리에 실제 등록분 기준 집계가 들어간다.
   ============================================================ */

/* 자산 알림은 알림 설정(/notifications)에 실제로 존재하는 항목 안내라 남긴다 —
   숫자를 주장하지 않고 "무엇을 받을 수 있는지"만 말한다. */
const ALERTS = [
  "월 순자산 리포트 (매월 1일)",
  "보유 단지 시세 ±3% 변동",
  "대환 실익 발생 시 (금리)",
];

export default function PortfolioPage() {
  return (
    <PageShell breadcrumb="AI 분석 › 포트폴리오">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">포트폴리오 분석</h1>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rise-in-1">
          <EmptyState
            icon="wallet"
            title="아직 등록된 자산이 없어요"
            desc="총자산·순자산·부동산 비중은 내가 등록한 보유 자산에서 계산돼요. 자산 등록(저장·자동 시세 연동)이 아직 열리지 않아서, 예시 자산으로 대신 채우지 않고 비워둡니다."
            action={{ label: "자산 등록 화면 보기", href: "/my/assets" }}
          />
        </div>

        {/* 준비 중이라고만 하고 끝내면 막다른 화면이 된다 — 지금 동작하는 계산으로 잇는다 */}
        <div className="rise-in-2">
          <NextActions
            actions={[
              { label: "대출·비용 계산기", href: "/calculator", primary: true },
              { label: "매도 vs 보유 시나리오", href: "/analysis/scenario" },
              { label: "시세·타이밍 보기", href: "/analysis/timing" },
            ]}
          />
        </div>

        <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
          <div className="text-[13px] font-extrabold text-ink">자산 알림</div>
          <div className="text-[11px] leading-[1.6] text-text-3">
            자산 등록이 열리면 아래 알림을 받을 수 있어요.
          </div>
          {/* 장식용 가짜 토글 제거 — 실제 알림 설정으로 연결 */}
          {ALERTS.map((a) => (
            <div key={a} className="text-xs text-text-1">
              · {a}
            </div>
          ))}
          <Link
            href="/notifications"
            className="btn-soft mt-1 rounded-[10px] p-2.5 text-center text-xs no-underline"
          >
            알림 설정 열기
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
