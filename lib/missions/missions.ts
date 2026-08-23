import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";

/* ============================================================
   [#119·#120] 미션 — 시작 3미션 + 주간 미션.
   원칙: 진행도는 **전부 기존 실데이터에서 파생**한다(전용 진행 테이블 없음).
   달성→적립은 point_ledger 의 refId 멱등으로 이중 지급을 막는다.
     시작 3미션: 관심 단지 1곳 · 키워드 알림 1개 · 첫 기록 1편
                → 전부 달성 시 onboarding_complete(200P, once) 청구 가능
     주간 미션(ISO 주 단위 리셋): 노트 1편 · 출석 3회 · 관심 단지 +2곳
                → 각 달성 시 weekly_mission(50P) 청구, refId=주차:키 멱등
   ============================================================ */

export type MissionState = {
  key: string;
  label: string;
  desc: string;
  href: string;
  target: number;
  progress: number;
  done: boolean;
  /** 이미 적립까지 끝났는가 (claim 버튼 상태) */
  claimed: boolean;
  points: number;
};

export function isoWeekKey(d = new Date()): string {
  // ISO 주차 (목요일 규칙) — apply 캘린더의 주 슬러그와 같은 계산 철학
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-w${String(week).padStart(2, "0")}`;
}

function isoWeekStartIso(d = new Date()): string {
  const t = new Date(d);
  const day = t.getDay() || 7;
  t.setDate(t.getDate() - day + 1);
  t.setHours(0, 0, 0, 0);
  return t.toISOString();
}

async function alreadyAwardedRef(
  email: string,
  reason: string,
  refId: string | null,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  let q = sb
    .from("point_ledger")
    .select("id", { count: "exact", head: true })
    .eq("user_email", email)
    .eq("reason", reason);
  if (refId !== null) q = q.eq("ref_id", refId);
  const { count } = await q;
  return (count ?? 0) > 0;
}

export type MissionBoard = {
  start: MissionState[];
  startAllDone: boolean;
  startClaimed: boolean;
  weekKey: string;
  weekly: MissionState[];
};

/** 진행도 계산 — 조회 실패 시 throw (호출부가 접는다). */
export async function buildMissionBoard(email: string): Promise<MissionBoard> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 미구성");
  const weekKey = isoWeekKey();
  const weekStart = isoWeekStartIso();

  const [watchAll, savedAll, notesAll, notesWeek, attendWeek, watchWeek, startClaimed] =
    await Promise.all([
      sb.from("user_watchlist").select("complex_id", { count: "exact", head: true }).eq("user_email", email),
      sb.from("saved_searches").select("id", { count: "exact", head: true }).eq("user_email", email),
      sb.from("inspection_notes").select("id", { count: "exact", head: true }).eq("author_email", email),
      sb.from("inspection_notes").select("id", { count: "exact", head: true }).eq("author_email", email).gte("created_at", weekStart),
      sb.from("point_ledger").select("id", { count: "exact", head: true }).eq("user_email", email).eq("reason", "attendance").gte("created_at", weekStart),
      sb.from("user_watchlist").select("complex_id", { count: "exact", head: true }).eq("user_email", email).gte("created_at", weekStart),
      alreadyAwardedRef(email, "onboarding_complete", null),
    ]);
  for (const r of [watchAll, savedAll, notesAll, notesWeek, attendWeek, watchWeek]) {
    if ((r as { error?: unknown }).error) throw new Error("미션 진행도 조회 실패");
  }
  const n = (r: { count: number | null }) => r.count ?? 0;

  const start: MissionState[] = [
    {
      key: "watch",
      label: "관심 단지 1곳 담기",
      desc: "지도나 단지 페이지에서 ♥ 를 누르면 시세 변동을 추적해 드려요.",
      href: "/map",
      target: 1,
      progress: Math.min(1, n(watchAll)),
      done: n(watchAll) >= 1,
      claimed: startClaimed,
      points: 0,
    },
    {
      key: "alert",
      label: "키워드 알림 1개 켜기",
      desc: "동네 이름을 등록하면 새 뉴스·청약이 잡히는 대로 알림함으로.",
      href: "/town/news",
      target: 1,
      progress: Math.min(1, n(savedAll)),
      done: n(savedAll) >= 1,
      claimed: startClaimed,
      points: 0,
    },
    {
      key: "note",
      label: "첫 기록 1편 남기기",
      desc: "현장 퀵모드로 사진·메모만 먼저 저장해도 됩니다.",
      href: "/notes/new?quick=1",
      target: 1,
      progress: Math.min(1, n(notesAll)),
      done: n(notesAll) >= 1,
      claimed: startClaimed,
      points: 0,
    },
  ];
  const startAllDone = start.every((m) => m.done);

  const weeklyDefs = [
    {
      key: "note1",
      label: "임장노트 1편",
      desc: "이번 주 다녀온 곳 한 곳이면 충분해요.",
      href: "/notes/new?quick=1",
      target: 1,
      progress: n(notesWeek),
    },
    {
      key: "attend3",
      label: "출석 3회",
      desc: "출석 체크 3일 — 연속이 아니어도 됩니다.",
      href: "/my/points",
      target: 3,
      progress: n(attendWeek),
    },
    {
      key: "watch2",
      label: "관심 단지 2곳 추가",
      desc: "비교하고 싶은 단지를 이번 주에 2곳 담아 보세요.",
      href: "/map",
      target: 2,
      progress: n(watchWeek),
    },
  ];
  const weekly: MissionState[] = await Promise.all(
    weeklyDefs.map(async (d) => ({
      ...d,
      done: d.progress >= d.target,
      claimed: await alreadyAwardedRef(email, "weekly_mission", `${weekKey}:${d.key}`),
      points: 50,
    })),
  );

  return { start, startAllDone, startClaimed, weekKey, weekly };
}
