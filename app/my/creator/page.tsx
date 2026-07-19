import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { CreatorClient } from "./creator-client";
import { safeAuth } from "@/lib/safe-auth";
import { listNotes } from "@/lib/inspection/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";

/* 시안 22e — 크리에이터 대시보드 · 성장 보상 + 23c "탑 임장러 현황" 탭
   실데이터: 세션(safeAuth) 기준 내 공개 노트 수 + 총 저장 수(bookmarks · 내 공개 노트 대상)
   — 조회 불가 시 "—" 표기, 비로그인 시 로그인 유도 */

export const dynamic = "force-dynamic";

/** 내 공개 노트가 받은 저장(bookmarks) 수 — env 미설정·오류 시 null("—") */
async function countNoteSaves(noteIds: string[]): Promise<number | null> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return null;
    if (noteIds.length === 0) return 0;
    const { count, error } = await sb
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .in("target_id", noteIds.slice(0, 100));
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export default async function CreatorDashboardPage() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;

  if (!email) {
    return (
      <PageShell breadcrumb="마이 › 크리에이터" title="크리에이터 대시보드">
        <div className="mx-auto max-w-[520px]">
          <div className="rise-in card flex flex-col items-center gap-2 px-5 py-12 text-center">
            <div className="text-[26px]">✍️</div>
            <div className="text-[15px] font-extrabold text-ink">
              로그인하면 내 콘텐츠 성과를 볼 수 있어요
            </div>
            <div className="text-[12px] leading-[1.6] text-text-3">
              공개 노트 수·저장 수와 탑 임장러 현황은
              <br />내 계정 기준으로 집계돼요
            </div>
            <Link href="/login" className="btn-primary btn-md mt-2">
              로그인하고 시작하기
            </Link>
            <Link
              href="/discover"
              className="text-[12px] font-bold text-text-3"
            >
              발견 피드 둘러보기 ›
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  let publicNoteCount: number | null = null;
  let totalSaves: number | null = null;
  try {
    if (getServiceSupabase()) {
      const notes = await listNotes(email);
      const publicNotes = notes.filter((n) => n.isPublic);
      publicNoteCount = publicNotes.length;
      totalSaves = await countNoteSaves(publicNotes.map((n) => n.id));
    }
  } catch {
    publicNoteCount = null;
    totalSaves = null;
  }

  return (
    <PageShell breadcrumb="마이 › 크리에이터" title="크리에이터 대시보드">
      <CreatorClient
        nickname={session?.user?.name ?? null}
        publicNoteCount={
          publicNoteCount === null
            ? "—"
            : publicNoteCount.toLocaleString("ko-KR")
        }
        totalSaves={
          totalSaves === null ? "—" : totalSaves.toLocaleString("ko-KR")
        }
      />
    </PageShell>
  );
}
