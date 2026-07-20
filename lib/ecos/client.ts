import "server-only";
import { logger } from "@/lib/log";

/**
 * 한국은행 ECOS(경제통계시스템) Open API 클라이언트.
 * 명세: 100대 통계지표(KeyStatisticList) — 기준금리·환율·경제성장률 등.
 *  GET https://ecos.bok.or.kr/api/KeyStatisticList/{authkey}/json/kr/1/100
 *
 * ECOS_API_KEY 미설정 시 null 반환(정상 폴백). 컨테이너/CI에는 egress 없어 실패도 graceful.
 */

export function isEcosConfigured(): boolean {
  return Boolean(process.env.ECOS_API_KEY?.trim());
}

export type EcosKeyStat = {
  className: string;
  name: string;
  value: string;
  cycle: string;
  unit: string;
};

/** 100대 통계지표 조회 — 실패·미설정 시 null */
export async function fetchKeyStatistics(): Promise<EcosKeyStat[] | null> {
  const key = process.env.ECOS_API_KEY?.trim();
  if (!key) return null;
  try {
    const url = `https://ecos.bok.or.kr/api/KeyStatisticList/${encodeURIComponent(
      key,
    )}/json/kr/1/100`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      logger.error("[ecos] request failed", res.status);
      return null;
    }
    const data = (await res.json()) as {
      KeyStatisticList?: { row?: Array<Record<string, string>> };
      RESULT?: { CODE?: string; MESSAGE?: string };
    };
    const rows = data.KeyStatisticList?.row;
    if (!Array.isArray(rows)) {
      // 인증키 오류 등은 RESULT 로 내려옴
      if (data.RESULT?.CODE) logger.error("[ecos]", data.RESULT.MESSAGE);
      return null;
    }
    return rows.map((r) => ({
      className: String(r.CLASS_NAME ?? ""),
      name: String(r.KEYSTAT_NAME ?? ""),
      value: String(r.DATA_VALUE ?? ""),
      cycle: String(r.CYCLE ?? ""),
      unit: String(r.UNIT_NAME ?? ""),
    }));
  } catch (e) {
    logger.error("[ecos] error", e);
    return null;
  }
}
