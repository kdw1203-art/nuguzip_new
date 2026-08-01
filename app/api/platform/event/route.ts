import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { detectShellFromUserAgent } from "@/lib/platform-shell";
import { recordPlatformEvent } from "@/lib/platform-events";
import {
  normalizeSubject,
  recordExposure,
  sanitizeExperimentTag,
} from "@/lib/experiments/server";
import { getExperiment } from "@/lib/experiments/registry";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  /* 무인증 텔레메트리 — 정상 사용은 페이지 이동당 몇 건이다. 도배만 막는다. */
  const rl = rateLimit(`platform-event:${getClientIp(req)}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  const session = await safeAuth();
  const platform = detectShellFromUserAgent(req.headers.get("user-agent"));
  const body = (await req.json().catch(() => ({}))) as {
    eventName?: string;
    source?: string;
    campaign?: string;
    path?: string;
    metadata?: Record<string, unknown>;
    experimentKey?: string;
    variant?: string;
    anonId?: string;
  };

  const eventName = body.eventName?.trim().slice(0, 80);
  if (!eventName) {
    return NextResponse.json({ error: "eventName이 필요합니다." }, { status: 400 });
  }

  const blocked = new Set(["password", "token", "secret", "authorization", "cookie"]);
  const metadata = Object.fromEntries(
    Object.entries(body.metadata ?? {})
      .filter(([k]) => !blocked.has(k.toLowerCase()))
      .slice(0, 30),
  );

  /* A7 — 실험 태그는 등록부와 대조해 통과한 것만 저장한다. 브라우저가 보낸 문자열을
     그대로 믿으면 오타·구버전 클라이언트가 만든 유령 변형이 결과에 섞인다. */
  const tag = sanitizeExperimentTag(body.experimentKey, body.variant);

  await recordPlatformEvent({
    platform,
    eventName,
    userEmail: session?.user?.email ?? null,
    source: body.source,
    campaign: body.campaign,
    path: body.path,
    metadata,
    experimentKey: tag?.experimentKey ?? null,
    variant: tag?.variant ?? null,
  });

  /* 노출 이벤트일 때만 배정을 누적한다. 클릭까지 세면 exposure_count 가
     "본 횟수"가 아니라 "이벤트 수"가 되어 이름과 뜻이 어긋난다. */
  if (tag) {
    const def = getExperiment(tag.experimentKey);
    if (def && eventName === def.exposureEvent) {
      const subject = normalizeSubject({
        userEmail: session?.user?.email ?? null,
        anonId: body.anonId ?? null,
      });
      if (subject) {
        await recordExposure({
          experimentKey: tag.experimentKey,
          variant: tag.variant,
          subject,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, platform });
}
