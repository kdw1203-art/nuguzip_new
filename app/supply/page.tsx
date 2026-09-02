import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AdSlot } from "@/app/components/ads/AdSlot";
import { getSupplyAll, getSupplyDataAsOf } from "@/lib/market/supply";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { seoAlternates } from "@/lib/seo/alternates";
import { SupplyClient } from "./SupplyClient";

/* ── ISR 전환 (사용량 절감 9차, 2026-08-10) ─────────────────────────────────
   예전에는 force-dynamic + ?region= 서버 필터(요청마다 함수 실행 + DB 4쿼리)였다.
   실측: apartment_supply 전량 675행(17개 시도, 최다 지역 209행) — 페치 상한
   2000 안에 넉넉히 들어오므로 클라이언트 메모리 필터가 서버 .eq 필터와 동치다.
   ① 데이터는 전량 1쿼리(getSupplyAll) + 기준시점 1쿼리 = 4쿼리 → 2쿼리
   ② 필터·파생(월별 집계/분기 카드/표)은 SupplyClient 가 마운트 후
      location.search 로 처리 — SSR 은 전국 전량을 그대로 그린다
   ③ 세션(getAdViewer)은 제거 — 세션을 읽는 순간 dynamic 으로 굴러떨어진다.
      광고는 plan={null} 서버 조각 + AdFreeGate 클라이언트 게이트(complex/[id] 선례)
   수동 적재 데이터(자동 갱신 없음)라 600초면 충분히 신선하다.
   실패는 캐시에 눌러앉히지 않도록 ok 판별로 구별해 그린다 (dev-deals 교훈 —
   단, 실패 화면도 revalidate 주기로는 캐시되므로 600초를 넘기지 않는다). */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "아파트 입주 예정 물량 | 내집나우",
  /* "캘린더" 표기는 제거(2026-08-22) — 실제 화면은 월별 물량 막대 + 단지 목록이지
     달력 격자가 아니다. 이름이 화면과 다르면 찾던 것을 못 찾았다고 느낀다. */
  description:
    "전국·지역별 아파트 입주 예정 물량(공급) — 입주월·단지·세대수. 공급이 많은 시기와 지역을 한눈에.",
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/supply"),
};

/** 테마 구분: 입주 물량 = 초록 (공급·신축). 하위 클래스(text-primary·bg-primary-soft·
 *  chip-active·btn-primary)가 이 subtree 안에서 초록으로 재테마됨. */
const SUPPLY_THEME = {
  "--primary": "#0e9f6e",
  "--primary-soft": "#e7f6ef",
  "--primary-strong": "#0b8058",
} as CSSProperties;

const SOURCE_URL = "https://www.data.go.kr";

export default async function SupplyPage() {
  const [all, dataAsOf] = await Promise.all([
    getSupplyAll(),
    getSupplyDataAsOf(),
  ]);

  // 갱신 기준 표기 — 하드코딩 대신 DB(apartment_supply) 최신 적재 시점(created_at).
  // 자동 갱신 경로가 없는 수동 적재 데이터라는 사실을 함께 표기한다.
  const asOfLabel =
    dataAsOf && dataAsOf.length >= 7 ? `${dataAsOf.slice(0, 4)}.${dataAsOf.slice(5, 7)}` : null;

  return (
    <PageShell breadcrumb="동네이야기 › 입주 물량" wide>
      <h1 className="sr-only">아파트 입주 예정 물량</h1>
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />
      <div style={SUPPLY_THEME}>
        {/* 상단 CTA — 예전의 정적 탭 4개(전체·이번 분기·예정·지난 입주)는 클릭해도
            아무 동작이 없는 장식이라 제거했다. "입주 물량 알림" 칩도 뺐다 —
            /notifications 는 알림함일 뿐 입주 알림을 켜는 설정이 없어서, 신청할 수
            없는 알림을 신청 버튼처럼 걸어 두면 신청했다고 오해하게 만든다. */}
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
          <div className="flex-1" />
          <div className="flex flex-wrap gap-1.5 text-xs">
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="glass press rounded-full px-3.5 py-2 font-bold text-primary no-underline"
            >
              공공데이터 출처 ↗
            </a>
            {/* "지도에서 보기"(→/map)는 제거(2026-08-22) — 지도에 입주 물량
                레이어가 없어서, 누르면 목적과 무관한 화면이 나오는 링크였다.
                지도에 공급 레이어가 생기면 그때 되살린다. 대신 같은 판단 맥락인
                청약(미래 공급의 앞단)으로 잇는다. */}
            <Link
              href="/apply"
              className="glass press rounded-full px-3.5 py-2 font-bold text-text-1 no-underline"
            >
              청약 경쟁률 보기
            </Link>
          </div>
        </div>

        {/* 정직 안내 배너 (초록 틴트) — 화면의 모든 수치가 실데이터가 된 뒤로는
            "예시 구성" 이라고 적을 것이 없다. 남은 사실(수동 적재·자동 갱신 없음)만 적는다. */}
        <div
          className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 t-sub"
          style={{ color: "var(--primary-strong)" }}
        >
          <span>
            입주는 <b>월 단위</b>로 공개되는 자료라 일자는 알 수 없어요. 공개
            입주예정물량 자료를 수동으로 적재한 데이터
            {asOfLabel ? `(최근 적재 ${asOfLabel})` : ""}로 자동 갱신되지
            않으며, 사업 진행·일정 변경에 따라 실제와 다를 수 있어요. 아래
            “지난·전체 입주 예정 단지” 표는{" "}
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-primary underline"
            >
              공공데이터(data.go.kr)
            </a>{" "}
            기반입니다.
          </span>
        </div>

        {all.ok ? (
          <SupplyClient
            items={all.items}
            truncated={all.truncated}
            asOfLabel={asOfLabel}
            builtAtMs={Date.now()}
            adSlot={<AdSlot placement="community_feed" seed={0} plan={null} />}
          />
        ) : (
          /* 조회 실패 — "데이터 없음" 과 구별해 그린다 (0건이 아니라 조회 실패).
             예전 로더들은 실패를 [] 로 삼켜 빈 상태처럼 보였다 — getSupplyAll 이
             ok 로 구별한다. 이 화면도 revalidate 주기 동안은 캐시되지만,
             빈 데이터를 "정상 0건" 처럼 눌러앉히는 것보다는 정직하다. */
          <div className="card rounded-2xl px-4 py-10 text-center t-body text-text-2">
            입주 물량 데이터를 불러오지 못했어요. 0건인 게 아니라 조회에 실패한
            것이니, 잠시 뒤 새로고침해 주세요.
          </div>
        )}

        {/* 면책 (초록 톤 유지) */}
        <p className="mt-6 t-sub text-text-3">
          입주 예정 물량은 공개 자료를 취합한 참고용 정보이며, 사업 진행·일정
          변경에 따라 실제와 다를 수 있습니다.
        </p>
      </div>
    </PageShell>
  );
}
