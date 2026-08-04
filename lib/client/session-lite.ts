"use client";

/**
 * 최적화 26 — /api/auth/session 클라이언트 호출 수렴.
 *
 * 헤더 아바타·전체 메뉴·홈 미니지도·애드센스 유닛이 각자 fetch 해서 페이지당
 * 같은 요청이 최대 4번 나갔다. 모듈 스코프 공유 프라미스로 1회화한다.
 * - TTL 30초: 같은 페이지 수명 안 재사용이 목적이다. 로그인/로그아웃 직후의
 *   신선도는 전체 리로드(라우트 핸들러 이동)가 보장하므로 짧게 잡아도 안전.
 * - 실패는 캐시하지 않는다 — 실패를 30초 캐시하면 일시 오류가 "비로그인
 *   30초"로 굳는다(시세 스냅샷 빈 성공 캐시와 같은 함정).
 */

export type SessionLite = {
  user?: {
    email?: string | null;
    name?: string | null;
    plan?: string | null;
    role?: string | null;
  } | null;
} | null;

const TTL_MS = 30_000;

let cache: { at: number; promise: Promise<SessionLite> } | null = null;

export function getSessionLite(): Promise<SessionLite> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = fetch("/api/auth/session")
    .then((r) => (r.ok ? (r.json() as Promise<SessionLite>) : null))
    .catch(() => null)
    .then((s) => {
      // 실패(null)는 캐시에서 제거 — 다음 호출이 다시 시도한다
      if (s === null && cache?.promise === promise) cache = null;
      return s;
    });
  cache = { at: Date.now(), promise };
  return promise;
}
