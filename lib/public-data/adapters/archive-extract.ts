import fs from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";

const DATA_ROOT = path.join(process.cwd(), "data");
export const ARCHIVE_DIR = path.join(DATA_ROOT, "public-data-archive");
export const EXTRACTED_DIR = path.join(DATA_ROOT, "public-data-archive-extracted");
const MANIFEST_PATH = path.join(DATA_ROOT, "public-data-archive-manifest.json");

export type ArchiveManifestEntry = {
  id: string;
  sourceFile: string;
  format: "zip" | "hwpx" | "csv";
  extractedFiles: string[];
  csvFiles: string[];
  textPreview?: string;
  rowCount?: number;
  ingestedAt: string;
};

export function loadArchiveManifest(): ArchiveManifestEntry[] {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as ArchiveManifestEntry[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveArchiveManifest(entries: ArchiveManifestEntry[]): void {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(entries, null, 2), "utf8");
}

function stripXmlTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractHwpxText(buffer: Uint8Array): string {
  const files = unzipSync(buffer);
  const parts: string[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (!name.endsWith(".xml")) continue;
    if (!/section|contents|body/i.test(name)) continue;
    parts.push(stripXmlTags(strFromU8(data)));
  }
  return parts.join("\n\n").slice(0, 80_000);
}

export function extractZipContents(
  buffer: Uint8Array,
  destPrefix: string,
): { csvPaths: string[]; allFiles: string[] } {
  const files = unzipSync(buffer);
  const csvPaths: string[] = [];
  const allFiles: string[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (name.includes("..")) continue;
    const rel = path.posix.join(destPrefix, name.replace(/\\/g, "/"));
    const outPath = path.join(EXTRACTED_DIR, rel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, data);
    allFiles.push(rel);
    if (name.toLowerCase().endsWith(".csv")) {
      csvPaths.push(`public-data-archive-extracted/${rel}`.replace(/\\/g, "/"));
    }
  }
  return { csvPaths, allFiles: allFiles.map((f) => `public-data-archive-extracted/${f}`.replace(/\\/g, "/")) };
}

function countCsvRows(relativePath: string): number {
  const filePath = path.join(DATA_ROOT, relativePath);
  if (!fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

export function ingestArchiveFile(fileName: string, buffer: Uint8Array): ArchiveManifestEntry {
  const ext = path.extname(fileName).toLowerCase();
  const base = fileName.replace(/\.[^.]+$/i, "");
  const id = `archive-${base}`;

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARCHIVE_DIR, fileName), buffer);

  let csvFiles: string[] = [];
  let extractedFiles: string[] = [];
  let textPreview: string | undefined;
  let rowCount: number | undefined;

  if (ext === ".zip") {
    const r = extractZipContents(buffer, base);
    csvFiles = r.csvPaths;
    extractedFiles = r.allFiles;
    rowCount = csvFiles.reduce((sum, p) => sum + countCsvRows(p), 0);
  } else if (ext === ".hwpx") {
    textPreview = extractHwpxText(buffer).slice(0, 4000);
    const txtRel = `public-data-archive-extracted/${base}/preview.txt`;
    const txtPath = path.join(DATA_ROOT, txtRel);
    fs.mkdirSync(path.dirname(txtPath), { recursive: true });
    fs.writeFileSync(txtPath, textPreview, "utf8");
    extractedFiles = [txtRel];
  } else if (ext === ".csv") {
    const rel = `public-data-archive/${fileName}`;
    csvFiles = [rel];
    extractedFiles = [rel];
    rowCount = countCsvRows(rel);
  } else {
    throw new Error("지원 형식: .csv, .zip, .hwpx");
  }

  const entry: ArchiveManifestEntry = {
    id,
    sourceFile: `public-data-archive/${fileName}`,
    format: ext === ".zip" ? "zip" : ext === ".hwpx" ? "hwpx" : "csv",
    extractedFiles,
    csvFiles,
    textPreview,
    rowCount,
    ingestedAt: new Date().toISOString(),
  };

  const manifest = loadArchiveManifest().filter((e) => e.id !== id);
  manifest.push(entry);
  saveArchiveManifest(manifest);
  return entry;
}
