/**
 * GET  /api/me/preferences — 내 페르소나·우선순위 조회
 * PUT  /api/me/preferences — 저장(부분 업데이트)
 * 비로그인은 401 → 클라이언트가 localStorage 폴백.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPreferences, putPreferences } from "@/lib/me/preferences-store";
import type { PersonaId, PriorityWeights } from "@/lib/personalization/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const prefs = await getPreferences(session.user.email);
  return NextResponse.json({ preferences: prefs });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const prefs = await putPreferences(session.user.email, {
    persona: (body.persona as PersonaId | null | undefined) ?? undefined,
    priorities: body.priorities as Partial<PriorityWeights> | undefined,
    holdingYears:
      body.holdingYears != null ? Number(body.holdingYears) : (body.holdingYears as null | undefined),
    riskTolerance:
      body.riskTolerance != null
        ? Number(body.riskTolerance)
        : (body.riskTolerance as null | undefined),
  });
  return NextResponse.json({ preferences: prefs });
}
