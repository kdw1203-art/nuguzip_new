/**
 * 경량 서버 로거 — raw `console.*` 대신 사용해 일관된 prefix·레벨 제어를 제공한다.
 *
 *  - 개발(`NODE_ENV !== production`): 모든 레벨 출력.
 *  - 프로덕션: `warn`/`error` 만 출력(`info`/`debug`는 억제)해 로그 노이즈를 줄인다.
 *  - 민감 값(토큰·시크릿·비밀번호 등)은 자동 마스킹한다.
 *
 * 사용: `import { logger } from "@/lib/log";` → `logger.error("[ai/chat] 실패", err)`
 *
 * ── 2026-07-27: 마스킹이 로그를 통째로 못 읽게 만들고 있었다 ────────────────
 * 예전 mask() 는 **모든 최상위 문자열**을 `앞2***뒤2` 로 잘랐다. 마스킹 대상은
 * 민감한 "값"이어야 하는데 사람이 읽는 "메시지"까지 잘려서, 운영 로그가 이렇게
 * 남았다:
 *
 *   logger.error("[map] 단지 목록 조회 실패", err)  →  [m***패
 *   logger.warn("[market-agg] 갱신 실패:", msg)     →  [m***:
 *
 * 즉 이 저장소가 공들여 남긴 실패 메시지가 한 줄도 읽히지 않았다. 장애 때
 * "어디가 왜 실패했는지"를 알 수 없다는 뜻이라, 마스킹이 지키려던 것보다 잃은
 * 것이 훨씬 컸다.
 *
 * 이제는 **자격증명처럼 생긴 문자열만** 가린다:
 *   · 민감 키가 붙은 값 (`token=…`, `"apiKey": "…"`, `Authorization: Bearer …`)
 *   · JWT(`eyJ…`) · `sk-`/`ghp_` 류 접두사 토큰
 *   · 공백 없는 32자 이상 base64/hex 덩어리 (사람 글이 이렇게 생길 일은 없다)
 * 나머지 문자열은 그대로 남는다. 객체는 예전처럼 민감 **키**의 값을 가리되,
 * 이제 중첩까지 따라 들어간다(예전엔 한 겹만 봐서 `{ a: { token } }` 이 샜다).
 */

const isProd = process.env.NODE_ENV === "production";

const SENSITIVE = /(token|secret|password|passwd|api[-_]?key|authorization|cookie|credential)/i;

/** 중첩 객체 마스킹 깊이 상한 — 순환 참조·거대 객체 방어 */
const MAX_DEPTH = 4;

/** `token=abc`, `"apiKey": "abc"`, `Authorization: Bearer abc` 형태의 값 */
const SENSITIVE_ASSIGNMENT =
  /((?:token|secret|password|passwd|api[-_]?key|authorization|cookie|credential)"?\s*[:=]\s*"?)(?:Bearer\s+)?([^\s"'&,;}]{4,})/gi;

/** 자격증명처럼 생긴 덩어리 — JWT · 접두사 토큰 · 긴 base64/hex */
const CREDENTIAL_SHAPES: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, // JWT
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, // sk-… 류 API 키
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/g, // GitHub 토큰
  /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/g, // 공백 없는 40자+ 덩어리
];

function maskString(value: string): string {
  let out = value.replace(SENSITIVE_ASSIGNMENT, (_m, head: string) => `${head}***`);
  for (const re of CREDENTIAL_SHAPES) out = out.replace(re, "***");
  return out;
}

function mask(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return maskString(value);
  if (!value || typeof value !== "object") return value;
  /* Error 는 스택이 통째로 필요하다. message 안의 자격증명만 가리고 싶어도
     Error 를 새로 만들면 스택이 이 파일을 가리키게 되어 원인 지점을 잃는다. */
  if (value instanceof Error) return value;
  if (depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((v) => mask(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? "***" : mask(v, depth + 1);
  }
  return out;
}

function sanitize(args: unknown[]): unknown[] {
  return args.map((a) => mask(a));
}

export const logger = {
  debug(...args: unknown[]) {
    if (!isProd) console.debug(...sanitize(args));
  },
  info(...args: unknown[]) {
    if (!isProd) console.info(...sanitize(args));
  },
  warn(...args: unknown[]) {
    console.warn(...sanitize(args));
  },
  error(...args: unknown[]) {
    console.error(...sanitize(args));
  },
};

export type Logger = typeof logger;
