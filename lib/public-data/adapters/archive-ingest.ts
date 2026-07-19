import fs from "node:fs";
import path from "node:path";
import { readCsvFile } from "@/lib/public-data/adapters/csv-parse";
import { loadArchiveManifest } from "@/lib/public-data/adapters/archive-extract";

export type BundledDatasetMeta = {
  id: string;
  title: string;
  format: "csv" | "zip" | "hwpx";
  category: "rankings" | "geo" | "archive";
  file: string;
  rowCount?: number;
  note?: string;
};

const DATA_ROOT = path.join(process.cwd(), "data");

export function listBundledDatasets(): BundledDatasetMeta[] {
  const out: BundledDatasetMeta[] = [];

  const rankingsDir = path.join(DATA_ROOT, "public-data-rankings");
  if (fs.existsSync(rankingsDir)) {
    for (const file of fs.readdirSync(rankingsDir).filter((f) => f.endsWith(".csv"))) {
      const { rows } = readCsvFile(path.join(rankingsDir, file));
      out.push({
        id: `rankings-${file.replace(/\.csv$/i, "")}`,
        title: `공공데이터 활용 TOP · ${file}`,
        format: "csv",
        category: "rankings",
        file: `public-data-rankings/${file}`,
        rowCount: rows.length,
      });
    }
  }

  const geoDir = path.join(DATA_ROOT, "public-data-geo");
  if (fs.existsSync(geoDir)) {
    for (const file of fs.readdirSync(geoDir).filter((f) => f.endsWith(".csv"))) {
      const { rows } = readCsvFile(path.join(geoDir, file));
      out.push({
        id: `geo-${file.replace(/\.csv$/i, "")}`,
        title: `생활·임장 POI · ${file}`,
        format: "csv",
        category: "geo",
        file: `public-data-geo/${file}`,
        rowCount: rows.length,
      });
    }
  }

  const archiveDir = path.join(DATA_ROOT, "public-data-archive");
  const manifestIds = new Set<string>();

  for (const entry of loadArchiveManifest()) {
    manifestIds.add(entry.id);
    out.push({
      id: entry.id,
      title: path.basename(entry.sourceFile),
      format: entry.format,
      category: "archive",
      file: entry.sourceFile,
      rowCount: entry.rowCount,
      note:
        entry.format === "hwpx"
          ? entry.textPreview
            ? `HWPX 텍스트 추출 ${entry.textPreview.length}자`
            : "HWPX — 텍스트 미리보기"
          : entry.format === "zip"
            ? `ZIP → CSV ${entry.csvFiles.length}개`
            : undefined,
    });
  }

  if (fs.existsSync(archiveDir)) {
    for (const file of fs.readdirSync(archiveDir)) {
      const ext = path.extname(file).toLowerCase();
      if (![".zip", ".hwpx", ".csv"].includes(ext)) continue;
      const id = `archive-${file.replace(/\.[^.]+$/i, "")}`;
      if (manifestIds.has(id)) continue;
      out.push({
        id,
        title: file,
        format: ext === ".zip" ? "zip" : ext === ".hwpx" ? "hwpx" : "csv",
        category: "archive",
        file: `public-data-archive/${file}`,
        note: "manifest 미등록 — admin ingest 실행 권장",
      });
    }
  }

  return out;
}

export function readBundledCsv(relativePath: string): Record<string, string>[] {
  const filePath = path.join(DATA_ROOT, relativePath);
  if (!filePath.startsWith(DATA_ROOT)) return [];
  const { rows } = readCsvFile(filePath);
  return rows;
}
