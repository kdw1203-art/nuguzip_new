"use client";

/**
 * /api/home/personal 클라이언트 호출 수렴.
 *
 * 로그인 홈 한 번에 이 라우트가 최대 3번 나갔다 — PersonalHome 1회, 그리고
 * 모바일·데스크탑 두 벌로 렌더되는 HomeMiniMap 이 각각 1회. 응답 한 벌을
 * 만드는 데 서버에서 7갈래 조회가 도는 라우트라, 같은 데이터를 세 번 만들고
 * 두 벌을 버린 셈이다. 모듈 스코프 공유 프라미스로 1회화한다.
 *
 * - TTL 30초: 같은 페이지 수명 안에서의 재사용이 목적이다(session-lite 와 동일).
 * - 실패는 캐시하지 않는다 — 일시 오류를 30초 눌러앉히면 "개인화 없음"이 굳는다.
 * - `no-store`: 응답에 이름·관심지역·노트 수가 들어 있다. 공용 PC 에서 앞사람
 *   데이터가 뒷사람 화면에 뜨는 일이 없도록 브라우저 캐시를 아예 쓰지 않는다.
 *   (서버도 `private, no-store` 로 내려준다 — 한쪽만 막으면 막은 게 아니다)
 *
 * 타입은 호출부가 정한다 — 이 모듈은 클라이언트라서 라우트의 서버 타입을
 * 끌어올 수 없다(서버 전용 모듈이 딸려 온다).
 */

const TTL_MS = 30_000;

let cache: { at: number; promise: Promise<unknown> } | null = null;

/** 성공 시 응답 JSON, 비로그인(401)·오류·네트워크 실패 시 null. */
export function getHomePersonal<T = unknown>(): Promise<T | null> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.promise as Promise<T | null>;
  }
  const promise: Promise<unknown> = fetch("/api/home/personal", {
    cache: "no-store",
  })
    .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
    .catch(() => null)
    .then((d) => {
      if (d === null && cache?.promise === promise) cache = null;
      return d;
    });
  cache = { at: Date.now(), promise };
  return promise as Promise<T | null>;
}
