import fs from "node:fs";
import path from "node:path";

export type RankingKind = "file" | "openapi";

export type PopularityRankingEntry = {
  rank: number;
  org: string;
  title: string;
  format: string;
  listId: string;
  kind: RankingKind;
  periodLabel: string;
};

export type PopularityListMeta = {
  id: string;
  kind: RankingKind;
  periodLabel: string;
  filename: string;
};

const RANKING_FILES: PopularityListMeta[] = [
  {
    id: "file-top10-202604",
    kind: "file",
    periodLabel: "2026.04 (파일 TOP10)",
    filename: "file-top10-202604.csv",
  },
  {
    id: "file-top20-2026q1",
    kind: "file",
    periodLabel: "2026 Q1 (파일 TOP20)",
    filename: "file-top20-2026q1.csv",
  },
  {
    id: "file-top20-alltime",
    kind: "file",
    periodLabel: "2011~2026 (파일 TOP20)",
    filename: "file-top20-alltime.csv",
  },
  {
    id: "openapi-top10-202604",
    kind: "openapi",
    periodLabel: "2026.04 (OpenAPI TOP10)",
    filename: "openapi-top10-202604.csv",
  },
  {
    id: "openapi-top20-2026q1",
    kind: "openapi",
    periodLabel: "2026 Q1 (OpenAPI TOP20)",
    filename: "openapi-top20-2026q1.csv",
  },
  {
    id: "openapi-top20-alltime",
    kind: "openapi",
    periodLabel: "2011~2026 (OpenAPI TOP20)",
    filename: "openapi-top20-alltime.csv",
  },
];

function rankingsDir(): string {
  return path.join(process.cwd(), "data", "public-data-rankings");
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, "").toLowerCase();
}

function readRankingFile(meta: PopularityListMeta): PopularityRankingEntry[] {
  const filePath = path.join(rankingsDir(), meta.filename);
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.replace(/\s+/g, ""));
  const rankIdx = header.findIndex((h) => h.includes("순위"));
  const orgIdx = header.findIndex((h) => h.includes("기관") || h.includes("제공"));
  const titleIdx = header.findIndex((h) => h.includes("목록") || h.includes("목록명"));
  const formatIdx = header.findIndex(
    (h) => h.includes("확장") || h.includes("서비스") || h.includes("유형"),
  );

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      rank: Number.parseInt(cols[rankIdx] ?? "0", 10) || 0,
      org: cols[orgIdx] ?? "",
      title: cols[titleIdx] ?? "",
      format: cols[formatIdx] ?? "",
      listId: meta.id,
      kind: meta.kind,
      periodLabel: meta.periodLabel,
    };
  });
}

let cached: PopularityRankingEntry[] | null = null;

export function loadAllPopularityRankings(): PopularityRankingEntry[] {
  if (cached) return cached;
  cached = RANKING_FILES.flatMap(readRankingFile);
  return cached;
}

export function listPopularityRankingMeta(): PopularityListMeta[] {
  return RANKING_FILES;
}

/** 가장 최근 CSV 파일 mtime (ISO) */
export function getLatestRankingExportedAt(): string | null {
  let latest = 0;
  for (const meta of RANKING_FILES) {
    const filePath = path.join(rankingsDir(), meta.filename);
    if (!fs.existsSync(filePath)) continue;
    const mtime = fs.statSync(filePath).mtimeMs;
    if (mtime > latest) latest = mtime;
  }
  return latest > 0 ? new Date(latest).toISOString().slice(0, 10) : null;
}

export function getPopularityRankings(filter?: {
  kind?: RankingKind;
  listId?: string;
}): PopularityRankingEntry[] {
  let rows = loadAllPopularityRankings();
  if (filter?.kind) rows = rows.filter((r) => r.kind === filter.kind);
  if (filter?.listId) rows = rows.filter((r) => r.listId === filter.listId);
  return rows.sort((a, b) => a.rank - b.rank);
}

/** TOP 목록 출현·순위 가중치로 인기 점수 산출 */
export function scorePopularity(matchTitles: string[]): {
  score: number;
  appearances: number;
  bestRank: number | null;
  lists: string[];
} {
  const keys = new Set(matchTitles.map(normalizeTitle));
  let score = 0;
  let appearances = 0;
  let bestRank: number | null = null;
  const lists = new Set<string>();

  for (const row of loadAllPopularityRankings()) {
    const key = normalizeTitle(row.title);
    const matched = [...keys].some((k) => key.includes(k) || k.includes(key));
    if (!matched) continue;

    appearances += 1;
    lists.add(row.periodLabel);
    const weight = row.kind === "openapi" ? 1.2 : 1;
    score += weight * (21 - Math.min(row.rank, 20));
    if (bestRank == null || row.rank < bestRank) bestRank = row.rank;
  }

  return { score, appearances, bestRank, lists: [...lists] };
}

export { normalizeTitle };
