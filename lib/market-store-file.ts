import { promises as fs } from "fs";
import path from "path";
import type { MarketRequest } from "@/lib/types/market-request";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "market_requests.json");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalize(x: unknown): MarketRequest {
  const r = x as Partial<MarketRequest>;
  return {
    id: String(r.id ?? ""),
    requestType: String(r.requestType ?? "자료요청"),
    city: String(r.city ?? "서울특별시"),
    district: String(r.district ?? ""),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    budgetMin: r.budgetMin != null ? Number(r.budgetMin) : null,
    budgetMax: r.budgetMax != null ? Number(r.budgetMax) : null,
    dueDate: String(r.dueDate ?? ""),
    status: r.status === "closed" ? "closed" : "open",
    requesterLabel: String(r.requesterLabel ?? "의뢰자"),
    relatedSite: r.relatedSite ? String(r.relatedSite) : undefined,
    createdAt: String(r.createdAt ?? new Date().toISOString()),
  };
}

export async function readMarketRequestsFile(): Promise<MarketRequest[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const j: unknown = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return j.map(normalize);
  } catch {
    return [];
  }
}

async function writeAll(rows: MarketRequest[]) {
  await ensureDataDir();
  await fs.writeFile(DATA_FILE, JSON.stringify(rows, null, 2), "utf-8");
}

export async function prependMarketRequestFile(
  row: MarketRequest,
): Promise<void> {
  const all = await readMarketRequestsFile();
  all.unshift(row);
  await writeAll(all);
}

export async function getMarketRequestFile(
  id: string,
): Promise<MarketRequest | null> {
  const all = await readMarketRequestsFile();
  return all.find((x) => x.id === id) ?? null;
}

export async function updateMarketRequestStatusFile(
  id: string,
  status: "open" | "closed",
): Promise<boolean> {
  const all = await readMarketRequestsFile();
  const idx = all.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], status };
  await writeAll(all);
  return true;
}

export async function deleteMarketRequestFile(id: string): Promise<boolean> {
  const all = await readMarketRequestsFile();
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) return false;
  await writeAll(next);
  return true;
}
