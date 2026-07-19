/**
 * 경량 서버 로거 — raw `console.*` 대신 사용해 일관된 prefix·레벨 제어를 제공한다.
 *
 *  - 개발(`NODE_ENV !== production`): 모든 레벨 출력.
 *  - 프로덕션: `warn`/`error` 만 출력(`info`/`debug`는 억제)해 로그 노이즈를 줄인다.
 *  - 민감 키(token/secret/password/key 등)는 자동 마스킹한다.
 *
 * 사용: `import { logger } from "@/lib/log";` → `logger.error("[ai/chat] 실패", err)`
 */

const isProd = process.env.NODE_ENV === "production";

const SENSITIVE = /(token|secret|password|passwd|api[-_]?key|authorization|cookie)/i;

function mask(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 8 ? `${value.slice(0, 2)}***${value.slice(-2)}` : "***";
  }
  if (value && typeof value === "object") {
    if (value instanceof Error) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "***" : v;
    }
    return out;
  }
  return value;
}

function sanitize(args: unknown[]): unknown[] {
  return args.map(mask);
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
