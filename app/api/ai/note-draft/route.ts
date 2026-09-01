import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { generateNoteDraft } from "@/lib/ai/note-draft";
import { checkDraftQuota, incrementDraftUsage } from "@/lib/inspection/quota";
import { recordFunnelEvent, FUNNEL_EVENT } from "@/lib/platform-funnel-events";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * [944 · AI 대개편] POST /api/ai/note-draft — 임장노트 초안·단지 예습 브리핑.
 *
 * 입력: { regionName, aptName?, complexId?, purpose?, userMemo? }
 * 출력: { ok, draft, usage: { used, limit, plan } }
 *
 * 규약:
 *  - 로그인 필수(비용이 나가는 기능) + 월 한도(무료 10 · 플러스 100, FEATURE_RULES 단일 출처).
 *  - 한도 초과는 429 가 아니라 200 + allowed:false — 화면이 "다 썼어요, 다음 달/플랜"
 *    을 그리게 한다(오류가 아니라 상태다).
 *  - 사용량 +1 은 초안이 실제로 생성된 뒤에만. rule 폴백도 근거 수집·생성이 돌았으므로 센다.
 *  - 점수 추정 라벨 원칙은 lib/ai/note-draft 가 강제(근거 서술 없는 점수는 서버가 버림).
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    regionName?: string;
    aptName?: string;
    complexId?: string;
    purpose?: string;
    userMemo?: string;
  };
  const regionName = String(body.regionName ?? "").trim().slice(0, 60);
  if (!regionName) {
    return NextResponse.json({ error: "regionName(지역)이 필요합니다." }, { status: 400 });
  }

  let quota;
  try {
    quota = await checkDraftQuota(email);
  } catch (e) {
    logger.error("[note-draft] 한도 조회 실패", e);
    return NextResponse.json({ error: "사용량을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
  if (!quota.allowed) {
    return NextResponse.json({
      ok: false,
      reason: "quota",
      usage: { used: quota.used, limit: quota.limit, plan: quota.plan },
    });
  }

  try {
    const draft = await generateNoteDraft({
      regionName,
      aptName: body.aptName?.trim().slice(0, 60) || null,
      complexId: body.complexId?.trim().slice(0, 200) || null,
      purpose: body.purpose?.trim().slice(0, 30) || null,
      userMemo: body.userMemo?.trim().slice(0, 500) || null,
    });

    await incrementDraftUsage(email);

    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.AI_TOOL_RUN,
      userEmail: email,
      path: "/api/ai/note-draft",
      metadata: { tool: "note_draft", llm: draft.llmUsed, hasComplex: Boolean(body.complexId) },
    }).catch(() => {});
    void recordFunnelEvent(req, {
      eventName: draft.llmUsed ? FUNNEL_EVENT.AI_LLM_COMPLETE : FUNNEL_EVENT.AI_RULE_FALLBACK,
      userEmail: email,
      path: "/api/ai/note-draft",
      metadata: { tool: "note_draft", model: draft.model },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      draft,
      usage: { used: quota.used + 1, limit: quota.limit, plan: quota.plan },
    });
  } catch (e) {
    logger.error("[note-draft] 생성 실패", e);
    return NextResponse.json(
      { error: "초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
