import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/**
 * B9 — 이탈 리마인드 대상 선별.
 *
 * ── 무엇을 알리는가 ────────────────────────────────────────────────
 * **본인이 실제로 남겨 둔 것**만 알린다. "오랜만이에요", "새 매물이 많아요" 같은
 * 문구는 여기서 만들지 않는다. 근거가 없는 알림은 광고고, 광고는 끄고 나면 끝이지만
 * 잘못된 사실은 신뢰를 깎는다.
 *
 * 그래서 사유는 실제 행 개수로만 만든다:
 *  ▸ draft_note      — status='draft' 인 본인 임장노트가 남아 있다
 *  ▸ watchlist_idle  — 실제 관심 단지 행이 있다(알림 구독 행 alert:% 는 제외)
 * 둘 다 없으면 후보가 아니다. 보낼 말이 없으면 안 보낸다.
 *
 * ── 왜 inspection_sessions 가 아니라 inspection_notes 인가 ─────────
 * inspection_sessions.status='active' 도 "쓰다 만 것"처럼 보이지만, 그 세션을
 * 이어서 여는 화면이 코드에 없다(app/notes 아래 세션 재개 경로 없음). 열리지 않는
 * 곳으로 보내는 알림은 알림이 아니라 막다른 길이라서 근거에서 뺐다.
 * inspection_notes 는 /notes/{id} 라는 실제 페이지가 있고 소유자 액션도 있다.
 *
 * ── 언제 보내는가 ──────────────────────────────────────────────────
 * 마지막 활동이 IDLE_DAYS 이상 지났고, MAX_DORMANT_DAYS 안쪽일 때만.
 * 위쪽 경계가 있는 이유: 반년 넘게 안 온 사람은 이미 떠난 사람이고, 기능을 처음
 * 켜는 날 휴면 명단 전체에 알림이 한꺼번에 나가는 사고를 막는다.
 *
 * 같은 사람에게 COOLDOWN_DAYS 안에 두 번 보내지 않는다(reengagement_log 기준).
 * 사유가 바뀌어도 마찬가지다 — 사람 입장에선 그냥 "또 왔다"이다.
 *
 * ── 이메일을 쓰지 않는 이유 ───────────────────────────────────────
 * 채널은 인앱 수신함 + 웹푸시(구독자)뿐이다. 재방문 유도 메일은 수신자 동의 범위와
 * 광고성 정보 표기 의무가 걸리는 영역이라, 그 준비 없이 보내지 않는다.
 */

/** 마지막 활동 이후 이만큼 지나야 후보 */
export const IDLE_DAYS = 14;
/** 이보다 오래 비어 있으면 대상에서 뺀다 */
export const MAX_DORMANT_DAYS = 180;
/** 같은 사람 재알림 최소 간격 */
export const COOLDOWN_DAYS = 30;

export type ReengagementReason = "draft_note" | "watchlist_idle";

export type ReengagementCandidate = {
  userEmail: string;
  reason: ReengagementReason;
  title: string;
  body: string;
  actionUrl: string;
  lastSeenAt: string;
  idleDays: number;
  /** 본문에 쓴 숫자와 같은 값 — 근거 없는 문장이 나가지 않게 하는 장치 */
  evidenceCount: number;
};

export type CandidateScan = {
  /** 휴면 구간에 들어온 사람 수 */
  dormant: number;
  /** 설정에서 껐거나 쿨다운 중이라 제외된 수 */
  optedOut: number;
  cooldown: number;
  /** 알릴 근거가 없어 제외된 수 */
  noEvidence: number;
  candidates: ReengagementCandidate[];
  reason?: string;
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function normEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function idleDaysFrom(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

const emptyScan = (reason: string): CandidateScan => ({
  dormant: 0,
  optedOut: 0,
  cooldown: 0,
  noEvidence: 0,
  candidates: [],
  reason,
});

export async function loadReengagementCandidates(
  limit = 200,
): Promise<CandidateScan> {
  const sb = getServiceSupabase();
  if (!sb) return emptyScan("no-store");

  /* 1) 휴면 구간에 들어온 사람 — 위·아래 경계를 모두 건다. */
  const { data: activity, error: activityErr } = await sb
    .from("user_last_activity_source")
    .select("user_email, last_seen_at, event_count")
    .lte("last_seen_at", daysAgoIso(IDLE_DAYS))
    .gte("last_seen_at", daysAgoIso(MAX_DORMANT_DAYS))
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (activityErr) {
    logger.warn("[reengage] 활동 조회 실패", activityErr.message);
    return emptyScan("activity-query-failed");
  }

  const rows = (activity ?? []) as Array<Record<string, unknown>>;
  const seen = new Map<string, string>();
  for (const r of rows) {
    const email = normEmail(r.user_email);
    const at = String(r.last_seen_at ?? "");
    if (email && at) seen.set(email, at);
  }
  const emails = [...seen.keys()];
  if (emails.length === 0) return emptyScan("no-dormant-users");

  /* 2) 수신 설정 · 쿨다운 · 근거를 한 번에 모은다.
        이메일 표기는 앱 전체가 소문자로 정규화해 저장한다(recordPlatformEvent·
        appendInboxNotification 참고). 대소문자가 섞인 과거 행이 있으면 그 행은
        매칭되지 않고 기본값(수신 허용)으로 떨어지므로, 아래 4)에서 근거가 없으면
        어차피 아무것도 보내지 않는다. */
  const [prefs, recentLog, drafts, watch] = await Promise.all([
    sb
      .from("notification_preferences")
      .select("user_email, push_reengagement")
      .in("user_email", emails),
    sb
      .from("reengagement_log")
      .select("user_email, sent_at")
      .gte("sent_at", daysAgoIso(COOLDOWN_DAYS))
      .in("user_email", emails),
    sb
      .from("inspection_notes")
      .select("id, author_email, title, apt_name, updated_at")
      .eq("status", "draft")
      .in("author_email", emails)
      .order("updated_at", { ascending: false })
      .limit(1000),
    sb
      .from("user_watchlist")
      .select("user_email, complex_id, complex_name, created_at")
      .not("complex_id", "like", "alert:%")
      .in("user_email", emails)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (prefs.error) logger.warn("[reengage] 설정 조회 실패", prefs.error.message);
  if (recentLog.error) logger.warn("[reengage] 로그 조회 실패", recentLog.error.message);
  if (drafts.error) logger.warn("[reengage] 초안 조회 실패", drafts.error.message);
  if (watch.error) logger.warn("[reengage] 관심단지 조회 실패", watch.error.message);

  /* 설정 조회가 실패하면 아무도 보내지 않는다 — 껐는지 모르는 채로 보내는 쪽이
     한 번 덜 보내는 쪽보다 나쁘다. */
  if (prefs.error) return emptyScan("prefs-query-failed");
  /* 같은 이유로, 쿨다운을 모르면 보내지 않는다(중복 발송 위험). */
  if (recentLog.error) return emptyScan("log-query-failed");

  const optedOutSet = new Set(
    ((prefs.data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => r.push_reengagement === false)
      .map((r) => normEmail(r.user_email)),
  );
  const cooldownSet = new Set(
    ((recentLog.data ?? []) as Array<Record<string, unknown>>).map((r) =>
      normEmail(r.user_email),
    ),
  );

  type DraftRow = { id: string; title: string; at: string };
  const draftsByEmail = new Map<string, DraftRow[]>();
  for (const r of (drafts.data ?? []) as Array<Record<string, unknown>>) {
    const email = normEmail(r.author_email);
    if (!email) continue;
    const id = String(r.id ?? "");
    if (!id) continue;
    const label =
      String(r.apt_name ?? "").trim() || String(r.title ?? "").trim() || "";
    const list = draftsByEmail.get(email) ?? [];
    list.push({ id, title: label, at: String(r.updated_at ?? "") });
    draftsByEmail.set(email, list);
  }

  type WatchRow = { complexId: string; name: string };
  const watchByEmail = new Map<string, WatchRow[]>();
  for (const r of (watch.data ?? []) as Array<Record<string, unknown>>) {
    const email = normEmail(r.user_email);
    const complexId = String(r.complex_id ?? "");
    if (!email || !complexId) continue;
    const list = watchByEmail.get(email) ?? [];
    list.push({ complexId, name: String(r.complex_name ?? "").trim() });
    watchByEmail.set(email, list);
  }

  /* 3) 사유를 만든다. 한 사람당 하나 — 초안이 우선(더 구체적이고 되돌아갈 곳이 분명하다). */
  let optedOut = 0;
  let cooldown = 0;
  let noEvidence = 0;
  const candidates: ReengagementCandidate[] = [];

  for (const [email, lastSeenAt] of seen) {
    if (optedOutSet.has(email)) {
      optedOut += 1;
      continue;
    }
    if (cooldownSet.has(email)) {
      cooldown += 1;
      continue;
    }

    const idleDays = idleDaysFrom(lastSeenAt);
    const myDrafts = draftsByEmail.get(email) ?? [];
    const myWatch = watchByEmail.get(email) ?? [];

    if (myDrafts.length > 0) {
      const head = myDrafts[0];
      const named = head.title ? `'${head.title}' ` : "";
      candidates.push({
        userEmail: email,
        reason: "draft_note",
        title: "쓰다 만 임장노트가 있어요",
        body:
          myDrafts.length === 1
            ? `${named}임장노트가 아직 작성 중이에요.`
            : `${named}외 ${myDrafts.length - 1}개의 임장노트가 아직 작성 중이에요.`,
        actionUrl: `/notes/${head.id}`,
        lastSeenAt,
        idleDays,
        evidenceCount: myDrafts.length,
      });
      continue;
    }

    if (myWatch.length > 0) {
      const head = myWatch[0];
      const named = head.name || "관심 단지";
      candidates.push({
        userEmail: email,
        reason: "watchlist_idle",
        title: "담아둔 관심 단지가 있어요",
        body:
          myWatch.length === 1
            ? `${named}을(를) 관심 단지로 담아 두셨어요.`
            : `${named} 외 ${myWatch.length - 1}곳을 관심 단지로 담아 두셨어요.`,
        actionUrl: `/complex/${encodeURIComponent(head.complexId)}`,
        lastSeenAt,
        idleDays,
        evidenceCount: myWatch.length,
      });
      continue;
    }

    noEvidence += 1;
  }

  return {
    dormant: seen.size,
    optedOut,
    cooldown,
    noEvidence,
    candidates,
  };
}
