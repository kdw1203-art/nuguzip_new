import { getRegionRelative } from "@/lib/complex/complex-store";

/* D6 — 지역 대비 상대 위치. 단지 ㎡당 시세를 소재 구 평균(REB 실집계)과 비교.
   데이터 없으면 렌더 생략(사실 우선). */

function ymLabel(s: string | null): string {
  if (!s || s.length < 6) return "";
  return `${s.slice(0, 4)}.${s.slice(4)}`;
}

export async function RegionRelative({ complexId }: { complexId: string }) {
  const r = await getRegionRelative(complexId).catch(() => null);
  if (!r) return null;

  const higher = r.deltaPct >= 0;
  const maxV = Math.max(r.complexPerM2Manwon, r.districtPerM2Manwon, 1);
  const complexW = Math.min(100, Math.round((r.complexPerM2Manwon / maxV) * 100));
  const districtW = Math.min(100, Math.round((r.districtPerM2Manwon / maxV) * 100));

  return (
    <section className="rise-in-5 mt-6">
      <h2 className="mb-2 px-1 text-[15px] font-extrabold text-ink">
        이 동네 대비{" "}
        <span className="text-[12px] font-medium text-text-3">{r.district} · ㎡당 기준</span>
      </h2>
      <div className="card flex flex-col gap-3 rounded-2xl p-5">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-[22px] font-extrabold ${higher ? "text-primary" : "text-text-2"}`}
          >
            {higher ? "+" : ""}
            {r.deltaPct}%
          </span>
          <span className="text-[13px] text-text-2">
            {r.district} 평균 대비 {higher ? "높아요" : "낮아요"}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <div className="mb-0.5 flex justify-between text-[11px]">
              <span className="font-bold text-ink">이 단지</span>
              <span className="tabular-nums text-ink">
                {r.complexPerM2Manwon.toLocaleString("ko-KR")}만/㎡
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[rgba(0,0,0,.06)]">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${complexW}%` }}
              />
            </div>
          </div>
          <div>
            <div className="mb-0.5 flex justify-between text-[11px]">
              <span className="text-text-3">{r.district} 평균</span>
              <span className="tabular-nums text-text-3">
                {r.districtPerM2Manwon.toLocaleString("ko-KR")}만/㎡
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[rgba(0,0,0,.06)]">
              <span
                className="block h-full rounded-full bg-[#c3cad6]"
                style={{ width: `${districtW}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-3">
          {r.saleChangePct != null && (
            <span>
              구 시세 변동{" "}
              <b className={r.saleChangePct >= 0 ? "text-primary" : "text-danger"}>
                {r.saleChangePct >= 0 ? "+" : ""}
                {r.saleChangePct}%
              </b>
            </span>
          )}
          {r.jeonseRatio != null && (
            <span>
              전세가율 <b className="text-text-2">{r.jeonseRatio}%</b>
            </span>
          )}
          {r.period && <span>{ymLabel(r.period)} 기준 · 한국부동산원</span>}
        </div>
      </div>
    </section>
  );
}
