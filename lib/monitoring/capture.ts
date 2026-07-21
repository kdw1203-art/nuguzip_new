/**
 * #14 에러 모니터링 추상화 (Sentry-ready, 의존성 없음, env-gated).
 *
 * 설계 원칙
 *  - 항상 `logger.error` 로 남긴다(모니터링 미설정이어도 로그는 남는다).
 *  - `SENTRY_DSN` 또는 `ALERT_WEBHOOK_URL` 이 설정된 경우에만 "활성"으로 간주하고,
 *    `ALERT_WEBHOOK_URL`(우선) 로 compact JSON 을 fire-and-forget POST 한다.
 *  - 절대 throw 하지 않는다 — 모니터링이 앱 흐름을 깨서는 안 된다.
 *  - 후일 `@sentry/nextjs` 를 도입할 때는 `sendToSink()` 한 곳만 교체하면 된다
 *    (예: `Sentry.captureException(error, { extra: context })`). 호출부 API 는 이미
 *    Sentry 와 동일한 `captureException` / `captureMessage` 시그니처를 사용한다.
 *
 * 사용: `import { captureException } from "@/lib/monitoring/capture";`
 */
import "server-only";
import { logger } from "@/lib/log";

type Context = Record<string, unknown>;

interface CapturePayload {
  level: "error" | "message";
  message: string;
  stack?: string;
  context?: Context;
  /** 호출(발생) 시점 타임스탬프 — 수신 측이 아니라 caller 가 찍는다. */
  timestamp: string;
}

/** SENTRY_DSN 또는 ALERT_WEBHOOK_URL 중 하나라도 설정되어 있으면 true. */
export function isMonitoringConfigured(): boolean {
  return Boolean(
    process.env.SENTRY_DSN?.trim() || process.env.ALERT_WEBHOOK_URL?.trim(),
  );
}

/**
 * 실제 전송 sink — 지금은 ALERT_WEBHOOK_URL 로의 fire-and-forget POST.
 * `@sentry/nextjs` 도입 시 이 함수 본문을 Sentry SDK 호출로 교체한다.
 * 응답을 기다리지 않으며, 모든 오류를 삼킨다.
 */
function sendToSink(payload: CapturePayload): void {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  // 웹훅 URL 이 없으면(예: SENTRY_DSN 만 설정) 전송을 건너뛴다 —
  // 이 지점이 향후 Sentry SDK 를 끼워 넣는 seam 이다.
  if (!url) return;
  try {
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      /* 전송 실패는 무시 — 모니터링은 앱을 막지 않는다 */
    });
  } catch {
    /* fetch 구성 단계 오류도 무시 */
  }
}

/** 예외를 캡처한다. 항상 로깅하고, 설정 시 웹훅으로 전송한다. 절대 throw 하지 않는다. */
export function captureException(error: unknown, context?: Context): void {
  try {
    logger.error("[monitoring] exception", error, context ?? {});
    if (!isMonitoringConfigured()) return;
    const err = error instanceof Error ? error : undefined;
    const message =
      err?.message ?? (typeof error === "string" ? error : String(error));
    sendToSink({
      level: "error",
      message,
      stack: err?.stack,
      context,
      timestamp: new Date().toISOString(),
    });
  } catch {
    /* never throw */
  }
}

/** 임의 메시지를 캡처한다(경보성 로그). 항상 로깅하고, 설정 시 웹훅으로 전송한다. */
export function captureMessage(msg: string, context?: Context): void {
  try {
    logger.error("[monitoring] message", msg, context ?? {});
    if (!isMonitoringConfigured()) return;
    sendToSink({
      level: "message",
      message: msg,
      context,
      timestamp: new Date().toISOString(),
    });
  } catch {
    /* never throw */
  }
}
