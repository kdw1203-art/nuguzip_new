import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createNote, listNotes, listPublicNotes } from "@/lib/inspection/store-db";
import { awardPoints } from "@/lib/points/ledger";
import { appendOnboardingStep } from "@/lib/onboarding/append-step";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

import { dbUnavailable } from "@/lib/api/db-unavailable";

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
    /* 조회 실패를 `{items: []}` 로 돌려주면 받아 간 쪽이 "공개 노트가 없다" 고
       읽는다. API 는 사람이 눈으로 걸러 주지도 않으므로 503 으로 명시한다. */
    let items;
    try {
      items = await listPublicNotes(200);
    } catch (e) {
      return NextResponse.json(
        {
          error: "공개 임장노트를 조회하지 못했습니다. 노트가 없는 것이 아니라 조회가 실패했습니다.",
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } },
      );
    }
    items = items.filter((n) => matchQ(n));
    if (minScore != null) items = items.filter((n) => scoreOf(n) >= minScore);
    // 개인정보 보호: 공개 목록 응답에서 작성자 이메일 제거 — 표시는 authorLabel 사용
    const sanitized = items.map(({ authorEmail: _authorEmail, ...rest }) => ({
      ...rest,
      authorLabel:
        rest.authorLabel?.trim() ||
        `${_authorEmail.split("@")[0]?.slice(0, 2) || "이웃"}** 이웃`,
    }));
    return NextResponse.json({ items: sanitized });
  }
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ items: [] });
  }
  /* 실패를 items: [] 로 내보내면 "작성한 노트가 없어요"가 그려진다.
     내 기록이 사라진 화면만큼 사용자를 놀라게 하는 거짓말이 없다. */
  let items: Awaited<ReturnType<typeof listNotes>>;
  try {
    items = await listNotes(email);
  } catch (e) {
    return dbUnavailable("inspection-notes-list", e);
  }
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
  // 최소 검증 — 공백만 있는 제목·지역 거부
  const title = String(body.title ?? "").trim();
  const region = String(body.region ?? "").trim();
  if (!title || !region) {
    return NextResponse.json({ error: "제목·지역은 필수입니다." }, { status: 400 });
  }
  try {
    const note = await createNote({
      authorEmail: session.user.email,
      authorLabel: session.user.name ?? session.user.email,
      title,
      region,
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
    // 공개 노트로 생성되면 공개 피드를 즉시 갱신(ISR 대기 없이 바로 반영)
    if (isPublic) {
      revalidatePath("/notes");
      revalidatePath("/");
      // 공개 상태로 최초 생성 시에도 100P 적립.
      // refId=note.id 멱등 — 이후 PATCH(비공개→공개)에서 같은 refId 로 중복 지급되지 않음.
      await awardPoints(session.user.email, "note_public", note.id);
    }
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
