/**
 * Web Push VAPID 유틸리티
 *
 * 사용 전 VAPID 키 생성:
 *   npx web-push generate-vapid-keys
 * 그 다음 .env 에 추가:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>
 *   VAPID_PRIVATE_KEY=<privateKey>
 *   VAPID_SUBJECT=mailto:admin@yourdomain.com
 */
import webpush from "web-push";
import { logger } from "@/lib/log";

let initialized = false;

export function initWebPush() {
  if (initialized) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@woodong.kr";

  if (!publicKey || !privateKey) {
    logger.warn("[push] VAPID 키 미설정. /api/push/* 비활성화.");
    return;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  eventType?: "comment" | "meeting" | "expert" | "attendance" | "payment" | "generic";
};

export async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload,
): Promise<{ ok: boolean; expired?: boolean }> {
  initWebPush();
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    // 410 Gone = 구독 만료/삭제됨
    if (status === 410 || status === 404) return { ok: false, expired: true };
    throw err;
  }
}

export function getVapidPublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}
