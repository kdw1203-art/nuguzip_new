import { getSupplyForArea } from "@/lib/market/supply";

/* D4 — 향후 공급(입주물량) 섹션. 단지 소재 지역 인근 apartment_supply(실데이터) 중
   아직 도래하지 않았거나 최근의 입주 예정 물량. 없으면 렌더 생략(사실 우선). */

/** "202608" → "2026.08" */
function fmtYm(ym: string): string {
  const s = ym.trim();
  return s.length === 6 ? `${s.slice(0, 4)}.${s.slice(4)}` : s;
}

/** 현재 달(YYYYMM) 이상만 향후 공급으로 간주. */
function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function UpcomingSupply({ area }: { area: string }) {
  const name = area.trim();
  if (!name) return null;

  const items = await getSupplyForArea(name, 24).catch(() => []);
  if (items.length === 0) return null;

  // 향후(현재월 이상) 우선, 부족하면 최근 물량으로 채움
  const nowYm = currentYm();
  const upcoming = items.filter((i) => i.moveInYm && i.moveInYm >= nowYm);
  const shown = (upcoming.length > 0 ? upcoming : items).slice(0, 6);
  if (shown.length === 0) return null;

  const totalHouseholds = shown.reduce((s, i) => s + (i.households ?? 0), 0);

  return (
    <section className="rise-in-5 mt-6">
      <h2 className="mb-2 px-1 text-[15px] font-extrabold text-ink">
        인근 입주물량{" "}
        <span className="text-[12px] font-medium text-text-3">
          {name}
          {totalHouseholds > 0 ? ` · 약 ${totalHouseholds.toLocaleString("ko-KR")}세대` : ""}
        </span>
      </h2>
      <div className="card overflow-hidden rounded-2xl">
        <ul className="flex flex-col">
          {shown.map((i, idx) => (
            <li
              key={`${i.moveInYm}-${i.aptName}-${idx}`}
              className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-ink">
                  {i.aptName || "공급 예정 단지"}
                </div>
                <div className="truncate text-[11px] text-text-3">
                  {[i.address || i.region, i.bizType].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] font-extrabold text-primary">{fmtYm(i.moveInYm)}</div>
                {i.households != null && (
                  <div className="text-[11px] text-text-3">
                    {i.households.toLocaleString("ko-KR")}세대
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-1.5 px-1 text-[11px] leading-[1.6] text-text-3">
        입주물량은 주변 시세·전세에 영향을 줄 수 있어요. 공공 공급 데이터 기준이며 일정은 변동될 수 있습니다.
      </p>
    </section>
  );
}
