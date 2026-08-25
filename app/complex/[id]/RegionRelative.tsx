import { getRegionRelative } from "@/lib/complex/complex-store";
import { logger } from "@/lib/log";

/* D6 — 지역 대비 상대 위치. 단지 ㎡당 시세를 소재 구 평균(REB 실집계)과 비교.
   데이터 없으면 렌더 생략(사실 우선).

   조회 실패는 "데이터 없음"이 아니다. 예전엔 .catch(() => null) 로 둘을 같게 그렸다. */

function ymLabel(s: string | null): string {
  if (!s || s.length < 6) return "";
  return `${s.slice(0, 4)}.${s.slice(4)}`;
}

export async function RegionRelative({
  complexId,
  compact = false,
}: {
  complexId: string;
  compact?: boolean;
}) {
  const res = await getRegionRelative(complexId).then(
    (data) => ({ ok: true as const, data }),
    (e: unknown) => {
      logger.error("[complex] 지역 대비 시세 조회 실패", e);
      return { ok: false as const };
    },
  );
  const wrap = compact ? "rise-in-1" : "rise-in-5 mt-6";
  if (!res.ok) {
    return (
      <section className={wrap}>
        <h2 className="mb-1.5 px-0.5 t-section text-ink">이 동네 대비</h2>
        <p className="card rounded-2xl px-4 py-3.5 t-body text-text-3">
          지금은 동네 평균과 비교하지 못했어요. 비교할 자료가 없는 게 아니라 조회에
          실패한 것이라, 잠시 후 다시 보면 나올 수 있어요.
        </p>
      </section>
    );
  }
  const r = res.data;
  if (!r) return null;

  const higher = r.deltaPct >= 0;
  const maxV = Math.max(r.complexPerM2Manwon, r.districtPerM2Manwon, 1);
  const complexW = Math.min(100, Math.round((r.complexPerM2Manwon / maxV) * 100));
  const districtW = Math.min(100, Math.round((r.districtPerM2Manwon / maxV) * 100));

  return (
    <section className={wrap}>
      <h2 className="mb-1.5 px-0.5 t-section text-ink">
        이 동네 대비{" "}
        <span className="t-sub font-medium text-text-3">{r.district} · ㎡당</span>
      </h2>
      <div
        className={`card flex flex-col gap-2.5 rounded-2xl ${compact ? "px-4 py-3.5" : "p-5"}`}
      >
        <div className="flex items-baseline gap-2">
          <span
            className={`font-extrabold tabular-nums ${higher ? "text-primary" : "text-text-2"} ${
              compact ? "text-[20px]" : "text-[22px]"
            }`}
          >
            {higher ? "+" : ""}
            {r.deltaPct}%
          </span>
          <span className="t-sub text-text-2">
            {r.district} 평균 대비 {higher ? "높아요" : "낮아요"}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <div className="mb-0.5 flex justify-between t-sub">
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
            <div className="mb-0.5 flex justify-between t-sub">
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

        <div className="flex flex-wrap gap-x-4 gap-y-1 t-sub text-text-3">
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
