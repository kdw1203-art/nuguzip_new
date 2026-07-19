import { NextResponse } from "next/server";
import {
  verifyTossUnlinkBasicAuth,
  type TossUnlinkReferrer,
} from "@/lib/auth/toss-login";
import { logger } from "@/lib/log";

/**
 * 토스 로그인 "연결 끊기" 콜백.
 * @see https://developers-apps-in-toss.toss.im/login/intro.md (④ 연결 끊기 콜백 정보)
 *
 * 사용자가 토스앱에서 로그인 연결을 해제하면 콘솔에 등록한 이 URL로 호출됩니다.
 * - HTTP 메서드: GET 또는 POST (콘솔 설정에 맞춰 둘 다 지원)
 * - Basic Auth 헤더(base64)를 디코딩해 콘솔 입력값과 일치하는지 검증
 * - referrer: UNLINK | WITHDRAWAL_TERMS | WITHDRAWAL_TOSS
 *
 * 콘솔 등록 URL 예: https://nuguzip.com/api/auth/toss/unlink
 */

export const dynamic = "force-dynamic";

function parseReferrer(v: string | null | undefined): TossUnlinkReferrer | null {
  if (v === "UNLINK" || v === "WITHDRAWAL_TERMS" || v === "WITHDRAWAL_TOSS") {
    return v;
  }
  return null;
}

async function handleUnlink(params: {
  userKey: string | null;
  referrer: TossUnlinkReferrer | null;
}): Promise<void> {
  const { userKey, referrer } = params;
  logger.info("[toss-login] unlink callback", {
    referrer: referrer ?? "unknown",
    hasUserKey: Boolean(userKey),
  });
  // 토스앱에서 이미 연결을 해제한 상태이므로 remove API 는 호출하지 않고(콜백 시 호출 불필요),
  // 우리 측 매핑(app_users.toss_unlinked_at)과 보관 토큰만 정리합니다.
  const keyNum = userKey ? Number(userKey) : NaN;
  if (Number.isFinite(keyNum)) {
    try {
      const { unlinkTossUser } = await import("@/lib/auth/toss-user-store");
      await unlinkTossUser(keyNum);
    } catch (e) {
      logger.warn("[toss-login] unlink cleanup failed", e);
    }
  }
}

async function processRequest(
  req: Request,
  source: "GET" | "POST",
): Promise<NextResponse> {
  if (!verifyTossUnlinkBasicAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let userKey: string | null = null;
  let referrer: TossUnlinkReferrer | null = null;

  if (source === "GET") {
    const { searchParams } = new URL(req.url);
    userKey = searchParams.get("userKey");
    referrer = parseReferrer(searchParams.get("referrer"));
  } else {
    try {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const body = (await req.json()) as Record<string, unknown>;
        userKey = typeof body.userKey === "string" ? body.userKey : null;
        referrer = parseReferrer(
          typeof body.referrer === "string" ? body.referrer : null,
        );
      } else {
        const form = await req.formData();
        userKey = (form.get("userKey") as string | null) ?? null;
        referrer = parseReferrer((form.get("referrer") as string | null) ?? null);
      }
    } catch {
      // 본문 파싱 실패해도 인증은 통과했으므로 200으로 흡수(토스 재시도 폭주 방지).
    }
  }

  await handleUnlink({ userKey, referrer });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  return processRequest(req, "GET");
}

export async function POST(req: Request) {
  return processRequest(req, "POST");
}
