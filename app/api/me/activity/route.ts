/**
 * GET /api/me/activity
 * 마이페이지 활동 피드: 내 게시글, 댓글, 좋아요, 북마크, 구독 결제 최근 이력
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readPosts } from "@/lib/posts-store";
import { listReports } from "@/lib/reports/store-db";
import { listPayments } from "@/lib/payments/store";
import { listBookmarks } from "@/lib/bookmarks/store";
import { listMeetings } from "@/lib/meetings/store-db";
import { listNotes } from "@/lib/inspection/store-db";
import { listMyConsultations } from "@/lib/expert-consultations/store-db";
import { listRuns } from "@/lib/ai/presets-store";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ActivityItem = {
  id: string;
  type:
    | "post"
    | "report"
    | "payment"
    | "bookmark"
    | "meeting"
    | "note"
    | "consultation"
    | "ai-run";
  title: string;
  description?: string;
  href?: string;
  createdAt: string;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const email = session.user.email.trim().toLowerCase();
  const items: ActivityItem[] = [];

  // 병렬로 데이터 조회
  const [allPosts, allReports, payments, bookmarks, meetings, notes, consultations, aiRuns] =
    await Promise.allSettled([
      readPosts(),
      listReports(),
      listPayments(email),
      listBookmarks(email),
      listMeetings(),
      listNotes(email),
      listMyConsultations(email),
      listRuns(email, 8),
    ]);

  // 내 게시글
  if (allPosts.status === "fulfilled") {
    const myPosts = allPosts.value
      .filter((p) => p.notifyEmail?.toLowerCase() === email)
      .slice(0, 10);
    for (const p of myPosts) {
      items.push({
        id: `post-${p.id}`,
        type: "post",
        title: p.title,
        description: `💬 댓글 ${p.commentCount ?? 0} · 👁 ${p.viewCount ?? 0}`,
        href: `/community/${p.id}`,
        createdAt: p.createdAt,
      });
    }
  }

  // 내 리포트
  if (allReports.status === "fulfilled") {
    const myReports = allReports.value
      .filter((r) => (r.authorId ?? "").toLowerCase() === email)
      .slice(0, 5);
    for (const r of myReports) {
      items.push({
        id: `report-${r.id}`,
        type: "report",
        title: r.title,
        description: `📄 ${r.category} · ⬇ ${r.downloads}`,
        href: `/reports/${r.id}`,
        createdAt: r.publishedAt,
      });
    }
  }

  // 결제 이력
  if (payments.status === "fulfilled") {
    for (const p of payments.value.slice(0, 5)) {
      items.push({
        id: `payment-${p.id}`,
        type: "payment",
        title: p.plan ? `${String(p.plan).toUpperCase()} 구독` : "결제",
        description: `₩${Number(p.amount ?? 0).toLocaleString()} · ${p.status === "paid" ? "결제완료" : p.status}`,
        href: "/pricing",
        createdAt: String(p.paidAt ?? p.requestedAt ?? new Date().toISOString()),
      });
    }
  }

  // 북마크
  if (bookmarks.status === "fulfilled") {
    for (const b of bookmarks.value.slice(0, 5)) {
      const typeLabel: Record<string, string> = {
        post: "커뮤니티", report: "리포트", expert: "전문가", meeting: "모임", market: "마켓",
      };
      /* 2026-07-26: 여기 있던 경로 중 셋이 이 앱에 없는 경로였다.
         `/experts/*` `/groups/*` `/market/*` 는 app/ 아래에 디렉터리가 없고,
         리다이렉트 표는 **정확 일치**만 하므로(`/experts` 는 걸리지만
         `/experts/{id}` 는 안 걸린다) 내 활동에서 북마크를 누르면 404 였다.
         - 전문가·마켓은 상세 라우트가 아예 없다(app/town/experts, app/town/market
           둘 다 [id] 가 없음) → 목록으로 보낸다. 없는 상세를 가리키는 것보다
           목록이 사실에 맞다.
         - 모임은 상세가 있다: app/town/groups/[id]. */
      const hrefs: Record<string, string> = {
        post: `/community/${b.targetId}`,
        report: `/reports/${b.targetId}`,
        /* [953] 전문가 상세가 생겼다 — 북마크는 상세로 */
        expert: `/town/experts/${b.targetId}`,
        meeting: `/town/groups/${b.targetId}`,
        market: "/town/market",
      };
      items.push({
        id: `bookmark-${b.id}`,
        type: "bookmark",
        title: b.label ?? `${typeLabel[b.targetType] ?? b.targetType} 북마크`,
        description: typeLabel[b.targetType] ?? b.targetType,
        href: hrefs[b.targetType] ?? "/",
        createdAt: b.createdAt,
      });
    }
  }

  // 임장 일정 참여 모임
  if (meetings.status === "fulfilled") {
    const myMeetings = (meetings.value as Array<{ id: string; title?: string; organizerEmail?: string; createdAt?: string; region?: string }>)
      .filter((m) => (m.organizerEmail ?? "").toLowerCase() === email)
      .slice(0, 5);
    for (const m of myMeetings) {
      items.push({
        id: `meeting-${m.id}`,
        type: "meeting",
        title: m.title ?? "모임",
        description: m.region ?? "",
        href: `/town/groups/${m.id}`,
        createdAt: m.createdAt ?? new Date().toISOString(),
      });
    }
  }

  // 임장 노트
  if (notes.status === "fulfilled") {
    for (const n of notes.value.slice(0, 5)) {
      items.push({
        id: `note-${n.id}`,
        type: "note",
        title: n.title,
        description: n.region,
        /* 임장노트 상세는 app/notes/[id] 다. `/inspection/{id}` 라우트는 없다. */
        href: `/notes/${n.id}`,
        createdAt: n.createdAt,
      });
    }
  }

  // 전문가 상담 내역
  if (consultations.status === "fulfilled") {
    for (const c of consultations.value.slice(0, 5)) {
      items.push({
        id: `consult-${c.id}`,
        type: "consultation",
        title: `전문가 상담 (${c.type})`,
        description: c.status === "replied" ? "✅ 답변 완료" : "⏳ 답변 대기",
        href: "/town/experts",
        createdAt: c.createdAt,
      });
    }
  }

  // AI 분석 실행
  if (aiRuns.status === "fulfilled") {
    for (const r of aiRuns.value.slice(0, 6)) {
      const label = TOOL_IDENTITIES[r.tool as AiAnalysisToolId]?.title ?? r.tool;
      const headline =
        r.structuredSummary?.headline ?? r.markdown.replace(/\s+/g, " ").slice(0, 60);
      items.push({
        id: `ai-run-${r.id}`,
        type: "ai-run",
        title: `🤖 ${label}`,
        description: headline,
        /* `ai-diagnosis` 같은 tool 값은 분석 엔진(lib/ai/analysis-engine.ts)의
           식별자이지 라우트가 아니다. 툴별 페이지는 이 앱에 없다 — 있는 건
           분석 허브 /analysis 뿐이라, 여기서 툴 id 를 경로로 쓰면 전부 404 다. */
        href: "/analysis",
        createdAt: r.createdAt,
      });
    }
  }

  // 최신순 정렬
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  /* allSettled 는 실패한 묶음을 조용히 버린다. 그대로 200 을 주면 화면에는
     "아직 활동이 없어요"나 일부만 빠진 피드가 뜨는데, 둘 다 사실이 아니다.
     무엇을 못 읽었는지 같이 내려보내고, 실패가 섞인 응답은 캐시하지 않는다. */
  const groups: Array<[string, PromiseSettledResult<unknown>]> = [
    ["posts", allPosts],
    ["reports", allReports],
    ["payments", payments],
    ["bookmarks", bookmarks],
    ["meetings", meetings],
    ["notes", notes],
    ["consultations", consultations],
    ["ai-runs", aiRuns],
  ];
  const failed = groups.filter(([, r]) => r.status === "rejected").map(([k]) => k);
  for (const [key, r] of groups) {
    if (r.status === "rejected") {
      logger.error(`[me/activity] ${key} 조회 실패 (${email})`, r.reason);
    }
  }

  return NextResponse.json(
    { items: items.slice(0, 30), failed },
    failed.length > 0 ? { headers: { "Cache-Control": "no-store" } } : undefined,
  );
}
