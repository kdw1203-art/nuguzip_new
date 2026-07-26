import "server-only";

import { logger } from "@/lib/log";

/**
 * N1 — IndexNow 제출.
 *
 * 왜 필요한가: 새 URL 이 검색엔진에 잡히기까지 크롤러가 우리를 다시 찾아올 때까지
 * 기다려야 한다(며칠~몇 주). IndexNow 는 "이 URL 이 바뀌었다"를 우리가 먼저
 * 알리는 표준 프로토콜이고, 빙·네이버·Yandex·Seznam 이 같은 엔드포인트를 공유한다.
 * 빙이 받는다는 게 GEO 관점에서 특히 중요하다 — ChatGPT 웹검색·Copilot 의 인용
 * 원천이 빙 색인이기 때문이다. (구글은 IndexNow 를 쓰지 않는다. 구글용은 사이트맵.)
 *
 * 키는 비밀이 아니다. 프로토콜 자체가 "키 파일을 사이트 루트에 공개하라"고
 * 요구한다(소유 증명 방식이 그것이다). 그래서 env 가 아니라 상수로 두고,
 * public/<key>.txt 와 한 쌍으로 관리한다 — env 로 빼면 키 파일과 어긋난 순간
 * 전 제출이 조용히 422 로 죽는다. check-final-release 가 이 쌍을 검사한다.
 *
 * 제출 원칙 — 실제로 바뀐 URL 만 보낸다.
 * 사이트 전체를 매일 밀어 넣는 건 프로토콜 남용이고, 스팸으로 분류되면 도메인
 * 단위로 무시당한다. 호출부(app/api/cron/indexnow-submit)가 "최근 갱신"만
 * 골라 넘기는 이유다.
 */

/** IndexNow 키 — public/4a720d8a3dc61704cf05d0fe9e92900b.txt 와 같은 값이어야 한다. */
export const INDEXNOW_KEY = "4a720d8a3dc61704cf05d0fe9e92900b";

export const INDEXNOW_HOST = "nuguzip.com";
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;

/** 프로토콜 상한은 10,000. 우리는 한 번에 그만큼 바뀔 일이 없어 넉넉히 낮춘다. */
const MAX_URLS = 1000;

const ENDPOINT = "https://api.indexnow.org/IndexNow";

export type IndexNowResult = {
  ok: boolean;
  /** 실제로 제출한 URL 수 (중복·타 호스트 제거 후) */
  submitted: number;
  /** HTTP 상태 — 네트워크 실패 시 0 */
  status: number;
  message: string;
  urls: string[];
};

/** 우리 호스트의 URL 만 남기고 중복을 제거한다(타 호스트를 넣으면 전체가 거부된다). */
export function normalizeIndexNowUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of urls) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const abs = trimmed.startsWith("http")
      ? trimmed
      : `https://${INDEXNOW_HOST}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
    let parsed: URL;
    try {
      parsed = new URL(abs);
    } catch {
      continue;
    }
    if (parsed.hostname !== INDEXNOW_HOST) continue;
    // 쿼리스트링은 canonical 대상이 아니다 — 색인 신호를 쪼개지 않는다.
    parsed.search = "";
    parsed.hash = "";
    seen.add(parsed.toString());
    if (seen.size >= MAX_URLS) break;
  }
  return [...seen];
}

/**
 * IndexNow 에 URL 목록을 제출한다. 실패해도 절대 throw 하지 않는다 —
 * 색인 힌트 전송 실패가 크론 전체(집계 갱신 등)를 죽이면 안 된다.
 */
export async function submitIndexNow(rawUrls: string[]): Promise<IndexNowResult> {
  const urls = normalizeIndexNowUrls(rawUrls);
  if (urls.length === 0) {
    return { ok: true, submitted: 0, status: 0, message: "제출할 URL 이 없습니다.", urls };
  }

  const body = JSON.stringify({
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList: urls,
  });

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    // 200 OK · 202 Accepted 가 정상. 그 외는 이유를 남긴다.
    const ok = res.status === 200 || res.status === 202;
    const message = ok
      ? `IndexNow 제출 완료 (${urls.length}건, HTTP ${res.status})`
      : `IndexNow 거부 — HTTP ${res.status} (400 형식오류 · 403 키불일치 · 422 URL/키 불일치 · 429 과다요청)`;
    if (!ok) logger.warn(`[indexnow] ${message}`);
    return { ok, submitted: urls.length, status: res.status, message, urls };
  } catch (e) {
    const message = `IndexNow 전송 실패: ${e instanceof Error ? e.message : String(e)}`;
    logger.warn(`[indexnow] ${message}`);
    return { ok: false, submitted: 0, status: 0, message, urls };
  }
}
