import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import {
  getIdentityProvider,
  isIdentityVerificationConfigured,
} from "@/lib/auth/identity-verification";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  if (!isIdentityVerificationConfigured()) {
    return NextResponse.json(
      { error: "본인인증이 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  let redirectUrl: string | undefined;
  try {
    const body = (await req.json()) as { redirectUrl?: unknown };
    if (typeof body?.redirectUrl === "string") redirectUrl = body.redirectUrl;
  } catch {
    // 본문 없이도 허용
  }

  try {
    const provider = getIdentityProvider();
    const session = await provider.startVerification({ redirectUrl });
    return NextResponse.json({ provider: provider.id, ...session });
  } catch {
    return NextResponse.json(
      { error: "본인인증 요청 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
