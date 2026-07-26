import {
  listPendingListings,
  listReportedListings,
  LISTING_TYPE_LABEL,
  LISTING_SOURCE_LABEL,
} from "@/lib/listings/store-db";
import { listOwnerVerifications } from "@/lib/listings/owner-verification";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";
import { ListingReviewActions } from "./ListingReviewActions";
import { ReportedListingActions } from "./ReportedListingActions";
import { OwnerVerificationQueue } from "./OwnerVerificationQueue";

/* 어드민 매물 검수 — pending 목록 + 승인/반려(사유) + 소유확인 심사 큐(I1).
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
  /* 2026-07-26: 신고·소유확인이 `.catch(() => [])` 였다. 조회가 실패해도 화면은
     "신고가 접수된 매물이 없어요"라고 말했다. 신고 3건이면 자동 숨김이 걸리는
     큐라서, 실패를 0건으로 보이게 하면 감춰진 매물을 아무도 확인하지 않게 된다.
     실패한 섹션은 실패했다고 말한다.

     2026-07-26 (2차): 앞선 수정은 사실상 무효였다 — store 세 개가 *안에서*
     실패를 삼키고 `[]` 를 돌려주고 있어서, 여기 붙인 ErrorState 분기는 영원히
     안 걸렸다. store 를 던지도록 고치고, pending 도 같은 방식으로 감싼다.
     (한 섹션이 죽어도 나머지 두 섹션은 계속 보이는 편이 낫다.) */
  const [pendingLoaded, reportedLoaded, verificationsLoaded] = await Promise.all([
    listPendingListings().then(
      (items) => ({ ok: true as const, items }),
      (err: unknown) => {
        logger.error("[admin/listings] 검수 대기 목록 조회 실패", err);
        return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
      },
    ),
    listReportedListings().then(
      (items) => ({ ok: true as const, items }),
      (err: unknown) => {
        logger.error("[admin/listings] 신고 매물 조회 실패", err);
        return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
      },
    ),
    listOwnerVerifications("all", 100).then(
      (items) => ({ ok: true as const, items }),
      (err: unknown) => {
        logger.error("[admin/listings] 소유확인 큐 조회 실패", err);
        return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
      },
    ),
  ]);
  const pending = pendingLoaded.ok ? pendingLoaded.items : [];
  const reported = reportedLoaded.ok ? reportedLoaded.items : [];
  const verifications = verificationsLoaded.ok ? verificationsLoaded.items : [];
  const pendingVerifications = verifications.filter((v) => v.status === "pending").length;

  return (
    <>
      <div className="rise-in flex items-center justify-between">
        <div className="text-[19px] font-extrabold text-white">
          매물 검수{" "}
          <span className="ml-1 rounded-[6px] bg-[rgba(126,162,255,.15)] px-2 py-[3px] text-[12px] font-extrabold text-[#7ea2ff]">
            {pendingLoaded.ok ? `대기 ${pending.length}건` : "대기 —"}
          </span>
          {pendingVerifications > 0 && (
            <span className="ml-1 rounded-[6px] bg-[rgba(242,201,76,.15)] px-2 py-[3px] text-[12px] font-extrabold text-[#f2c94c]">
              소유확인 {pendingVerifications}건
            </span>
          )}
        </div>
        <span className="text-[11px] text-[#9aa6b8]">
          검수는 형식 요건 확인 — 승인 시 /listings에 즉시 노출
        </span>
      </div>

      <div className={`rise-in-1 ${panelCard}`}>
        {!pendingLoaded.ok ? (
          <ErrorState
            tone="admin"
            title="검수 대기 목록을 지금 불러오지 못했어요"
            desc="대기 중인 매물이 0건인 게 아니라 조회 자체가 실패했습니다. 검수를 기다리는 매물이 묶여 있을 수 있으니 잠시 후 새로고침해 주세요."
            cause={pendingLoaded.cause}
          />
        ) : pending.length === 0 ? (
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
              {(l.isDuplicate || l.flagReason) && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[rgba(214,69,69,.08)] px-2.5 py-1.5">
                  <span className="rounded-[6px] bg-[rgba(214,69,69,.2)] px-2 py-[2px] text-[10px] font-extrabold text-[#ff8a8a]">
                    ⚠ 자동 플래그
                  </span>
                  <span className="text-[11px] font-bold text-[#ffb3b3]">
                    {l.flagReason ?? "중복 주소 의심"}
                  </span>
                  <span className="text-[10px] text-[#9aa6b8]">— 승인 전 확인 권장</span>
                </div>
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

      {/* I7·I8 — 신고 누적 / 자동 숨김 매물.
          자동 숨김은 이미 승인된 매물에서 일어나므로 pending 큐에 절대 뜨지 않는다.
          여기가 없으면 신고를 받아 감추기만 하고 아무도 확인하지 않는 상태가 된다. */}
      <div className="rise-in-2 flex items-center justify-between">
        <div className="text-[16px] font-extrabold text-white">
          신고 누적 · 자동 숨김{" "}
          {reported.length > 0 && (
            <span className="ml-1 rounded-[6px] bg-[rgba(214,69,69,.18)] px-2 py-[3px] text-[12px] font-extrabold text-[#ff8a8a]">
              {reported.length}건
            </span>
          )}
        </div>
        <span className="text-[11px] text-[#9aa6b8]">
          신고 3건 누적 시 자동 숨김 — 확인 후 해제할 수 있어요
        </span>
      </div>
      <div className={`rise-in-2 ${panelCard}`}>
        {!reportedLoaded.ok ? (
          <ErrorState
            tone="admin"
            title="신고 매물을 지금 불러오지 못했어요"
            desc="신고가 0건인 게 아니라 조회가 실패했습니다. 자동 숨김된 매물이 있을 수 있으니 새로고침 후 다시 확인해 주세요."
            cause={reportedLoaded.cause}
          />
        ) : reported.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#9aa6b8]">
            신고가 접수된 매물이 없어요.
          </div>
        ) : (
          reported.map((l) => (
            <div
              key={l.id}
              className="flex flex-col gap-2 rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[6px] bg-[rgba(214,69,69,.2)] px-2 py-[2px] text-[10px] font-extrabold text-[#ff8a8a]">
                  신고 {l.reportCount}건
                </span>
                {l.isHidden && (
                  <span className="rounded-[6px] bg-[rgba(255,255,255,.12)] px-2 py-[2px] text-[10px] font-extrabold text-[#c9d2e0]">
                    숨김 중
                  </span>
                )}
                <span className="text-[14px] font-extrabold text-white">{l.complexName}</span>
                {l.regionName && (
                  <span className="text-[11px] text-[#9aa6b8]">{l.regionName}</span>
                )}
                <span className="rounded-[6px] bg-[rgba(255,255,255,.08)] px-2 py-[2px] text-[10px] font-extrabold text-[#c9d2e0]">
                  {LISTING_TYPE_LABEL[l.listingType]}
                </span>
              </div>
              {l.flagReason && (
                <div className="text-[11px] font-bold text-[#ffb3b3]">
                  자동 플래그: {l.flagReason}
                </div>
              )}
              {l.description && (
                <p className="text-[12px] leading-[1.6] text-[#9aa6b8]">{l.description}</p>
              )}
              <div className="text-[11px] text-[#9aa6b8]">
                등록자: {l.authorLabel} ({l.authorEmail}) ·{" "}
                {new Date(l.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </div>
              <ReportedListingActions id={l.id} hidden={l.isHidden} />
            </div>
          ))
        )}
      </div>

      {/* I1 — 소유확인 심사 큐. 증빙을 확인한 뒤에만 인증 배지가 세워진다. */}
      <div className="rise-in-2 flex items-center justify-between">
        <div className="text-[16px] font-extrabold text-white">소유확인 심사</div>
        <span className="text-[11px] text-[#9aa6b8]">
          증빙 확인 후 승인 — 승인 시 매물에 소유확인 배지 표시
        </span>
      </div>
      <div className={`rise-in-2 ${panelCard}`}>
        {verificationsLoaded.ok ? (
          <OwnerVerificationQueue items={verifications} />
        ) : (
          <ErrorState
            tone="admin"
            title="소유확인 심사 큐를 지금 불러오지 못했어요"
            desc="신청이 0건인 게 아니라 조회가 실패했습니다. 잠시 후 새로고침해 주세요."
            cause={verificationsLoaded.cause}
          />
        )}
        <div className="text-[10px] leading-relaxed text-[#6b7688]">
          증빙 파일은 신청자가 직접 올린 원본입니다. 등기부등본·계약서 등 민감 정보가 포함될 수
          있으니 심사 목적 외로 사용하지 마세요.
        </div>
      </div>
    </>
  );
}
