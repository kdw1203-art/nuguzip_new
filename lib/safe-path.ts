/**
 * 내부 경로만 허용하는 리다이렉트 가드.
 *
 * 흔히 쓰는 `s.startsWith("/") && !s.startsWith("//")` 는 한 칸 모자란다.
 * `//evil.com` 은 막지만 **`/\evil.com` 은 통과**하기 때문이다. 브라우저는
 * URL 경로에서 역슬래시를 슬래시로 정규화하고(WHATWG URL 표준의 special scheme 규칙,
 * 크롬은 요청을 보내기 전에 이미 바꾼다), `new URL("/\\evil.com", origin)` 은
 * `https://evil.com/` 이 된다. 즉 두 번째 문자를 보지 않으면 오픈 리다이렉트가 남는다.
 *
 * 우리 도메인 링크로 보이는 피싱은 메일 본문에서 특히 잘 먹힌다
 * (`https://naezipnow.com/...` 로 시작하니까). 그래서 리다이렉트 대상은 전부 여기를 지난다.
 *
 * 규칙: 첫 글자가 `/` 이고, 두 번째 글자가 `/` 도 `\` 도 아닐 것.
 *   허용   /town  ·  /login?verified=1  ·  /
 *   차단   //evil.com  ·  /\evil.com  ·  https://evil.com  ·  javascript:...
 */
const INTERNAL_PATH = /^\/(?:[^/\\]|$)/;

/** 내부 경로인가? (판정만 필요할 때) */
export function isInternalPath(raw: unknown): raw is string {
  return typeof raw === "string" && INTERNAL_PATH.test(raw);
}

/** 내부 경로면 그대로, 아니면 `fallback`. 리다이렉트 대상을 만들 때 쓴다. */
export function safeInternalPath(raw: unknown, fallback = "/"): string {
  return isInternalPath(raw) ? raw : fallback;
}
