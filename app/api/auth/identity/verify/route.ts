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

  let body: {
    sessionId?: unknown;
    code?: unknown;
    payload?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "유효하지 않은 인증 세션입니다." },
      { status: 400 },
    );
  }

  try {
    const provider = getIdentityProvider();
    const result = await provider.verifyResult({
      sessionId,
      code: typeof body.code === "string" ? body.code : undefined,
      payload:
        body.payload && typeof body.payload === "object"
          ? (body.payload as Record<string, unknown>)
          : undefined,
    });
    if (!result.verified) {
      return NextResponse.json(
        { verified: false, message: result.message ?? "본인인증에 실패했습니다." },
        { status: 400 },
      );
    }
    // CI/DI 같은 민감정보는 클라이언트로 그대로 노출하지 않습니다.
    return NextResponse.json({
      verified: true,
      provider: result.provider,
      name: result.name ?? null,
      phone: result.phone ?? null,
      message: result.message ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "본인인증 확인 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
