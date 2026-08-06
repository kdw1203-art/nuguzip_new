import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSession, listSessions } from "@/lib/inspection/session-store";
import { recordFunnelEvent, FUNNEL_EVENT } from "@/lib/platform-funnel-events";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 못 읽은 목록을 "기록 없음"으로 답하지 않기 위한 안내. */
const SESSIONS_UNAVAILABLE = "지금은 임장 기록을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ items: [] });
  }
  /* 빈 items 는 화면에서 "아직 임장 기록이 없어요"가 된다. 조회가 실패했을 뿐인
     사용자에게 그렇게 말하면, 만들어 둔 기록이 사라진 것으로 읽힌다. */
  try {
    const items = await listSessions(session.user.email);
    return NextResponse.json({ items });
  } catch (err) {
    return dbUnavailable("임장 세션 목록 조회 실패", err, SESSIONS_UNAVAILABLE);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const region = String(body.region ?? "").trim();
  if (!region) {
    return NextResponse.json({ error: "region은 필수입니다." }, { status: 400 });
  }
  try {
    const lens = body.lens ? String(body.lens) : undefined;
    const metadata =
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : lens
          ? { lens }
          : {};
    const row = await createSession({
      authorEmail: session.user.email,
      /* inspection_sessions.author_label 도 공개 컬럼이다. 이름이 없다고
         이메일을 넣으면 표시명 자리에 주소가 그대로 남는다 — 넣지 않는다. */
      authorLabel: session.user.name?.trim() || undefined,
      region,
      aptName: body.aptName ? String(body.aptName) : undefined,
      complexId: body.complexId ? String(body.complexId) : undefined,
      mode: body.mode ?? "field_note",
      privacyClass: body.privacyClass ?? "private",
      geoLat: body.geoLat != null ? Number(body.geoLat) : undefined,
      geoLng: body.geoLng != null ? Number(body.geoLng) : undefined,
      geoPrecision: body.geoPrecision ? String(body.geoPrecision) : undefined,
      capture: body.capture && typeof body.capture === "object" ? body.capture : {},
      metadata,
    });
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.FIELD_SESSION_START,
      userEmail: session.user.email,
      path: "/api/inspection/sessions",
      metadata: { sessionId: row.id, region, aptName: row.aptName },
    });
    return NextResponse.json({ session: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "세션 생성 실패" },
      { status: 500 },
    );
  }
}
