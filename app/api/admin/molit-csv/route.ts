/**
 * POST /api/admin/molit-csv
 * 관리자 전용. 국토부 아파트 매매 실거래가 CSV 업로드 → complex_transactions 적재.
 *
 * CSV 컬럼 (국토부 공공데이터포털 다운로드 기준):
 *   시군구, 번지, 본번, 부번, 단지명, 전용면적(㎡), 계약년월, 계약일, 거래금액(만원), 층, 건축년도, 도로명
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 단지명 + 시군구 → URL-safe ID (complex-store.ts와 동일) */
function toSlug(name: string, district: string): string {
  return `${district}-${name}`
    .replace(/\s+/g, "-")
    .replace(/[^가-힣a-zA-Z0-9-]/g, "")
    .toLowerCase()
    .slice(0, 80);
}

interface AggEntry {
  name: string;
  district: string;
  yyyymm: string;
  sum: number;
  min: number;
  max: number;
  cnt: number;
}

function parseCsvText(text: string): { rows: Record<string, string>[]; headerError?: string } {
  // BOM 제거
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], headerError: "행이 부족합니다 (헤더+데이터 최소 2행 필요)" };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? "";
    });
    rows.push(obj);
  }
  return { rows };
}

export async function POST(req: Request) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자만 업로드할 수 있습니다." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 형식이 필요합니다." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: ".csv 파일만 지원합니다." }, { status: 400 });
  }

  const text = await file.text();
  const { rows, headerError } = parseCsvText(text);
  if (headerError) {
    return NextResponse.json({ error: headerError }, { status: 422 });
  }

  // ── 월별 집계 ─────────────────────────────────────────────────────────
  const aggMap = new Map<string, AggEntry>();
  let skipped = 0;

  for (const row of rows) {
    const aptName = row["단지명"] ?? row["아파트"] ?? "";
    const district = row["시군구"] ?? row["지역코드"] ?? "";
    const yyyymm = (row["계약년월"] ?? "").replace(/[-/\s]/g, "").slice(0, 6);
    const priceStr = (row["거래금액(만원)"] ?? row["거래금액"] ?? "").replace(/,/g, "");

    if (!aptName || !district || !yyyymm || !priceStr) {
      skipped++;
      continue;
    }
    const manwon = Number(priceStr);
    if (!Number.isFinite(manwon) || manwon <= 0) {
      skipped++;
      continue;
    }

    const key = `${toSlug(aptName, district)}|${yyyymm}`;
    const cur = aggMap.get(key) ?? {
      name: aptName,
      district,
      yyyymm,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      cnt: 0,
    };
    cur.sum += manwon;
    cur.min = Math.min(cur.min, manwon);
    cur.max = Math.max(cur.max, manwon);
    cur.cnt++;
    aggMap.set(key, cur);
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "Supabase 서비스 연결 실패" }, { status: 503 });
  }

  // ── complexes 스텁 삽입 ───────────────────────────────────────────────
  const uniqueIds = [...new Set([...aggMap.keys()].map((k) => k.split("|")[0]))];
  const { data: existing } = await sb.from("complexes").select("id").in("id", uniqueIds);
  const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));

  const stubs: { id: string; name: string; district: string; city: string; building_type: string }[] = [];
  for (const [key, v] of aggMap) {
    const complexId = key.split("|")[0];
    if (!existingIds.has(complexId)) {
      stubs.push({ id: complexId, name: v.name, district: v.district, city: "", building_type: "아파트" });
    }
  }

  let newComplexes = 0;
  if (stubs.length > 0) {
    const { error } = await sb.from("complexes").upsert(stubs, { onConflict: "id", ignoreDuplicates: true });
    if (!error) newComplexes = stubs.length;
  }

  // ── complex_transactions upsert (배치 500) ────────────────────────────
  const txRows = [...aggMap.entries()].map(([key, v]) => ({
    complex_id: key.split("|")[0],
    yyyymm: v.yyyymm,
    area_m2: null,
    avg_manwon: Math.round(v.sum / v.cnt),
    min_manwon: v.min === Infinity ? null : v.min,
    max_manwon: v.max === -Infinity ? null : v.max,
    deal_count: v.cnt,
    source: "molit-csv",
  }));

  const BATCH = 500;
  let upserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < txRows.length; i += BATCH) {
    const chunk = txRows.slice(i, i + BATCH);
    const { error } = await sb.from("complex_transactions").upsert(chunk, {
      onConflict: "complex_id,yyyymm,area_m2",
    });
    if (error) {
      errors.push(`batch[${i}]: ${error.message}`);
    } else {
      upserted += chunk.length;
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    fileName: file.name,
    parsed: rows.length,
    skipped,
    aggregated: txRows.length,
    upserted,
    newComplexes,
    errors: errors.length > 0 ? errors : undefined,
  });
}
