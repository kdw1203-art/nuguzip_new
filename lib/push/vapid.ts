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
import { DEFAULT_ADMIN_EMAIL } from "@/lib/brand/business-info";

let initialized = false;

export function initWebPush() {
  if (initialized) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  /* VAPID subject 는 푸시 제공자(구글·애플 등)가 문제가 생겼을 때 연락하는
     주소다. admin@woodong.kr 로 굳어 있었는데 이 서비스 도메인도 아니고 받는
     사람도 없다 — 발송이 차단돼도 통지를 못 받는다. */
  const subject = process.env.VAPID_SUBJECT ?? `mailto:${DEFAULT_ADMIN_EMAIL}`;

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

/**
 * 이 서버가 **실제로 웹 푸시를 보낼 수 있는지**.
 *
 * 공개키만 보면 안 된다 — 공개키는 브라우저 구독을 만들 때 쓰고, 실제 발송에는
 * 개인키가 필요하다. 둘 중 하나만 있으면 구독은 만들어지는데 발송은 안 되는,
 * 사용자 입장에서 가장 알아채기 어려운 상태가 된다.
 *
 * 화면에서 "알림 받기" 류의 입구를 그릴지 판단할 때 이 함수를 쓸 것.
 */
export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim(),
  );
}
