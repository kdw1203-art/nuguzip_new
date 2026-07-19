/**
 * KB부동산 시계열 Excel 파서 (서버 전용, exceljs).
 * 주간/월간 시계열 시트는 공통 형태:
 *   - 헤더행: col1="구분", col2~ 지역명(전국/서울특별시/강북14개구/강북구/…)
 *   - 데이터행: col1=기간(주간=Date, 월간="YYYY.M" 또는 월만 표기), col2~ 값
 */
import type ExcelJS from "exceljs";
import { matchRegionByName, type RegionMatch } from "@/lib/market/region-code";
import type { MarketMetric, PeriodType } from "@/lib/market/types";

export interface KbSheetConfig {
  sheet: string;
  periodType: PeriodType;
  metric?: MarketMetric;
  priceField?: "perM2Sale" | "avgSale" | "medianSale" | "avgJeonse";
  /** 값에 곱할 스케일(만원→원=10000, 만원/㎡→원/㎡=10000) */
  scale?: number;
}

export interface KbParsedRow {
  region: RegionMatch;
  period: string; // YYYY-MM-DD
  value: number;
}

/** 시도 표기 → 내부 city */
function sidoToCity(name: string): string | null {
  const n = name.replace(/\s/g, "");
  if (n.startsWith("서울")) return "서울";
  if (n.startsWith("경기")) return "경기";
  if (n.startsWith("인천")) return "인천";
  if (n.startsWith("부산")) return "부산";
  if (n.startsWith("대구")) return "대구";
  if (n.startsWith("대전")) return "대전";
  if (n.startsWith("광주")) return "광주";
  if (n.startsWith("울산")) return "울산";
  if (n.startsWith("세종")) return "세종";
  if (/(특별시|광역시|특별자치시|특별자치도|도)$/.test(name.trim())) return name.trim();
  return null;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    const obj = v as { result?: unknown; text?: unknown };
    if (obj.result != null) return String(obj.result);
    if (obj.text != null) return String(obj.text);
    return "";
  }
  return String(v);
}

function cellNumber(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object") {
    const r = (v as { result?: unknown }).result;
    const n = typeof r === "number" ? r : Number(r);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 헤더행 탐색: col1=="구분" 중 지역 컬럼이 가장 많은 행. */
function findHeaderRow(ws: ExcelJS.Worksheet): number {
  let best = -1;
  let bestCount = 0;
  for (let r = 1; r <= Math.min(8, ws.rowCount); r += 1) {
    const row = ws.getRow(r);
    if (cellText(row.getCell(1)).trim() !== "구분") continue;
    let count = 0;
    for (let c = 2; c <= ws.columnCount; c += 1) {
      if (cellText(row.getCell(c)).trim()) count += 1;
    }
    if (count > bestCount) {
      best = r;
      bestCount = count;
    }
  }
  return best;
}

export function parseKbSheet(ws: ExcelJS.Worksheet, config: KbSheetConfig): KbParsedRow[] {
  const headerRow = findHeaderRow(ws);
  if (headerRow < 0) return [];
  const scale = config.scale ?? 1;

  // 컬럼 → 지역 매핑 (시도 컬럼을 만나면 currentCity 갱신)
  const colRegion = new Map<number, RegionMatch>();
  let currentCity: string | undefined;
  const header = ws.getRow(headerRow);
  for (let c = 2; c <= ws.columnCount; c += 1) {
    const name = cellText(header.getCell(c)).trim();
    if (!name) continue;
    const sido = sidoToCity(name);
    if (sido) {
      currentCity = sido.length <= 2 ? sido : sidoToCity(sido) ?? sido;
      // "서울특별시" → "서울"
      currentCity =
        currentCity === "서울특별시" ? "서울" : currentCity.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, "");
      continue;
    }
    const match = matchRegionByName(name, currentCity);
    if (match) colRegion.set(c, match);
  }
  if (colRegion.size === 0) return [];

  const out: KbParsedRow[] = [];
  let carryYear = 0;
  for (let r = headerRow + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const raw = row.getCell(1).value;
    let period: string | null = null;

    if (raw instanceof Date) {
      period = raw.toISOString().slice(0, 10);
    } else {
      const txt = cellText(row.getCell(1)).trim();
      if (!txt || /classification/i.test(txt)) continue;
      const ym = txt.match(/^(\d{4})[.\-/\s]+(\d{1,2})/);
      if (ym) {
        carryYear = Number(ym[1]);
        period = `${ym[1]}-${ym[2].padStart(2, "0")}-01`;
      } else if (/^\d{1,2}$/.test(txt) && carryYear) {
        period = `${carryYear}-${txt.padStart(2, "0")}-01`;
      } else {
        continue;
      }
    }
    if (!period) continue;

    for (const [c, region] of colRegion) {
      const num = cellNumber(row.getCell(c));
      if (num == null) continue;
      out.push({ region, period, value: num * scale });
    }
  }
  return out;
}
