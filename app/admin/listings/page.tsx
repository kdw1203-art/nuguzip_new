import { listPendingListings, LISTING_TYPE_LABEL, LISTING_SOURCE_LABEL } from "@/lib/listings/store-db";
import { ListingReviewActions } from "./ListingReviewActions";

/* 어드민 매물 검수 — pending 목록 + 승인/반려(사유).
   접근 제어는 app/admin/layout.tsx (canAccessAdminConsole) 재사용. */

export const dynamic = "force-dynamic";

const panelCard =
  "flex flex-col gap-3 rounded-2xl border border-[rgba(255,255,255,.06)] bg-[#12161f] p-5";

function formatKrwShort(krw: number | null): string {
  if (krw === null || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${Math.round(eok * 10) / 10}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

export default async function AdminListingsPage() {
  const pending = await listPendingListings();

  return (
    <>
      <div className="rise-in flex items-center justify-between">
        <div className="text-[19px] font-extrabold text-white">
          매물 검수{" "}
          <span className="ml-1 rounded-[6px] bg-[rgba(126,162,255,.15)] px-2 py-[3px] text-[12px] font-extrabold text-[#7ea2ff]">
            대기 {pending.length}건
          </span>
        </div>
        <span className="text-[11px] text-[#9aa6b8]">
          검수는 형식 요건 확인 — 승인 시 /listings에 즉시 노출
        </span>
      </div>

      <div className={`rise-in-1 ${panelCard}`}>
        {pending.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#9aa6b8]">
            검수 대기 중인 매물이 없어요.
          </div>
        ) : (
          pending.map((l) => (
            <div
              key={l.id}
              className="flex flex-col gap-2 rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-[6px] px-2 py-[2px] text-[10px] font-extrabold ${
                    l.source === "owner"
                      ? "bg-[rgba(126,162,255,.15)] text-[#7ea2ff]"
                      : "bg-[rgba(242,201,76,.15)] text-[#f2c94c]"
                  }`}
                >
                  {LISTING_SOURCE_LABEL[l.source]}
                </span>
                <span className="rounded-[6px] bg-[rgba(255,255,255,.08)] px-2 py-[2px] text-[10px] font-extrabold text-[#c9d2e0]">
                  {LISTING_TYPE_LABEL[l.listingType]}
                </span>
                <span className="text-[14px] font-extrabold text-white">
                  {l.complexName}
                </span>
                {l.regionName && (
                  <span className="text-[11px] text-[#9aa6b8]">{l.regionName}</span>
                )}
              </div>
              <div className="text-[12px] text-[#c9d2e0]">
                {[
                  l.priceKrw !== null ? `매매 ${formatKrwShort(l.priceKrw)}` : null,
                  l.depositKrw !== null ? `보증금 ${formatKrwShort(l.depositKrw)}` : null,
                  l.monthlyKrw !== null ? `월세 ${formatKrwShort(l.monthlyKrw)}` : null,
                  l.areaM2 !== null ? `${l.areaM2}㎡` : null,
                  l.floor !== null ? `${l.floor}층` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {l.description && (
                <p className="text-[12px] leading-[1.6] text-[#9aa6b8]">{l.description}</p>
              )}
              <div className="text-[11px] text-[#9aa6b8]">
                등록자: {l.authorLabel} ({l.authorEmail})
                {l.contact ? ` · 연락: ${l.contact}` : ""} ·{" "}
                {new Date(l.createdAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </div>
              <ListingReviewActions id={l.id} />
            </div>
          ))
        )}
      </div>
    </>
  );
}
