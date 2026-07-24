import { getGeocodeProgress } from "@/lib/map/complex-geocode";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { GeocodeRunButton } from "./GeocodeRunButton";

/* 데이터 관리 — 지도 단지 좌표 지오코딩 진행률·실행 + 시장 데이터 신선도. 모두 실집계. */

export const dynamic = "force-dynamic";

const card =
  "flex flex-col gap-3 rounded-2xl border border-[rgba(255,255,255,.06)] bg-[#12161f] p-5";

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

export default async function AdminDataPage() {
  const [geo, freshness] = await Promise.all([
    getGeocodeProgress().catch(() => null),
    getMarketFreshnessDateLabel().catch(() => null),
  ]);

  const ok = geo?.ok ?? 0;
  const total = geo?.total ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((ok / total) * 100)) : 0;

  return (
    <>
      <div className="rise-in text-[19px] font-extrabold text-white">데이터 관리</div>
      <div className="rise-in -mt-2 mb-1 text-[11px] text-[#9aa6b8]">
        지도 단지 좌표 지오코딩과 시장 데이터 신선도 — 모두 실집계입니다.
      </div>

      <div className="rise-in-1 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 지오코딩 진행률 */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">단지 좌표 지오코딩</span>
            <span className="text-[11px] text-[#9aa6b8]">네이버(NCP)</span>
          </div>

          <div className="flex items-end gap-2">
            <span className="text-[26px] font-extrabold text-[#7ea2ff]">{fmt(ok)}</span>
            <span className="mb-1 text-[12px] text-[#9aa6b8]">/ {fmt(total)} 단지 · {pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,.08)]">
            <span
              className="block h-full rounded-full bg-[#7ea2ff]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex gap-4 text-[11px] text-[#9aa6b8]">
            <span>성공 <b className="text-[#4ade80]">{fmt(ok)}</b></span>
            <span>실패 <b className="text-[#f2c94c]">{fmt(geo?.notfound ?? 0)}</b></span>
            <span>남음 <b className="text-white">{fmt(Math.max(0, total - (geo?.cached ?? 0)))}</b></span>
          </div>

          <GeocodeRunButton configured={geo?.configured ?? false} />
        </div>

        {/* 시장 데이터 신선도 */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">시장 데이터 신선도</span>
            <span className="text-[11px] text-[#9aa6b8]">국토교통부·REB</span>
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)] p-3.5">
            <div className="text-[10px] text-[#9aa6b8]">최근 실거래 반영</div>
            <div className="mt-0.5 text-[17px] font-extrabold text-white">
              {freshness ?? "—"}
            </div>
          </div>
          <div className="text-[10px] leading-relaxed text-[#9aa6b8]">
            실거래·시세 적재는 ETL(GitHub Actions, 하루 2회)이 담당합니다. 좌표 지오코딩도 같은
            스케줄에 250건씩 자동 백필돼요.
          </div>
        </div>
      </div>
    </>
  );
}
