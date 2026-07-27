import fs from "fs";
import path from "path";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export type GeoEtlKind = "parking" | "park" | "childcare";

export type GeoEtlRow = {
  name: string;
  district: string;
  city?: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  meta?: Record<string, string | number>;
};

const CACHE_DIR = path.join(process.cwd(), "data", "public-data-geo-cache");
const memGeo = new Map<string, { rows: GeoEtlRow[]; expiresAt: number }>();

export function geoEtlCacheKey(kind: GeoEtlKind, district?: string): string {
  const d = district?.trim().replace(/구$/, "") || "all";
  return `geo-etl:${kind}:${d}`;
}

function filePathFor(kind: GeoEtlKind, district?: string): string {
  const d = district?.trim().replace(/구$/, "") || "all";
  return path.join(CACHE_DIR, `${kind}-${d}.json`);
}

function readFileCache(kind: GeoEtlKind, district?: string): GeoEtlRow[] | null {
  try {
    const fp = filePathFor(kind, district);
    if (!fs.existsSync(fp)) return null;
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) as GeoEtlRow[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeFileCache(kind: GeoEtlKind, district: string | undefined, rows: GeoEtlRow[]): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(filePathFor(kind, district), JSON.stringify(rows, null, 0));
  } catch {
    /* non-critical */
  }
}

/** 단순 CSV (헤더: name,district,city,address,lat,lng,category) */
export function parseSimpleCsvRows(csv: string, kind: GeoEtlKind): GeoEtlRow[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (key: string) => headers.indexOf(key);

  const rows: GeoEtlRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const name = cols[idx("name")] ?? cols[0];
    const district = cols[idx("district")] ?? cols[1];
    if (!name || !district) continue;
    const latRaw = cols[idx("lat")];
    const lngRaw = cols[idx("lng")];
    const lat = latRaw ? Number.parseFloat(latRaw) : undefined;
    const lng = lngRaw ? Number.parseFloat(lngRaw) : undefined;
    rows.push({
      name,
      district: district.includes("구") ? district : `${district}구`,
      city: cols[idx("city")] || undefined,
      address: cols[idx("address")] || undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      category: cols[idx("category")] || kind,
    });
  }
  return rows;
}

export async function writePublicDataCache(
  key: string,
  payload: unknown,
  ttlMs = 604_800_000,
): Promise<void> {
  const expiresAt = Date.now() + ttlMs;
  if (key.startsWith("geo-etl:")) {
    const [, kind, dist] = key.split(":") as [string, GeoEtlKind, string];
    const rows = Array.isArray(payload) ? (payload as GeoEtlRow[]) : [];
    memGeo.set(key, { rows, expiresAt });
    writeFileCache(kind, dist === "all" ? undefined : `${dist}구`, rows);
  }

  const sb = getServiceSupabase();
  if (!sb) return;
  try {
    await sb.from("public_data_cache").upsert({
      cache_key: key,
      source: key.split(":")[0] ?? "geo-etl",
      payload,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
    });
  } catch {
    /* non-critical */
  }
}

export async function readGeoEtlCache(
  kind: GeoEtlKind,
  district?: string,
): Promise<GeoEtlRow[] | null> {
  const key = geoEtlCacheKey(kind, district);
  const mem = memGeo.get(key);
  if (mem && mem.expiresAt > Date.now() && mem.rows.length) return mem.rows;

  const sb = getServiceSupabase();
  if (sb) {
    /* 여기서 실패를 삼키는 것 자체는 맞다 — 이건 캐시 조회고, 못 읽었으면 아래
       파일 캐시로, 그것도 없으면 원본으로 내려간다. 틀린 값이 나갈 자리가 없다.
       다만 **조용히** 삼키지는 않는다. 캐시가 계속 안 읽히면 매 요청이 원본까지
       내려가는데, 로그가 없으면 그게 느려진 이유라는 걸 아무도 모른다.
       (try/catch 는 걷어냈다. 쿼리 빌더는 던지지 않고 { data, error } 를
       돌려주므로 그 catch 는 한 번도 실행된 적이 없는 죽은 코드였다.) */
    const { data, error } = await sb
      .from("public_data_cache")
      .select("payload")
      .eq("cache_key", key)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) {
      logger.warn(
        `[geo-etl] public_data_cache 조회 실패 (${key}) — 파일 캐시로 내려갑니다: ${error.message}`,
      );
    }
    const payload = data?.payload;
    if (Array.isArray(payload) && payload.length) {
      memGeo.set(key, { rows: payload as GeoEtlRow[], expiresAt: Date.now() + 3_600_000 });
      return payload as GeoEtlRow[];
    }
  }

  const fromFile = readFileCache(kind, district);
  if (fromFile?.length) {
    memGeo.set(key, { rows: fromFile, expiresAt: Date.now() + 3_600_000 });
    return fromFile;
  }

  const fromAll = readFileCache(kind);
  if (fromAll?.length) {
    const needle = district?.replace(/구$/, "").trim();
    const filtered = needle
      ? fromAll.filter(
          (r) =>
            r.district.includes(needle) ||
            r.district.replace(/구$/, "").includes(needle),
        )
      : fromAll;
    if (filtered.length) return filtered;
  }

  return null;
}
