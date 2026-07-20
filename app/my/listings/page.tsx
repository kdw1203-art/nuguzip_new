import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { VerifyOwnershipButton } from "./VerifyOwnershipButton";
import { safeAuth } from "@/lib/safe-auth";
import { getExpertStatus } from "@/lib/experts/is-verified";
import {
  listMyListings,
  LISTING_TYPE_LABEL,
  type ListingDetail,
  type ListingStatus,
} from "@/lib/listings/store-db";

/* ============================================================
   내 매물 — /my/listings (로그인 필수)
   상태별(검수중·노출중·반려·마감)·조회수·부스트 잔여·노출 부스트 안내.
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 매물 · 누구집",
  robots: { index: false, follow: false },
};

const STATUS_META: Record<ListingStatus, { label: string; cls: string }> = {
  pending: { label: "검수중", cls: "bg-[rgba(29,79,216,.1)] text-primary" },
  approved: { label: "노출중", cls: "bg-[rgba(26,127,78,.1)] text-[#1a7f4e]" },
  rejected: { label: "반려", cls: "bg-[rgba(214,69,69,.1)] text-[#d64545]" },
  closed: { label: "마감", cls: "bg-[rgba(0,0,0,.06)] text-text-3" },
};

function formatKrwShort(krw: number | null | undefined): string {
  if (krw === null || krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

function priceLine(l: ListingDetail): string {
  if (l.listingType === "sale") return `매매 ${formatKrwShort(l.priceKrw)}`;
  if (l.listingType === "jeonse") return `전세 ${formatKrwShort(l.depositKrw)}`;
  return `월세 ${formatKrwShort(l.depositKrw)} / ${formatKrwShort(l.monthlyKrw)}`;
}

/** 부스트 잔여 — 만료 전이면 "D-일" / "N시간", 아니면 null */
function boostRemaining(boostUntil: string | null): string | null {
  if (!boostUntil) return null;
  const t = Date.parse(boostUntil);
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `부스트 ${days}일 남음`;
  const hours = Math.max(1, Math.floor(diff / 3_600_000));
  return `부스트 ${hours}시간 남음`;
}

export default async function MyListingsPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/my/listings");
  }

  // 매물 등록·관리는 공인중개사 인증(isBroker) 사용자만 (item 11)
  const expert = await getExpertStatus(session.user.email);
  if (!expert.isBroker) {
    return (
      <PageShell breadcrumb="마이 › 내 매물" title="내 매물">
        <div className="mx-auto max-w-[520px]">
          <div className="rise-in card flex flex-col items-center gap-3 px-5 py-12 text-center">
            <div className="text-[26px]">🏢</div>
            <div className="text-[15px] font-extrabold text-ink">
              매물 등록은 공인중개사 인증 후 이용할 수 있어요
            </div>
            <p className="max-w-[420px] text-[13px] leading-[1.7] text-text-3">
              개업공인중개사 자격을 인증하면 매물 등록·검수·노출 관리 기능이 열려요.
              인증 후에는 이 화면에서 내 매물 상태와 조회수를 확인할 수 있어요.
            </p>
            <Link href="/town/experts" className="btn-primary btn-md mt-1 no-underline">
              전문가 인증 신청
            </Link>
            <Link href="/my" className="text-[12px] font-bold text-text-3 no-underline">
              마이로 돌아가기 ›
            </Link>
          </div>
          <div className="mt-6 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
            누구집은 광고 매체로서 매물 정보를 게재할 뿐 중개 당사자가 아니며, 매물
            등록·중개 행위는 개업공인중개사가 수행합니다.
          </div>
        </div>
      </PageShell>
    );
  }

  const items = await listMyListings(session.user.email);
  const counts = items.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PageShell breadcrumb="마이 › 내 매물" title="내 매물">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-3">
          검수중 {counts.pending ?? 0} · 노출중 {counts.approved ?? 0} · 반려{" "}
          {counts.rejected ?? 0} · 마감 {counts.closed ?? 0}
        </p>
        <Link href="/listings/new" className="btn-primary btn-md">
          지도에서 매물 등록
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rise-in card card-pad-sm flex flex-col items-center gap-3 py-14 text-center">
          <div className="text-[15px] font-extrabold text-ink">아직 등록한 매물이 없어요</div>
          <p className="max-w-[420px] text-[13px] leading-[1.7] text-text-3">
            지도에서 위치를 찍어 손쉽게 매물을 등록해 보세요. 승인되면 실매물 목록에
            노출되고 포인트가 지급돼요.
          </p>
          <Link href="/listings/new" className="btn-primary btn-md">
            첫 매물 등록하기
          </Link>
        </div>
      ) : (
        <div className="rise-in grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((l) => {
            const meta = STATUS_META[l.status];
            const boost = boostRemaining(l.boostUntil);
            return (
              <div key={l.id} className="card card-pad-sm flex flex-col gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-[6px] px-2 py-[3px] text-[11px] font-extrabold ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                  <span className="rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-extrabold text-text-2">
                    {LISTING_TYPE_LABEL[l.listingType]}
                  </span>
                  {l.ownerVerified && (
                    <span className="rounded-[6px] bg-[rgba(26,127,78,.1)] px-2 py-[3px] text-[11px] font-extrabold text-[#1a7f4e]">
                      소유확인
                    </span>
                  )}
                  {boost && (
                    <span className="rounded-[6px] bg-[rgba(245,158,11,.14)] px-2 py-[3px] text-[11px] font-extrabold text-[#b45309]">
                      {boost}
                    </span>
                  )}
                </div>

                <Link
                  href={`/listings/${l.id}`}
                  className="text-[15px] font-extrabold leading-[1.4] text-ink hover:underline"
                >
                  {l.complexName}
                </Link>
                <div className="text-[15px] font-extrabold text-primary">{priceLine(l)}</div>
                <div className="text-[12px] text-text-3">
                  {[
                    l.regionName,
                    l.areaM2 !== null ? `${l.areaM2}㎡` : null,
                    l.floor !== null ? `${l.floor}층` : null,
                    `조회 ${l.viewCount.toLocaleString("ko-KR")}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>

                {l.status === "rejected" && l.rejectReason && (
                  <div className="rounded-lg bg-[rgba(214,69,69,.06)] px-3 py-2 text-[12px] leading-[1.6] text-[#d64545]">
                    반려 사유 · {l.rejectReason}
                  </div>
                )}

                <div className="mt-1 flex flex-wrap gap-2">
                  <Link href={`/listings/${l.id}`} className="btn-outline btn-sm">
                    상세 보기
                  </Link>
                  {l.status === "approved" && (
                    <Link href="/points/shop" className="btn-primary btn-sm">
                      노출 부스트
                    </Link>
                  )}
                  {!l.ownerVerified &&
                    l.status !== "rejected" &&
                    l.status !== "closed" && (
                      <VerifyOwnershipButton listingId={l.id} />
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 법적 고지 */}
      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        누구집은 광고 매체로서 매물 정보를 게재할 뿐 중개 당사자가 아니며, 매물 정보의
        정확성에 대한 책임은 등록자에게 있습니다.
      </div>
    </PageShell>
  );
}
