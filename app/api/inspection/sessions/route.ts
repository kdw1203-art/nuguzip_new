import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSession, listSessions } from "@/lib/inspection/session-store";
import { recordFunnelEvent, FUNNEL_EVENT } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ items: [] });
  }
  const items = await listSessions(session.user.email);
  return NextResponse.json({ items });
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
      authorLabel: session.user.name ?? session.user.email,
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
