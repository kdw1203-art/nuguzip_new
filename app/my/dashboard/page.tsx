import type { Metadata } from "next";
import { listPublicNotes } from "@/lib/inspection/store-db";
import {
  DashboardClient,
  type RecentPublicNote,
} from "./dashboard-client";

/* 시안 16g(무료)·16h(PRO) — 내 대시보드. 로그인 세션 필요 데이터는 목업,
   공개 노트 수·최근 공개 노트는 inspection_notes 실데이터 (실패 시 목업 폴백) */

export const metadata: Metadata = {
  title: "내 대시보드 · 누구집",
};

export const dynamic = "force-dynamic";

export default async function MyDashboardPage() {
  let publicNoteCount: number | null = null;
  let recentPublicNotes: RecentPublicNote[] = [];
  try {
    const rows = await listPublicNotes(50);
    publicNoteCount = rows.length;
    recentPublicNotes = rows.slice(0, 2).map((n) => ({
      id: n.id,
      title: n.aptName?.trim() ? n.aptName : n.title,
      meta: `${n.region} · 방문 ${n.visitDate}`,
    }));
  } catch {
    publicNoteCount = null;
    recentPublicNotes = [];
  }

  return (
    <DashboardClient
      publicNoteCount={publicNoteCount}
      recentPublicNotes={recentPublicNotes}
    />
  );
}
