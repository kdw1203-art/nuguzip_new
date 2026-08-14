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
import { createHash } from "node:crypto";
import { logger } from "@/lib/log";
import { getServiceSupabase } from "@/lib/supabase/service";

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
 * DB 영속화 — 외부 APM(웹훅/Sentry) 자격증명이 없어도 에러가 "보이게" 한다.
 *
 * 제품 리뷰 최우선 결함이 "capture-only 라 프로덕션 에러가 사실상 안 보임"
 * 이었다. 여기서 ops.error_log 에 upsert 하면 관리자 화면(/admin/ops)에서
 * 최근 에러를 실제로 볼 수 있다. fingerprint 로 같은 에러를 묶어 폭주해도
 * 1행이다. 서비스롤 미구성 시 조용히 건너뛴다(로그는 이미 남았다). never throw.
 */
function persistToDb(payload: CapturePayload): void {
  try {
    const sb = getServiceSupabase();
    if (!sb) return;
    const scope =
      typeof payload.context?.scope === "string" ? payload.context.scope : payload.level;
    const source =
      typeof payload.context?.source === "string" ? payload.context.source : null;
    const path = typeof payload.context?.path === "string" ? payload.context.path : null;
    // 같은 메시지+scope 는 같은 지문 — 숫자(주문번호 등)는 지문에서 지워 뭉치지 않게 한다
    const normalized = payload.message.replace(/\d+/g, "#").slice(0, 300);
    const fingerprint = createHash("sha1")
      .update(`${payload.level}|${scope}|${normalized}`)
      .digest("hex");
    void (sb
      .rpc("record_error", {
        p_fingerprint: fingerprint,
        p_level: payload.level,
        p_source: source ?? scope,
        p_message: payload.message,
        p_stack: payload.stack ?? null,
        p_path: path,
        p_context: (payload.context ?? {}) as Record<string, unknown>,
      }) as unknown as Promise<unknown>)
      .then(() => {})
      .then(undefined, () => {
        /* 영속화 실패는 무시 — 모니터링은 앱을 막지 않는다 */
      });
  } catch {
    /* never throw */
  }
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
    const err = error instanceof Error ? error : undefined;
    const message =
      err?.message ?? (typeof error === "string" ? error : String(error));
    const payload: CapturePayload = {
      level: "error",
      message,
      stack: err?.stack,
      context,
      timestamp: new Date().toISOString(),
    };
    // DB 영속화는 외부 모니터링 설정과 무관하게 항상 시도한다(에러 가시화).
    persistToDb(payload);
    if (isMonitoringConfigured()) sendToSink(payload);
  } catch {
    /* never throw */
  }
}

/** 임의 메시지를 캡처한다(경보성 로그). 항상 로깅하고, 설정 시 웹훅으로 전송한다. */
export function captureMessage(msg: string, context?: Context): void {
  try {
    logger.error("[monitoring] message", msg, context ?? {});
    const payload: CapturePayload = {
      level: "message",
      message: msg,
      context,
      timestamp: new Date().toISOString(),
    };
    persistToDb(payload);
    if (isMonitoringConfigured()) sendToSink(payload);
  } catch {
    /* never throw */
  }
}
