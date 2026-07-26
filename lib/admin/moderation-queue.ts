/**
 * 모더레이션 큐 집계 (서버 전용).
 *
 * 배경(사실 우선): `/admin/moderation` 은 전부 하드코딩된 가짜 칸반이었다.
 * "신고 3건 · 자동 감지 포함", "SLA 평균 41시간", "자동 필터 룰 12개 활성 · 오탐률 3.1%"
 * 같은 수치는 어디에도 근거가 없는데 운영 화면에 사실처럼 표시돼, 운영자가 실제 신고가
 * 없는 상태를 "처리 중"으로 오인할 수 있었다. 이 모듈은 content_reports · chat_reports
 * 두 실테이블만 읽어 큐와 지표를 만든다. 없으면 없다고 표시한다.
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export type QueueSource = "content" | "chat";
export type QueueStatus = "open" | "reviewed" | "dismissed" | "actioned";

export interface QueueItem {
  id: string;
  source: QueueSource;
  status: QueueStatus;
  /** 신고 사유 원문 */
  reason: string;
  /** 신고 분류(있을 때만) */
  category: string | null;
  reporter: string | null;
  /** 신고 대상 식별자 — 게시글/댓글 ID 또는 대상 계정 */
  target: string | null;
  targetKind: string | null;
  createdAt: string;
  handledAt: string | null;
  handledBy: string | null;
  /** 접수 후 경과 시간(시간 단위) — 미처리 건만 의미 있음 */
  ageHours: number;
}

export interface ModerationStats {
  /** 미처리 */
  open: number;
  /** 처리 완료(reviewed+actioned) */
  resolved: number;
  /** 기각 */
  dismissed: number;
  total: number;
  /** 최근 30일 접수 */
  last30d: number;
  /** 접수→처리 평균 시간(시간). 처리 이력이 없으면 null */
  avgHandleHours: number | null;
  /** 가장 오래 대기 중인 미처리 건의 경과 시간 */
  oldestOpenHours: number | null;
  bySource: Record<QueueSource, number>;
}

function hoursBetween(a: string | null, b: number): number {
  if (!a) return 0;
  const t = new Date(a).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (b - t) / 3_600_000);
}

function normStatus(v: unknown): QueueStatus {
  const s = String(v ?? "open");
  return s === "reviewed" || s === "dismissed" || s === "actioned" ? s : "open";
}

/** content_reports + chat_reports → 통합 큐. 최신순. */
export async function loadModerationQueue(limit = 200): Promise<QueueItem[]> {
  /* 2026-07-26: 여기서 error 를 로그만 남기고 빈 배열로 넘겼다. 그러면
     /admin/moderation 은 "미처리 0건" 옆에 "표시되는 수치는 모두 DB 실집계입니다"
     라고 적어 놓은 화면을 그대로 그린다 — 신고가 쌓여 있어도 운영자는 "처리할 게
     없다"고 읽는다. 호출부에 ErrorState 를 붙여도 여기서 삼키면 영원히 안 뜬다.
     그래서 삼키던 자리를 던지는 자리로 바꾼다. */
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error(
      "[moderation-queue] Supabase 서비스 클라이언트를 만들 수 없습니다 (SUPABASE_SERVICE_ROLE_KEY 누락)",
    );
  }
  const now = Date.now();

  // Supabase 쿼리 빌더는 예외를 던지지 않고 { data, error } 를 돌려준다.
  // (PromiseLike 라 .catch() 도 못 붙는다) — error 를 직접 보고 던져야 한다.
  const [content, chat] = await Promise.all([
    sb
      .from("content_reports")
      .select(
        "id,reason,report_category,reporter_email,target_type,target_post_id,target_comment_id,target_note_id,post_id,comment_id,status,created_at,handled_at,admin_note",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    sb
      .from("chat_reports")
      .select(
        "id,reason,reporter_email,target_email,room_id,message_id,status,created_at,handled_at,handled_by_email",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  /* 한쪽만 실패해도 던진다 — 남은 쪽만 보여 주면 "커뮤니티 신고 3건 · 채팅 0건"
     처럼 절반이 빠진 수치가 사실인 것처럼 보인다. */
  if (content.error) {
    logger.error("[moderation-queue] content_reports 조회 실패", content.error.message);
    throw new Error(`content_reports 조회 실패: ${content.error.message}`);
  }
  if (chat.error) {
    logger.error("[moderation-queue] chat_reports 조회 실패", chat.error.message);
    throw new Error(`chat_reports 조회 실패: ${chat.error.message}`);
  }

  const items: QueueItem[] = [];

  for (const r of ((content as { data?: Record<string, unknown>[] | null }).data ?? [])) {
    const target =
      (r.target_post_id ?? r.post_id ?? r.target_comment_id ?? r.comment_id ?? r.target_note_id) ??
      null;
    items.push({
      id: String(r.id),
      source: "content",
      status: normStatus(r.status),
      reason: String(r.reason ?? ""),
      category: r.report_category ? String(r.report_category) : null,
      reporter: r.reporter_email ? String(r.reporter_email) : null,
      target: target ? String(target) : null,
      targetKind: r.target_type ? String(r.target_type) : r.comment_id ? "comment" : "post",
      createdAt: String(r.created_at ?? ""),
      handledAt: r.handled_at ? String(r.handled_at) : null,
      handledBy: r.admin_note ? String(r.admin_note) : null,
      ageHours: hoursBetween(r.created_at ? String(r.created_at) : null, now),
    });
  }

  for (const r of ((chat as { data?: Record<string, unknown>[] | null }).data ?? [])) {
    items.push({
      id: String(r.id),
      source: "chat",
      status: normStatus(r.status),
      reason: String(r.reason ?? ""),
      category: null,
      reporter: r.reporter_email ? String(r.reporter_email) : null,
      target: r.target_email ? String(r.target_email) : null,
      targetKind: "chat-message",
      createdAt: String(r.created_at ?? ""),
      handledAt: r.handled_at ? String(r.handled_at) : null,
      handledBy: r.handled_by_email ? String(r.handled_by_email) : null,
      ageHours: hoursBetween(r.created_at ? String(r.created_at) : null, now),
    });
  }

  return items.sort((a, b) => {
    // 미처리 우선, 그 다음 최신순
    if ((a.status === "open") !== (b.status === "open")) return a.status === "open" ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** 큐에서 파생된 실지표 — 추정 없이 계산 가능한 것만 담는다. */
export function summarizeQueue(items: QueueItem[]): ModerationStats {
  const now = Date.now();
  const cutoff = now - 30 * 86_400_000;
  let open = 0;
  let resolved = 0;
  let dismissed = 0;
  let last30d = 0;
  let handleSum = 0;
  let handleCount = 0;
  let oldestOpen: number | null = null;
  const bySource: Record<QueueSource, number> = { content: 0, chat: 0 };

  for (const it of items) {
    bySource[it.source] += 1;
    if (it.status === "open") {
      open += 1;
      oldestOpen = oldestOpen == null ? it.ageHours : Math.max(oldestOpen, it.ageHours);
    } else if (it.status === "dismissed") dismissed += 1;
    else resolved += 1;

    const t = new Date(it.createdAt).getTime();
    if (!Number.isNaN(t) && t >= cutoff) last30d += 1;

    if (it.handledAt && it.createdAt) {
      const a = new Date(it.createdAt).getTime();
      const b = new Date(it.handledAt).getTime();
      if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) {
        handleSum += (b - a) / 3_600_000;
        handleCount += 1;
      }
    }
  }

  return {
    open,
    resolved,
    dismissed,
    total: items.length,
    last30d,
    avgHandleHours: handleCount > 0 ? handleSum / handleCount : null,
    oldestOpenHours: oldestOpen,
    bySource,
  };
}
