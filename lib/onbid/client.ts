import "server-only";
import { logger } from "@/lib/log";

/**
 * 온비드(한국자산관리공사) 부동산 물건목록 조회 Open API 클라이언트.
 * 서비스: OnbidRlstListSrvc2 / getRlstCltrList2 (공공데이터포털)
 *  base: https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2
 *
 * ONBID_SERVICE_KEY(공공데이터포털 일반 인증키) 미설정 시 null(정상 폴백).
 * data.go.kr 인증키는 URL-encode 되지 않은 원문을 저장하고, 요청 시 encode 한다.
 */

const BASE = "https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2";

export function isOnbidConfigured(): boolean {
  return Boolean(process.env.ONBID_SERVICE_KEY?.trim());
}

export type OnbidItem = Record<string, string>;

/**
 * 부동산 공매 물건 목록 조회.
 * @param opts.sido 소재지 시도 필터(예: "서울특별시")
 * @param opts.prptDivCd 재산유형(기본 "0007,0005,0006,0008" — 압류·기타·유입·수탁)
 */
export async function fetchOnbidList(opts: {
  sido?: string;
  prptDivCd?: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<{ items: OnbidItem[]; totalCount: number } | null> {
  const key = process.env.ONBID_SERVICE_KEY?.trim();
  if (!key) return null;
  const params = new URLSearchParams({
    serviceKey: key,
    resultType: "json",
    pageNo: String(opts.pageNo ?? 1),
    numOfRows: String(opts.numOfRows ?? 100),
    prptDivCd: opts.prptDivCd ?? "0007,0005,0006,0008",
    pvctTrgtYn: "N",
  });
  if (opts.sido) params.set("lctnSdnm", opts.sido);
  try {
    const res = await fetch(`${BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      logger.error("[onbid] request failed", res.status);
      return null;
    }
    const text = await res.text();
    // 인증키 오류 등은 XML 로 내려올 수 있음 — JSON 파싱 실패 시 null
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      logger.error("[onbid] non-json response", text.slice(0, 200));
      return null;
    }
    // 응답 래핑이 { header, body } (top-level) 또는 { response: { body } } 두 형태 모두 대응
    const d = data as {
      body?: Record<string, unknown>;
      response?: { body?: Record<string, unknown> };
    };
    const body = d.body ?? d.response?.body;
    if (!body) return null;
    const rawItems = (body.items as { item?: OnbidItem | OnbidItem[] } | undefined)
      ?.item;
    const items = Array.isArray(rawItems)
      ? rawItems
      : rawItems
        ? [rawItems]
        : [];
    const totalCount = Number(body.totalCount ?? items.length) || items.length;
    return { items, totalCount };
  } catch (e) {
    logger.error("[onbid] error", e);
    return null;
  }
}
