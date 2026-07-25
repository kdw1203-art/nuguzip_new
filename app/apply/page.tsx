import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { AdSlot } from "@/app/components/ads/AdSlot";
import { getAdViewer } from "@/lib/ads/viewer";
import { searchApplyhome } from "@/lib/applyhome/applyhome-search";
import type { ApplyhomeSearchPayload } from "@/lib/applyhome/types";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { ApplySearchClient } from "./ApplySearchClient";

const APPLYHOME_URL = "https://www.applyhome.co.kr";

// 빌드 타임 외부 API 접근 회피 — 요청 시 서버에서 청약홈 데이터를 조회
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "청약 센터 — 청약홈 경쟁률·특별공급 | 누구집",
  description:
    "청약홈(한국부동산원) 공공데이터 기반 아파트 청약 경쟁률·특별공급 접수현황 — 지역·단지명 검색.",
  robots: { index: true, follow: true },
};

/* 정직화 리라이트 기록:
   - 예전 이 페이지는 "과천지식정보타운 S7블록"이라는 실명 단지에 지어낸
     분양가(8.9억)·예상 경쟁률(120:1)·가점 컷(58점)·인근 시세 비교(안전마진 1.5억)를
     붙인 하드코딩 카드 + 정적 "8월 청약 캘린더" 상수 + 동작하지 않는 탭·알림 토글로
     구성돼 있었다. 실명에 붙은 가짜 수치는 "예시" 배지로 감당할 수 없는 종류라 전부
     제거하고, 실데이터(청약홈 경쟁률·특별공급 API)를 페이지 중심으로 승격했다.
   - 검색·탭·더보기는 이미 완성돼 있던 /api/applyhome/search 를 배선한 것(ApplySearchClient). */

/** 구 lib(청약홈 odcloud)를 서버 컴포넌트에서 직접 호출 — 초기 화면용. 실패 시 null. */
async function getInitialPayload(): Promise<ApplyhomeSearchPayload | null> {
  try {
    return await searchApplyhome({ tab: "competition", page: 1, perPage: 15 });
  } catch {
    return null;
  }
}

/* H1 — 이 자리에는 "AD / AdSense 320×64" 라고 적힌 점선 상자가 있었다.
   개발용 자리표시자가 그대로 프로덕션에 나가 있던 것으로, 사용자에게는
   광고가 실릴 자리가 아니라 **깨진 광고**로 보인다. 실제 슬롯
   (`app/components/ads/AdSlot.tsx`)으로 교체한다 — 등록 배너가 있으면 배너를,
   없으면 하우스 광고를, 둘 다 없으면 `null` 을 반환해 **빈 상자를 남기지 않는다.** */

export default async function ApplyPage() {
  const initial = await getInitialPayload();
  // 유료 플랜 광고 제거(H4) — 이 페이지는 force-dynamic 이라 세션을 읽어도 비용이 없다
  const viewer = await getAdViewer();

  return (
    <PageShell breadcrumb="지도 › 청약 센터" wide>
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />

      {/* 상단 CTA — 예전의 정적 탭(전체·예정·접수 중·지난 청약)은 클릭해도 아무
          동작이 없는 장식이라 제거했다. 실동작 탭(경쟁률/특별공급)은 아래 검색 영역에 있다. */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-[17px] font-extrabold text-ink">
          청약 경쟁률 · 특별공급 <span className="text-[12px] font-bold text-primary">청약홈 실데이터</span>
        </h1>
        <div className="flex-1" />
        <a
          href={APPLYHOME_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="glass press rounded-full px-3.5 py-2 text-xs font-bold text-primary no-underline"
        >
          청약홈 공고 보기 ↗
        </a>
      </div>

      {/* 정직 안내 — 이 페이지의 표는 전부 청약홈 공공데이터 실데이터 */}
      <div className="rise-in mb-4 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-3 text-[12px] leading-[1.6] text-[#5b74b8]">
        경쟁률·특별공급 표는 <b>청약홈(한국부동산원) 공공데이터</b>예요. 접수
        일정·공고 원문·청약 신청은{" "}
        <a
          href={APPLYHOME_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-primary underline"
        >
          청약홈(applyhome.co.kr)
        </a>
        에서 확인하세요.
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* 본문 — 청약홈 실데이터 검색 (경쟁률/특별공급 탭 + 지역·단지명 + 더보기) */}
        <ApplySearchClient initial={initial} />

        {/* 우측 사이드 */}
        <aside className="flex flex-col gap-3.5">
          <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">데이터 안내</div>
            <p className="text-[12px] leading-[1.7] text-text-2">
              경쟁률은 공고·주택형(타입)·순위별 행으로 제공돼요. 단지명이
              &ldquo;단지명 미제공&rdquo;으로 표시되는 행은 청약홈 분양정보(상세)
              API 승인 대기 상태라 공고 번호만 확보된 경우예요 — 타입코드를
              단지명처럼 보여드리지 않아요.
            </p>
            <p className="text-[11px] leading-[1.6] text-text-3">
              출처: 청약홈(한국부동산원) 공공데이터포털 · 조회 시점 기준이며 실제
              공고·결과는 청약홈 원문이 우선합니다.
            </p>
          </div>
          <div className="rise-in-4">
            <AdSlot
              placement="community_feed"
              seed={0}
              adFree={viewer.adFree}
              signedIn={viewer.signedIn}
              plan={viewer.plan}
            />
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
