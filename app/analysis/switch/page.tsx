import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
import { EmptyState } from "@/app/components/ui/EmptyState";

/* ============================================================
   갈아타기 추천 — 추천 엔진이 아직 없어 화면 전체를 빈 상태로 되돌렸다.

   이전 화면에는 다음이 있었고 전부 손으로 적은 값이었다.
   - "지역 안양·과천·의왕 ▾" / "금액대 7~10억 ▾" — <select> 가 아니라 ▾ 문자를
     붙인 <div> 였다. 눌러도 아무 일이 없는데 누를 수 있게 생겼었다.
   - "추천 오픈 준비 중" — 테두리·패딩까지 갖춘 버튼 모양의 <span>.
     준비 중이라는 사실은 문장으로 말하면 되지, 버튼처럼 보일 이유가 없다.
   - "✎ 프로필 수정" — href 도 onClick 도 없는데 캡션은 "수정 가능"이라 적혀 있었다.
   - "내 프로필: 30대 · 남 · 2인 거주" — 보는 사람이 누구든 같은 값이 나오는,
     보는 사람의 신상을 지어낸 칩이었다.
   - "1. 안양 관양동 · 적합도 92% · 내 노트 3건 보유" 같은 추천 목록 — 계산한
     적합도가 아니고, 특히 "내 노트 3건"은 이용자 본인의 데이터를 지어낸 것이라
     제일 나빴다. 노트를 한 건도 안 쓴 사람에게도 3건이라고 말하고 있었다.
   - "평촌에서 갈아탄 이용자들은 관양동 38%" — 이용자 이동 통계를 집계하는
     경로가 없다. "예시" 배지를 달아도 실제 이용자 행동을 지어낸 숫자는
     남겨둘 근거가 못 된다(설명용 계산 예시와 다르다).

   추천은 등록 자산·프로필 조건과 실거래·지수 데이터가 붙어야 계산할 수 있다.
   그때까지는 없는 걸 없다고 말하고, 지금 실제로 되는 화면으로 보낸다.
   ============================================================ */

export default function SwitchPage() {
  return (
    <PageShell breadcrumb="AI 분석 › 포트폴리오 › 갈아타기 추천">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">갈아타기 추천 지역</h1>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rise-in-1">
          <EmptyState
            icon="compass"
            title="갈아타기 추천은 아직 준비 중이에요"
            desc="추천 지역·단지는 등록한 자산과 조건(예산·통근·학군)을 실거래·가격지수 데이터와 맞춰봐야 계산할 수 있어요. 자산 등록과 추천 계산이 아직 열리지 않아서, 적합도나 추천 순위를 지어내지 않고 비워둡니다."
            action={{ label: "실데이터 시세·타이밍 보기", href: "/analysis/timing" }}
          />
        </div>

        {/* 준비 중이라고만 하고 끝내면 막다른 화면이 된다 — 지금 실제로 동작하는 화면으로 잇는다 */}
        <div className="rise-in-2">
          <NextActions
            actions={[
              { label: "지역 시장 온도 보기", href: "/analysis/timing", primary: true },
              { label: "관심 단지 비교하기", href: "/analysis/compare" },
              { label: "대출·비용 계산기", href: "/calculator" },
            ]}
          />
        </div>

        <div className="rise-in-3 card rounded-[18px] px-[18px] py-4 text-[12px] leading-[1.7] text-text-2">
          갈아타기 추천이 열리면 알림으로 알려드릴게요.{" "}
          <Link href="/notifications" className="font-bold text-primary no-underline">
            알림 설정 열기
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
