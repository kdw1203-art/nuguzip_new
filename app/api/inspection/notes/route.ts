import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  countNotesByRegionToken,
  createNote,
  listNotes,
  listPublicNotes,
} from "@/lib/inspection/store-db";
import { awardPoints } from "@/lib/points/ledger";
import { guToken, tierReachedAt } from "@/lib/gamification/region-levels";
import { appendOnboardingStep } from "@/lib/onboarding/append-step";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { looksLikeEmail } from "@/lib/privacy/mask-email";

import { dbUnavailable } from "@/lib/api/db-unavailable";

/**
 * 공개 목록에 실을 작성자 표시명.
 *
 * 예전 코드는 `rest.authorLabel?.trim() || <마스킹>` 이었다. 바로 위 줄에서
 * authorEmail 필드를 빼면서 "개인정보 보호: 작성자 이메일 제거"라고 적어 놨지만,
 * **author_label 에 이메일이 들어 있으면 그대로 통과했다** — 아래 POST 가
 * `session.user.name ?? session.user.email` 을 넣고 있었으니 이름 없는 계정은
 * 매번 그랬다. 한쪽을 가려 놓고 옆 컬럼으로 같은 값이 나가면 아무것도 가린 게 아니다.
 *
 * POST 쪽은 이제 이메일을 아예 저장하지 않지만(저장 직전에 막는 게 화면에서
 * 가리는 것보다 낫다), **그 전에 저장된 행은 여전히 남아 있다.** 여기서 한 번 더 건다.
 * 이메일 모양이면 라벨이 없을 때와 똑같은 "○○** 이웃" 로 떨어뜨린다 — 다른 모양으로
 * 마스킹하면 이 화면에서만 표기가 달라진다.
 */
function publicAuthorLabel(label: string | null | undefined, email: string): string {
  const raw = (label ?? "").trim();
  if (raw && !looksLikeEmail(raw)) return raw;
  return `${email.split("@")[0]?.slice(0, 2) || "이웃"}** 이웃`;
}

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
      authorLabel: publicAuthorLabel(rest.authorLabel, _authorEmail),
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
      /* 이름이 없으면 이메일을 넣고 있었다. author_label 은 공개 목록에 그대로
         실리는 값이라(위 publicAuthorLabel), 이름 없는 계정은 노트를 쓸 때마다
         자기 이메일을 공개했다. 이름이 없으면 **아무것도 넣지 않는다** — 표시는
         이미 있는 "○○** 이웃" 폴백이 맡는다. 안 들어가면 샐 값이 없다. */
      authorLabel: session.user.name?.trim() || undefined,
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
    /* 지역 임장 레벨업 포인트 — 이 노트로 그 지역(구/시) 노트 수가 레벨 경계
       (1·3·5·10·20)에 정확히 도달했으면 50P. refId=지역:레벨 멱등이라 중복 지급
       없음. 적립 실패가 노트 저장 응답을 막지 않도록 fire-and-forget. */
    void (async () => {
      try {
        const gu = guToken(region);
        if (!gu) return;
        const count = await countNotesByRegionToken(session.user!.email!, gu);
        const tier = tierReachedAt(count);
        if (tier) {
          await awardPoints(session.user!.email!, "region_level_up", `${gu}:${tier.level}`);
        }
      } catch {
        /* 지급 판정 실패는 조용히 넘긴다 — 다음 경계에서 다시 기회가 있다 */
      }
    })();
    /* [#69] 템플릿 마켓 — 이웃 템플릿으로 쓴 노트가 저장되는 순간이 "사용"이다.
       공식 템플릿은 집계 스킵(내장 상수), 본인 템플릿 사용은 포인트 없음(자가 적립 차단).
       refId=템플릿:노트 멱등 — 같은 노트로 두 번 지급되지 않는다. fire-and-forget. */
    void (async () => {
      try {
        const meta = body.metadata as Record<string, unknown> | undefined;
        const tplId = typeof meta?.templateId === "string" ? meta.templateId : null;
        if (!tplId) return;
        const { getTemplate, incrementUseCount } = await import("@/lib/note-templates/store");
        const tpl = await getTemplate(tplId);
        if (!tpl || tpl.isOfficial) return;
        await incrementUseCount(tplId);
        if (tpl.authorEmail && tpl.authorEmail !== session.user!.email) {
          await awardPoints(tpl.authorEmail, "template_used", `${tplId}:${note.id}`);
        }
      } catch {
        /* 사용 집계 실패가 노트 저장 응답을 막지 않는다 */
      }
    })();
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
