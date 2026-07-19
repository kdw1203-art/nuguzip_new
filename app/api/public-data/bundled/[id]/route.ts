import { NextResponse } from "next/server";
import {
  listBundledDatasets,
  readBundledCsv,
} from "@/lib/public-data/adapters";
import { loadArchiveManifest } from "@/lib/public-data/adapters/archive-extract";
import { loadGeoFacilities } from "@/lib/public-data/adapters/geo-facilities";
import {
  getPopularityRankings,
  listPopularityRankingMeta,
} from "@/lib/public-data/popularity-rankings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/public-data/bundled/[id]?limit=50 */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const limit = Math.min(200, Number(new URL(req.url).searchParams.get("limit") ?? 50) || 50);

  if (id.startsWith("rankings-")) {
    const listKey = id.replace(/^rankings-/, "");
    const meta = listPopularityRankingMeta().find((m) => m.filename.replace(/\.csv$/i, "") === listKey);
    if (!meta) return NextResponse.json({ error: "not found" }, { status: 404 });
    const rows = getPopularityRankings({ listId: meta.id }).slice(0, limit);
    return NextResponse.json({ id, format: "csv", rows, total: rows.length, list: meta });
  }

  if (id.startsWith("geo-")) {
    const district = new URL(req.url).searchParams.get("district") ?? undefined;
    const category = new URL(req.url).searchParams.get("category") ?? undefined;
    const { rows, source } = loadGeoFacilities({ district, category });
    return NextResponse.json({
      id,
      format: "csv",
      rows: rows.slice(0, limit),
      total: rows.length,
      source,
    });
  }

  const dataset = listBundledDatasets().find((d) => d.id === id);
  if (!dataset) return NextResponse.json({ error: "not found" }, { status: 404 });

  const manifest = loadArchiveManifest().find((e) => e.id === id);

  if (dataset.format === "hwpx") {
    return NextResponse.json({
      id,
      format: "hwpx",
      meta: dataset,
      textPreview: manifest?.textPreview?.slice(0, limit * 20) ?? "",
      rows: [],
      message: manifest?.textPreview ? "HWPX 텍스트 추출 미리보기" : dataset.note,
    });
  }

  if (dataset.format === "zip") {
    const csvPath = manifest?.csvFiles?.[0];
    if (csvPath) {
      const raw = readBundledCsv(csvPath).slice(0, limit);
      return NextResponse.json({
        id,
        format: "csv",
        meta: dataset,
        rows: raw,
        total: raw.length,
        source: csvPath,
      });
    }
    return NextResponse.json({
      id,
      format: "zip",
      meta: dataset,
      rows: [],
      message: dataset.note ?? "ZIP — admin ingest 후 CSV 조회 가능",
    });
  }

  const raw = readBundledCsv(dataset.file).slice(0, limit);
  return NextResponse.json({
    id,
    format: "csv",
    meta: dataset,
    rows: raw,
    total: raw.length,
  });
}
