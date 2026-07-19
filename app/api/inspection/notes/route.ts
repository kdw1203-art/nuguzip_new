import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createNote, listNotes, listPublicNotes } from "@/lib/inspection/store-db";
import { appendOnboardingStep } from "@/lib/onboarding/append-step";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export async function GET(req: Request) {
  const session = await auth();
  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const minScoreRaw = Number(url.searchParams.get("minScore") ?? "");
  const minScore = Number.isFinite(minScoreRaw) ? Math.max(0, Math.min(5, minScoreRaw)) : null;
  const visibility = (url.searchParams.get("visibility") ?? "all").toLowerCase();
  const scoreOf = (n: {
    scores: { location: number; school: number; transport: number; facility: number; future: number };
  }) =>
    (n.scores.location + n.scores.school + n.scores.transport + n.scores.facility + n.scores.future) / 5;
  const matchQ = (n: {
    title: string;
    region: string;
    aptName?: string | null;
    summary?: string | null;
  }) => {
    if (!q) return true;
    const hay = `${n.title} ${n.region} ${n.aptName ?? ""} ${n.summary ?? ""}`.toLowerCase();
    return hay.includes(q);
  };

  if (all) {
    let items = await listPublicNotes(200);
    items = items.filter((n) => matchQ(n));
    if (minScore != null) items = items.filter((n) => scoreOf(n) >= minScore);
    return NextResponse.json({ items });
  }
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ items: [] });
  }
  let items = await listNotes(email);
  if (visibility === "public") items = items.filter((n) => n.isPublic);
  else if (visibility === "private") items = items.filter((n) => !n.isPublic);
  items = items.filter((n) => matchQ(n));
  if (minScore != null) items = items.filter((n) => scoreOf(n) >= minScore);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body.title || !body.region) {
    return NextResponse.json({ error: "제목·지역은 필수입니다." }, { status: 400 });
  }
  try {
    const note = await createNote({
      authorEmail: session.user.email,
      authorLabel: session.user.name ?? session.user.email,
      title: String(body.title),
      region: String(body.region),
      aptName: body.aptName ? String(body.aptName) : undefined,
      visitDate: body.visitDate ? String(body.visitDate) : undefined,
      weather: body.weather ? String(body.weather) : undefined,
      transportation: body.transportation ? String(body.transportation) : undefined,
      summary: body.summary ? String(body.summary) : undefined,
      scores: body.scores,
      checklist: Array.isArray(body.checklist) ? body.checklist : [],
      sections: body.sections ?? {},
      photos: Array.isArray(body.photos) ? body.photos.map(String) : [],
      isPublic: Boolean(body.isPublic),
      aiAnalysis:
        body.aiAnalysis && typeof body.aiAnalysis === "object"
          ? (body.aiAnalysis as Record<string, unknown>)
          : undefined,
      metadata:
        body.metadata && typeof body.metadata === "object"
          ? (body.metadata as Record<string, unknown>)
          : undefined,
    });
    const isPublic = Boolean(body.isPublic);
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.INSPECTION_NOTE_CREATE,
      userEmail: session.user.email,
      path: "/api/inspection/notes",
      metadata: { noteId: note.id, isPublic },
    });
    void appendOnboardingStep(session.user.email, "inspection");
    if (isPublic) {
      void appendOnboardingStep(session.user.email, "share");
    }
    return NextResponse.json({ note });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 },
    );
  }
}
