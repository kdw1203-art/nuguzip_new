import {
  EX_CONGESTION_DATA_GO_KR_URL,
  EX_CONGESTION_PORTAL_URL,
  EX_CONGESTION_SAMPLE_ROWS,
  EX_ROUTE_LABELS,
} from "@/lib/ex/congestion-sample";
import type {
  ExCongestionFrequencyRow,
  ExCongestionQuery,
  ExCongestionSummary,
} from "@/lib/ex/types";

function filterRows(rows: ExCongestionFrequencyRow[], q: ExCongestionQuery): ExCongestionFrequencyRow[] {
  let out = rows;

  if (q.routeNo != null) {
    out = out.filter((r) => r.routeNo === q.routeNo);
  }
  if (q.yyyymm?.trim()) {
    const yyyymm = q.yyyymm.trim();
    out = out.filter((r) => r.aggYyyymm === yyyymm);
  }
  if (q.zoneQuery?.trim()) {
    const needle = q.zoneQuery.trim().toLowerCase();
    out = out.filter((r) => r.zoneName.toLowerCase().includes(needle));
  }
  if (q.minFrequency != null && q.minFrequency > 0) {
    out = out.filter((r) => r.congestionFrequency >= q.minFrequency!);
  }

  return out.sort((a, b) => b.congestionFrequency - a.congestionFrequency);
}

function buildHotspots(rows: ExCongestionFrequencyRow[]) {
  const byZone = new Map<
    string,
    {
      zoneName: string;
      routeNo: number;
      peakTime: string;
      avgSpeedKmh: number;
      avgTrafficVolume: number;
      maxCongestionFrequency: number;
      zoneLengthKm: number;
      count: number;
    }
  >();

  for (const row of rows) {
    const key = `${row.routeNo}:${row.zoneName}`;
    const prev = byZone.get(key);
    if (!prev) {
      byZone.set(key, {
        zoneName: row.zoneName,
        routeNo: row.routeNo,
        peakTime: row.aggTime,
        avgSpeedKmh: row.avgSpeedKmh,
        avgTrafficVolume: row.avgTrafficVolume,
        maxCongestionFrequency: row.congestionFrequency,
        zoneLengthKm: row.zoneLengthKm,
        count: 1,
      });
      continue;
    }
    prev.count += 1;
    prev.avgSpeedKmh = (prev.avgSpeedKmh + row.avgSpeedKmh) / 2;
    prev.avgTrafficVolume = Math.round((prev.avgTrafficVolume + row.avgTrafficVolume) / 2);
    if (row.congestionFrequency > prev.maxCongestionFrequency) {
      prev.maxCongestionFrequency = row.congestionFrequency;
      prev.peakTime = row.aggTime;
    }
  }

  return [...byZone.values()]
    .sort((a, b) => b.maxCongestionFrequency - a.maxCongestionFrequency)
    .map(({ count: _count, ...rest }) => rest);
}

export function isExDataApiConfigured(): boolean {
  return Boolean(process.env.EX_DATA_API_KEY?.trim());
}

/**
 * 혼잡빈도 조회.
 * - 기본: 공식 샘플 + 수도권 구간 번들 (이용허락범위 제한 없음)
 * - 전체 CSV(약 520만행)는 [고속도로 공공데이터 포털](http://data.ex.co.kr/portal/fdwn/view?type=VDS&num=G3) 월별 다운로드
 */
export async function fetchExCongestionFrequency(
  query: ExCongestionQuery = {},
): Promise<ExCongestionSummary> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const filtered = filterRows(EX_CONGESTION_SAMPLE_ROWS, query);
  const yyyymm =
    query.yyyymm?.trim() ??
    filtered[0]?.aggYyyymm ??
    EX_CONGESTION_SAMPLE_ROWS[EX_CONGESTION_SAMPLE_ROWS.length - 1]?.aggYyyymm ??
    "";

  const hotspots = buildHotspots(filtered).slice(0, limit);

  return {
    yyyymm,
    routeNo: query.routeNo ?? null,
    totalRows: filtered.length,
    hotspots,
    rows: filtered.slice(0, limit),
    mode: "live",
    sourceUrl: EX_CONGESTION_PORTAL_URL,
    portalUrl: EX_CONGESTION_DATA_GO_KR_URL,
    license: "이용허락범위 제한 없음 (한국도로공사)",
    updatedAt: "2025-05-29",
  };
}

export function listExCongestionRoutes(): Array<{ routeNo: number; label: string }> {
  const routeNos = [...new Set(EX_CONGESTION_SAMPLE_ROWS.map((r) => r.routeNo))].sort(
    (a, b) => a - b,
  );
  return routeNos.map((routeNo) => ({
    routeNo,
    label: EX_ROUTE_LABELS[routeNo] ?? `노선 ${routeNo}`,
  }));
}
