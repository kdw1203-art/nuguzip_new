import { getNearbyPoi, type NearbyPoi } from "@/lib/poi/store";

/* [#96] 도보권 학교·역 — 단지 좌표 기준 직선거리(도보 환산 80m/분).
   데이터가 아직 적재되지 않았으면(오너 패킷 ⑧ 대기) 섹션 자체를 그리지 않는다 —
   빈 껍데기도, "준비 중" 배너도 만들지 않는다. 조회 실패도 접는다(곁다리 관례). */

function walkLabel(distanceM: number): string {
  const min = Math.max(1, Math.round(distanceM / 80));
  return `도보 약 ${min}분 (${distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)}km` : `${distanceM}m`})`;
}

export async function ComplexNearbyPoi({
  lat,
  lng,
  name,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  name: string;
}) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  let poi: NearbyPoi;
  try {
    poi = await getNearbyPoi(lat, lng);
  } catch {
    return null;
  }
  if (poi.schools.length === 0 && poi.stations.length === 0) return null;

  return (
    <section className="rise-in-5 mt-6">
      <h2 className="mb-2 px-1 t-section text-ink">
        {name} 도보권 학교·역{" "}
        <span className="t-sub font-medium text-text-3">직선거리 기준</span>
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {poi.schools.length > 0 && (
          <div className="card rounded-2xl px-4 py-3">
            <div className="mb-1 t-sub font-extrabold text-text-2">
              학교 {poi.schools.length}곳 (1.2km 이내)
            </div>
            <ul className="flex flex-col">
              {poi.schools.map((s) => (
                <li
                  key={`${s.name}-${s.distanceM}`}
                  className="flex items-baseline justify-between gap-3 border-b border-divider py-2 t-body last:border-0"
                >
                  <span className="min-w-0 truncate font-bold text-ink">
                    {s.name}
                    {s.category && (
                      <span className="ml-1.5 t-sub font-medium text-text-3">
                        {s.category}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 t-sub text-text-2 tabular-nums">
                    {walkLabel(s.distanceM)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {poi.stations.length > 0 && (
          <div className="card rounded-2xl px-4 py-3">
            <div className="mb-1 t-sub font-extrabold text-text-2">
              도시철도역 {poi.stations.length}곳 (1.5km 이내)
            </div>
            <ul className="flex flex-col">
              {poi.stations.map((s) => (
                <li
                  key={`${s.name}-${s.line}-${s.distanceM}`}
                  className="flex items-baseline justify-between gap-3 border-b border-divider py-2 t-body last:border-0"
                >
                  <span className="min-w-0 truncate font-bold text-ink">
                    {s.name}
                    {s.line && (
                      <span className="ml-1.5 t-sub font-medium text-text-3">
                        {s.line}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 t-sub text-text-2 tabular-nums">
                    {walkLabel(s.distanceM)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className="t-caption mt-1.5 px-1 text-text-3">
        출처: 공공데이터포털 전국초중등학교위치·도시철도역사정보 표준데이터(공공누리
        1유형). 직선거리를 도보 80m/분으로 환산한 값이라 실제 경로·시간과 다를 수
        있습니다. 배정 학군은 별도 확인이 필요합니다.
      </p>
    </section>
  );
}
