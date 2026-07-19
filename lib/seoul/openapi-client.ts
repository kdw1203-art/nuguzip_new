/**
 * 서울 열린데이터광장 Open API 클라이언트.
 * URL: http://openapi.seoul.go.kr:8088/{KEY}/{json|xml}/{service}/{start}/{end}/{...}
 */

export class SeoulApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SeoulApiError";
    this.code = code;
  }
}

export function getSeoulApiKey(): string | null {
  const key = process.env.SEOUL_DATA_API_KEY?.trim();
  return key || null;
}

export function isSeoulApiConfigured(): boolean {
  return Boolean(getSeoulApiKey());
}

export function buildSeoulOpenApiUrl(
  serviceName: string,
  start: number,
  end: number,
  extraSegments: string[] = [],
  format: "json" | "xml" = "json",
): string | null {
  const key = getSeoulApiKey();
  if (!key) return null;
  const segments = [
    key,
    format,
    serviceName,
    String(start),
    String(end),
    ...extraSegments.map((s) => encodeURIComponent(s)),
  ];
  return `http://openapi.seoul.go.kr:8088/${segments.join("/")}/`;
}

export type SeoulFetchResult = {
  serviceName: string;
  rows: Record<string, unknown>[];
  totalCount: number;
  resultCode: string;
};

function normalizeRows(row: unknown): Record<string, unknown>[] {
  if (!row) return [];
  if (Array.isArray(row)) return row as Record<string, unknown>[];
  return [row as Record<string, unknown>];
}

function parseXmlRows(xml: string, serviceName: string): SeoulFetchResult {
  const codeMatch = xml.match(/<CODE>([^<]+)<\/CODE>/);
  const messageMatch = xml.match(/<MESSAGE>([^<]*)<\/MESSAGE>/);
  const code = codeMatch?.[1] ?? "UNKNOWN";
  if (code !== "INFO-000") {
    throw new SeoulApiError(code, messageMatch?.[1] ?? "Seoul API error");
  }

  const totalMatch = xml.match(/<list_total_count>(\d+)<\/list_total_count>/);
  const totalCount = totalMatch ? Number(totalMatch[1]) : 0;

  const rows: Record<string, unknown>[] = [];
  const rowBlocks = xml.match(/<row>([\s\S]*?)<\/row>/g) ?? [];
  for (const block of rowBlocks) {
    const row: Record<string, unknown> = {};
    const fields = block.matchAll(/<([A-Z0-9_]+)>([^<]*)<\/\1>/g);
    for (const m of fields) {
      row[m[1]] = m[2];
    }
    if (Object.keys(row).length > 0) rows.push(row);
  }

  return { serviceName, rows, totalCount, resultCode: code };
}

function parseJsonPayload(
  parsed: Record<string, unknown>,
  serviceName: string,
): SeoulFetchResult {
  const topLevelResult = parsed.RESULT as { CODE?: string; MESSAGE?: string } | undefined;
  const root = parsed[serviceName] as
    | {
        list_total_count?: number | string;
        RESULT?: { CODE?: string; MESSAGE?: string };
        row?: unknown;
      }
    | undefined;

  const resultBlock = root?.RESULT ?? topLevelResult;
  const code = resultBlock?.CODE ?? "UNKNOWN";

  if (code !== "INFO-000") {
    throw new SeoulApiError(code, resultBlock?.MESSAGE ?? "Seoul API error");
  }

  if (!root) {
    return { serviceName, rows: [], totalCount: 0, resultCode: code };
  }

  return {
    serviceName,
    rows: normalizeRows(root.row),
    totalCount: Number(root.list_total_count ?? 0),
    resultCode: code,
  };
}

export async function fetchSeoulOpenApi(
  serviceName: string,
  start = 1,
  end = 1000,
  extraSegments: string[] = [],
  format: "json" | "xml" = "json",
): Promise<SeoulFetchResult> {
  const url = buildSeoulOpenApiUrl(serviceName, start, end, extraSegments, format);
  if (!url) {
    throw new SeoulApiError("NO_KEY", "SEOUL_DATA_API_KEY is not configured");
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new SeoulApiError("HTTP_ERROR", `HTTP ${res.status} for ${serviceName}`);
  }

  const text = await res.text();
  if (format === "xml" || text.trimStart().startsWith("<?xml")) {
    return parseXmlRows(text, serviceName);
  }

  const parsed = JSON.parse(text) as Record<string, unknown>;
  return parseJsonPayload(parsed, serviceName);
}

export async function fetchAllSeoulRows(
  serviceName: string,
  options: {
    extraSegments?: string[];
    pageSize?: number;
    maxPages?: number;
    format?: "json" | "xml";
  } = {},
): Promise<SeoulFetchResult> {
  const pageSize = options.pageSize ?? 1000;
  const maxPages = options.maxPages ?? 10;
  const extraSegments = options.extraSegments ?? [];
  const format = options.format ?? "json";

  let start = 1;
  const allRows: Record<string, unknown>[] = [];
  let totalCount = 0;
  let resultCode = "INFO-000";

  for (let page = 0; page < maxPages; page++) {
    const end = start + pageSize - 1;
    const batch = await fetchSeoulOpenApi(serviceName, start, end, extraSegments, format);
    totalCount = batch.totalCount;
    resultCode = batch.resultCode;
    allRows.push(...batch.rows);
    if (allRows.length >= totalCount || batch.rows.length < pageSize) break;
    start += pageSize;
  }

  return { serviceName, rows: allRows, totalCount, resultCode };
}

export function extractDistrictFromAddress(address: string): string | null {
  const match = address.match(/([가-힣]+(?:구|군))/);
  return match?.[1] ?? null;
}

export function matchesDistrict(
  district: string | undefined,
  candidate: string | null | undefined,
): boolean {
  if (!district?.trim()) return true;
  if (!candidate?.trim()) return false;
  const d = district.trim();
  const c = candidate.trim();
  return c === d || c.includes(d) || d.includes(c.replace(/특별시|광역시/g, "").trim());
}
