/* 관리자 마켓·정산 / 공지·배너 — 실집계.
   정산(GMV·수수료)은 결제 연동 전까지 조작 수치 대신 '준비 중' + 실 의뢰/전문가 수만.
   배너는 실제 설정된 배너(listBanners)를 노출 — 가짜 노출/클릭률은 표기하지 않음. */

import { loadAdminKpi } from "@/lib/admin/stats";
import { listBanners, type Banner } from "@/lib/admin/banners";

export const dynamic = "force-dynamic";

const panelCard =
  "flex flex-col gap-3 rounded-2xl border border-[rgba(255,255,255,.06)] bg-[#12161f] p-5";

const PLACEMENT_LABEL: Record<Banner["placement"], string> = {
  home: "홈",
  community: "커뮤니티",
  market: "마켓",
  inspection: "임장",
  global: "전역",
};

/** ISO → "MM.DD", 없으면 "" */
function ymd(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default async function AdminMarketPage() {
  const [kpi, banners] = await Promise.all([
    loadAdminKpi(),
    listBanners().catch(() => [] as Banner[]),
  ]);

  const stats = [
    { label: "진행 중 의뢰", value: kpi.marketOpen.toLocaleString("ko-KR"), color: "#fff" },
    { label: "누적 의뢰", value: kpi.marketTotal.toLocaleString("ko-KR"), color: "#7ea2ff" },
    { label: "인증 전문가", value: kpi.totalExperts.toLocaleString("ko-KR"), color: "#4ade80" },
  ];

  return (
    <>
      <div className="rise-in text-[19px] font-extrabold text-white">
        마켓·정산 / 공지·배너 관리
      </div>
      <div className="rise-in -mt-2 mb-1 text-[11px] text-[#9aa6b8]">
        정산 수치는 조작하지 않아요 — 결제·정산 연동 전까지 실 의뢰·전문가·배너만 노출합니다.
      </div>

      <div className="rise-in-1 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 마켓 · 정산 */}
        <div className={panelCard}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">마켓 · 정산</span>
            <span className="text-[11px] text-[#9aa6b8]">실 의뢰 집계</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)] p-3"
              >
                <div className="text-[10px] text-[#9aa6b8]">{s.label}</div>
                <div className="text-lg font-extrabold" style={{ color: s.color }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-3.5">
            <div className="text-[12px] font-extrabold text-white">
              전문가 정산(GMV·수수료){" "}
              <span className="text-[10px] font-medium text-[#9aa6b8]">준비 중</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#9aa6b8]">
              전문가 리포트·상담 결제와 정산 파이프라인(PG) 연동 후, 실 판매액·수수료·지급
              대기를 이 자리에서 집계합니다. 현재는 추정·예시 수치를 노출하지 않아요.
            </p>
          </div>
        </div>

        {/* 공지 · 배너 관리 — 실제 설정된 배너 */}
        <div className={panelCard}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">공지 · 배너 관리</span>
            <span className="text-[11px] text-[#9aa6b8]">
              활성 {banners.filter((b) => b.isActive).length} / 전체 {banners.length}
            </span>
          </div>
          {banners.length === 0 ? (
            <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-4 text-[11px] text-[#9aa6b8]">
              설정된 배너가 없어요. 배너를 추가하면 홈·커뮤니티 등 지정 위치에 노출됩니다.
            </div>
          ) : (
            banners.slice(0, 6).map((b) => {
              const period = [ymd(b.startsAt), ymd(b.endsAt)].filter(Boolean).join(" ~ ");
              return (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-extrabold text-white">
                      {b.title}{" "}
                      <span
                        className={`text-[9px] font-extrabold ${
                          b.isActive ? "text-[#4ade80]" : "text-[#9aa6b8]"
                        }`}
                      >
                        {b.isActive ? "게시 중" : "숨김"}
                      </span>
                    </div>
                    <div className="mt-[3px] text-[10px] text-[#9aa6b8]">
                      {PLACEMENT_LABEL[b.placement]} · 우선순위 {b.priority}
                      {period ? ` · ${period}` : ""}
                      {b.targetPlan ? ` · 대상 ${b.targetPlan}` : ""}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div className="text-[10px] leading-[1.6] text-[#9aa6b8]">
            노출/클릭 실적은 집계 파이프라인 연동 후 표기합니다. 광고(애드센스)와 자체 배너는
            별도 운영돼요.
          </div>
        </div>
      </div>
    </>
  );
}
