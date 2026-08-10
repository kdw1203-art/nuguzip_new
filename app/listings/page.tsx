import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { listApprovedListings } from "@/lib/listings/store-db";
import { DISTRICTS } from "@/lib/regions";
import { ListingCompareTray } from "@/components/ListingCompareTray";
import { seoAlternates } from "@/lib/seo/alternates";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { ListingsListClient } from "./ListingsListClient";

/* ============================================================
   실매물 목록 — /listings
   "중개사 제휴 + 집주인 직접 등록" 모델 (당근·네이버부동산 벤치마크).
   승인(approved)된 매물만 노출 · 유형/구 필터 · 최신순.
   ============================================================ */

/* 비용 실측(2026-08-10): 서버가 ?type/gu/complex 를 읽어 필터별 DB 질의 —
   영구 동적이라 크롤 1회 = 함수 호출 1회. 승인 매물은 ≤200건이라 전체를 한 번
   받고 ListingsListClient(클라이언트)에서 exact 일치로 거른다(서버 .eq 와 동의미).
   매물 등록·승인 반영은 최대 5분 늦는다(재검증 주기). 부스트 배지는 클라이언트
   에서 현재 시각으로 계산해 캐시와 무관하게 정확하다. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "실매물 — 집주인 직접·중개사 등록 매물 · 누구집",
  description:
    "집주인이 직접 등록하거나 제휴 중개사가 올린 매물을 검수 후 보여드려요. 실거래가와 비교하며 확인하세요.",
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/listings"),
};

export default async function ListingsPage() {
  /* listApprovedListings 는 조회 실패를 던진다. 여기서 잡아 ErrorState 를 그리는
     이유는, 그냥 올려 보내면 Next 의 일반 오류 화면이 떠서 필터·등록 버튼까지
     사라지기 때문이다. "매물이 없어요"라고 말하지 않는 것이 핵심이고, 화면은
     남겨 둔 채 "지금 못 읽었다"만 정확히 알린다. */
  let items: Awaited<ReturnType<typeof listApprovedListings>> | null = null;
  let loadError: string | null = null;
  try {
    items = await listApprovedListings({});
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const seoulGus = DISTRICTS["서울특별시"];

  return (
    <PageShell breadcrumb="홈 › 실매물">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="rise-in text-[22px] font-extrabold text-ink">실매물</h1>
          <p className="mt-1 text-[13px] text-text-3">
            검수 통과 매물만 노출 · 현재 필터는 서울 구 단위(전국 등록은 가능, 목록 필터는 서울
            중심).
          </p>
        </div>
        <Link href="/listings/new" className="btn-primary btn-md">
          매물 등록하기
        </Link>
      </div>

      {items === null ? (
        <ErrorState
          className="rise-in-1"
          title="매물 목록을 지금 불러올 수 없어요"
          desc="매물이 없는 게 아니라, 목록을 읽어 오지 못했어요. 잠시 후 새로고침해 주세요."
          cause={loadError ?? undefined}
          action={{ href: "/listings/new", label: "매물 등록하기" }}
        />
      ) : (
        /* 필터 + 목록은 클라이언트(ListingsListClient) — SSR 은 전체를 HTML 에
           그리고, 필터는 마운트 후 location.search 로 적용(딥링크·뒤로가기 포함) */
        <ListingsListClient items={items} seoulGus={seoulGus} />
      )}

      {/* 매물 비교함 — 담긴 매물이 있을 때만 하단 고정 노출 */}
      <ListingCompareTray />

      {/* 법적 고지 */}
      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        매물 정보는 등록자(집주인·중개사)가 직접 입력한 내용으로, 그 정확성에 대한
        책임은 등록자에게 있습니다. 누구집의 검수는 형식 요건 확인일 뿐 매물의 진위·
        권리관계를 보증하지 않습니다. 중개 행위는 해당 매물을 등록한 개업공인중개사가
        수행하며, 누구집은 광고 매체로서 정보를 게재할 뿐 중개 당사자가 아닙니다.
      </div>
    </PageShell>
  );
}
