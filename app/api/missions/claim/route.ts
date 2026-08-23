import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildMissionBoard } from "@/lib/missions/missions";
import { awardPoints } from "@/lib/points/ledger";

/* [#119·#120] 미션 적립 청구 — 서버가 진행도를 재검증하고 나서만 지급한다
   (클라이언트 주장 불신). 멱등: once/refId 는 awardPoints 가 막는다. */

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const email = session.user.email;
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "");

  let board;
  try {
    board = await buildMissionBoard(email);
  } catch {
    return NextResponse.json(
      { error: "진행도를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }

  if (kind === "start") {
    if (!board.startAllDone) {
      return NextResponse.json({ error: "아직 3가지가 모두 완료되지 않았어요." }, { status: 400 });
    }
    const r = await awardPoints(email, "onboarding_complete");
    return NextResponse.json({ ok: r.ok, awarded: r.awarded, reason: r.reason ?? null });
  }

  /* [AI-39] 첫 AI 분석 100P — 서버가 실행 기록(runs≥1)을 재검증한 뒤 1회 지급 */
  if (kind === "ai") {
    const m = board.start.find((s) => s.key === "first_ai");
    if (!m?.done) {
      return NextResponse.json({ error: "아직 AI 분석을 실행하지 않았어요." }, { status: 400 });
    }
    const r = await awardPoints(email, "ai_first");
    return NextResponse.json({ ok: r.ok, awarded: r.awarded, reason: r.reason ?? null });
  }

  if (kind === "weekly") {
    const key = String(body.key ?? "");
    const m = board.weekly.find((w) => w.key === key);
    if (!m) return NextResponse.json({ error: "없는 미션입니다." }, { status: 400 });
    if (!m.done) {
      return NextResponse.json({ error: "아직 목표에 도달하지 않았어요." }, { status: 400 });
    }
    const r = await awardPoints(email, "weekly_mission", `${board.weekKey}:${key}`);
    return NextResponse.json({ ok: r.ok, awarded: r.awarded, reason: r.reason ?? null });
  }

  return NextResponse.json({ error: "kind 는 start | ai | weekly" }, { status: 400 });
}
