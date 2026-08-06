import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { AdSlot } from "@/app/components/ads/AdSlot";
import { getAdViewer } from "@/lib/ads/viewer";
import { searchApplyhome } from "@/lib/applyhome/applyhome-search";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { THEME_APPLY } from "@/lib/theme/presets";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";
import { ApplySearchClient } from "./ApplySearchClient";
import type { ApplyInitialResult } from "./ApplySearchClient";

const APPLYHOME_URL = "https://www.applyhome.co.kr";

// 빌드 타임 외부 API 접근 회피 — 요청 시 서버에서 청약홈 데이터를 조회
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "청약 센터 — 청약홈 경쟁률·특별공급 | 누구집",
  description:
    "청약홈(한국부동산원) 공공데이터 기반 아파트 청약 경쟁률·특별공급 접수현황 — 지역·단지명 검색.",
  alternates: seoAlternates("/apply"),
  robots: { index: true, follow: true },
};

/* 정직화 리라이트 기록:
   - 예전 이 페이지는 "과천지식정보타운 S7블록"이라는 실명 단지에 지어낸
     분양가(8.9억)·예상 경쟁률(120:1)·가점 컷(58점)·인근 시세 비교(안전마진 1.5억)를
     붙인 하드코딩 카드 + 정적 "8월 청약 캘린더" 상수 + 동작하지 않는 탭·알림 토글로
     구성돼 있었다. 실명에 붙은 가짜 수치는 "예시" 배지로 감당할 수 없는 종류라 전부
     제거하고, 실데이터(청약홈 경쟁률·특별공급 API)를 페이지 중심으로 승격했다.
   - 검색·탭·더보기는 이미 완성돼 있던 /api/applyhome/search 를 배선한 것(ApplySearchClient). */

/* 2026-07-27 디자인 고도화(#225) — /supply(입주 물량)·/auctions(공매 물건) 수준으로 올린다.
   바꾼 것: 테마 래핑, seoAlternates, 실패 원인 보존, 카테고리 연동 사이드, 요약 타일(클라이언트). */

/**
 * 구 lib(청약홈 odcloud)를 서버 컴포넌트에서 직접 호출 — 초기 화면용.
 *
 * 2026-07-27: 예전엔 `catch { return null }` 이었다. 그러면 화면에는 "불러오지
 * 못했어요" 한 줄만 남고 **왜** 실패했는지가 사라진다. 키 미설정(mode:"mock")·
 * 상세 API 미승인(detailNotice)·진짜 조회 실패는 서로 다른 상태이고 사용자가 할
 * 수 있는 일도 다르다. 원인을 그대로 넘겨 화면에서 구분해 쓴다.
 */
async function getInitialPayload(): Promise<ApplyInitialResult> {
  try {
    const payload = await searchApplyhome({ tab: "competition", page: 1, perPage: 15 });
    return { ok: true, payload };
  } catch (err) {
    logger.error("[apply] 청약홈 초기 조회 실패", err);
    return { ok: false, cause: err instanceof Error ? err.message : String(err) };
  }
}

/* 연동(#225) — 청약은 단독으로 보지 않는다. 같은 지역의 입주 물량(공급 압력),
   공매 물건(가격 하단), 정비사업(미래 공급)을 같이 봐야 판단이 선다. */
const CROSS_LINKS: { href: string; icon: string; label: string; desc: string }[] = [
  {
    href: "/supply",
    icon: "calendar",
    label: "입주 물량",
    desc: "같은 지역에 언제 몇 세대가 들어오는지",
  },
  {
    href: "/auctions",
    icon: "gavel",
    label: "공매 물건",
    desc: "공매로 나온 물건과 감정가",
  },
  {
    href: "/redevelopment",
    icon: "map",
    label: "정비사업 지도",
    desc: "재건축·재개발 진행 단계",
  },
  {
    href: "/qna",
    icon: "messages-square",
    label: "단지 Q&A",
    desc: "이웃에게 직접 물어보기",
  },
];

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
    <PageShell breadcrumb="홈 › 동네이야기 › 청약 센터" title="청약 센터" wide>
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />

      <div style={THEME_APPLY}>
        {/* 상단 CTA — 예전의 정적 탭(전체·예정·접수 중·지난 청약)은 클릭해도 아무
            동작이 없는 장식이라 제거했다. 실동작 탭(경쟁률/특별공급)은 아래 검색 영역에 있다. */}
        <div className="rise-in mt-4 mb-4 flex flex-wrap items-center gap-2">
          <h1 className="text-[17px] font-extrabold text-ink">
            청약 경쟁률 · 특별공급{" "}
            <span className="text-[12px] font-bold text-primary">청약홈 실데이터</span>
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
        <div className="rise-in mb-4 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6] text-primary">
          경쟁률·특별공급 표는 <b>청약홈(한국부동산원) 공공데이터</b>예요. 접수 일정·공고 원문·청약
          신청은{" "}
          <a
            href={APPLYHOME_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline"
          >
            청약홈(applyhome.co.kr)
          </a>
          에서 확인하세요. 당첨 가능성·안전마진 같은 <b>예측치는 이 화면에서 만들지 않습니다.</b>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* 본문 — 청약홈 실데이터 검색 (경쟁률/특별공급 탭 + 지역·단지명 + 더보기) */}
          <ApplySearchClient initial={initial} />

          {/* 우측 사이드 */}
          <aside className="flex flex-col gap-3.5">
            <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
              <div className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
                <Icon name="lightbulb" className="h-4 w-4 text-primary" />이 숫자를 읽는 법
              </div>
              <p className="text-[12px] leading-[1.7] text-text-2">
                경쟁률은 <b>공고 · 주택형(타입) · 순위</b>별로 제공돼요. 그래서 같은 단지가 타입 수만큼
                여러 줄로 보이는 게 정상이고, 한 줄의 경쟁률은 그 타입 하나의 경쟁률이에요.
              </p>
              <p className="text-[12px] leading-[1.7] text-text-2">
                단지명이 &ldquo;단지명 미제공&rdquo;으로 표시되는 행은 청약홈 분양정보(상세) API 승인
                대기 상태라 공고 번호만 확보된 경우예요 — 타입코드를 단지명처럼 보여드리지 않아요.
              </p>
              <p className="text-[11px] leading-[1.6] text-text-3">
                출처: 청약홈(한국부동산원) 공공데이터포털 · 조회 시점 기준이며 실제 공고·결과는 청약홈
                원문이 우선합니다.
              </p>
            </div>

            <div className="rise-in-4 card flex flex-col gap-1.5 rounded-[18px] p-[18px]">
              <div className="text-[13px] font-extrabold text-ink">함께 보면 좋아요</div>
              <p className="mb-1 text-[11px] leading-[1.6] text-text-3">
                청약은 단독으로 보기 어려워요. 같은 지역의 공급·가격 하단도 같이 확인해 보세요.
              </p>
              {CROSS_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="press flex items-center gap-2.5 rounded-xl px-2 py-2 no-underline hover:bg-primary-soft"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft">
                    <Icon name={l.icon} className="h-4 w-4 text-primary" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold text-ink">{l.label}</span>
                    <span className="block truncate text-[11px] text-text-3">{l.desc}</span>
                  </span>
                </Link>
              ))}
            </div>

            <div className="rise-in-5">
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
      </div>
    </PageShell>
  );
}
