/**
 * GET  /api/me/preferences — 내 개인화 조회
 *        · personalization: 온보딩 관심 지역·예산·목적 { regions, budget, purpose }
 *        · preferences:     페르소나·우선순위(4축)
 * POST /api/me/preferences — 온보딩 개인화 저장 { regions, budget, purpose }
 * PUT  /api/me/preferences — 페르소나·우선순위 부분 업데이트(기존)
 * 비로그인: GET 은 빈 값(graceful), POST/PUT 은 401.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getPreferences, putPreferences } from "@/lib/me/preferences-store";
import type { PersonaId, PriorityWeights } from "@/lib/personalization/store";
import {
  getOnboardingPersonalization,
  saveOnboardingPersonalization,
} from "@/lib/onboarding/personalization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    // 비로그인 — 정적/게스트 환경에서도 안전하게 빈 값 반환
    return NextResponse.json({
      preferences: null,
      personalization: null,
      regions: [],
      budget: null,
      purpose: null,
    });
  }
  const [preferences, personalization] = await Promise.all([
    getPreferences(email),
    getOnboardingPersonalization(email),
  ]);
  return NextResponse.json({
    preferences,
    personalization,
    regions: personalization?.regions ?? [],
    budget: personalization?.budget ?? null,
    purpose: personalization?.purpose ?? null,
  });
}

/** 온보딩 개인화 저장 — body: { regions:[], budget:{type,min,max,label}, purpose } */
export async function POST(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const personalization = await saveOnboardingPersonalization(session.user.email, {
    regions: body.regions,
    budget: body.budget,
    purpose: body.purpose,
  });
  return NextResponse.json({
    personalization,
    regions: personalization.regions,
    budget: personalization.budget,
    purpose: personalization.purpose,
  });
}

/** 페르소나·우선순위 부분 업데이트 (기존 계약 유지) */
export async function PUT(req: Request) {
  const session = await safeAuth();
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
      body.holdingYears != null
        ? Number(body.holdingYears)
        : (body.holdingYears as null | undefined),
    riskTolerance:
      body.riskTolerance != null
        ? Number(body.riskTolerance)
        : (body.riskTolerance as null | undefined),
  });
  return NextResponse.json({ preferences: prefs });
}
