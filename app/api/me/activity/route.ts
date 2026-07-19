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
      const hrefs: Record<string, string> = {
        post: `/community/${b.targetId}`,
        report: `/reports/${b.targetId}`,
        expert: `/experts/${b.targetId}`,
        meeting: `/groups/${b.targetId}`,
        market: `/market/${b.targetId}`,
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
        href: `/groups/${m.id}`,
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
        href: `/inspection/${n.id}`,
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
        href: `/experts/${c.expertId}`,
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
        href: `/ai-analysis/${r.tool}`,
        createdAt: r.createdAt,
      });
    }
  }

  // 최신순 정렬
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ items: items.slice(0, 30) });
}
