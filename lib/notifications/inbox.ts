import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* 받은편지함 — 채널 두 개가 한 테이블에 산다.
 *
 *   channel='user' … 사용자에게 보내는 알림(매물 승인·관심 지역·댓글·좋아요)
 *   channel='ops'  … 내부 점검 경보([HEALTH] …) — 관리자만 본다
 *
 * 왜 갈랐나(2026-08-26 실측): 이 테이블 58행이 **전부** 운영 경보였고 수신자도
 * 소유자 2계정뿐이었다. 사용자용 알림 센터가 통째로 내부 로그에 점거돼,
 * 화면에서는 '활동(댓글·좋아요)' 으로 오분류되고 헤더 벨 배지는 매시 새 경보가
 * 들어와 영구히 빨간 상태였다. 늘 빨간 배지는 아무도 읽지 않는다.
 *
 * 채널을 붙이는 쪽은 DB 트리거(public.tag_inbox_channel)다 — 경보를 쓰는 함수가
 * 7개라 앱에서 거르면 다음에 하나 늘 때 또 샌다. 여기서는 **읽을 때** 좁힌다.
 */

export type InboxChannel = "user" | "ops";

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
  channel: InboxChannel;
};

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 본문 규칙은 DB 트리거와 같은 것을 쓴다 — 개발용 메모리 저장소에도 적용한다. */
function inferChannel(title: string, body: string): InboxChannel {
  return body.startsWith("[HEALTH]") || title.startsWith("감시 잡 중단")
    ? "ops"
    : "user";
}

const memory = new Map<string, InboxItem[]>();

function memList(email: string, channel: InboxChannel): InboxItem[] {
  const key = normEmail(email);
  return [...(memory.get(key) ?? [])]
    .filter((x) => x.channel === channel)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function memPush(email: string, row: InboxItem) {
  const key = normEmail(email);
  const cur = memory.get(key) ?? [];
  cur.unshift(row);
  memory.set(key, cur);
}

export async function listInboxForEmail(
  email: string,
  channel: InboxChannel = "user",
): Promise<InboxItem[]> {
  const key = normEmail(email);
  const sb = getServiceSupabase();
  /* 클라이언트가 아예 없는 건 개발 환경(환경변수 미설정)이라 메모리 목록으로 대체한다.
     아래 `error` 는 그것과 다르다 — 테이블은 있는데 못 읽은 것이다. */
  if (!sb) return memList(email, channel);
  const { data, error } = await sb
    .from("user_inbox_notifications")
    .select("id, title, body, action_url, read_at, created_at, channel")
    .eq("user_email", key)
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(100);
  /* 2026-07-26: 여기서 `[]` 를 돌려주면 /notifications 가 "아직 알림이 없어요.
     관심 지역·키워드를 구독하면 새 소식을 여기에서 받아볼 수 있어요." 라고 쓴다.
     읽지 못한 것을 "없다" 고 단언하는 것이라 던진다. 행이 0개인 것만 빈 목록이다. */
  if (error) {
    logger.error("[inbox] user_inbox_notifications 조회 실패", error.message);
    throw new Error(`user_inbox_notifications 조회 실패: ${error.message}`);
  }
  if (!Array.isArray(data)) throw new Error("user_inbox_notifications 응답이 배열이 아닙니다");
  return data.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    body: r.body as string,
    actionUrl: (r.action_url as string | null) ?? null,
    readAt: (r.read_at as string | null) ?? null,
    createdAt: r.created_at as string,
    channel: ((r.channel as string) === "ops" ? "ops" : "user") as InboxChannel,
  }));
}

export async function appendInboxNotification(input: {
  userEmail: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  channel?: InboxChannel;
}): Promise<void> {
  const key = normEmail(input.userEmail);
  const channel = input.channel ?? inferChannel(input.title, input.body);
  const row: InboxItem = {
    id: `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl ?? null,
    readAt: null,
    createdAt: new Date().toISOString(),
    channel,
  };
  const sb = getServiceSupabase();
  if (!sb) {
    memPush(key, row);
    return;
  }
  const { error } = await sb.from("user_inbox_notifications").insert({
    user_email: key,
    title: input.title,
    body: input.body,
    action_url: input.actionUrl ?? null,
    channel,
  });
  /* 프로덕션에서 무음 삼킴 금지 — 예전엔 NODE_ENV!=="production" 일 때만 warn 을
     찍어서, 운영에서 insert 가 깨지면(정책 변경·컬럼 드리프트) **아무 흔적 없이**
     모든 알림이 증발했다. 전 기간 0행을 실사하다 발견한 구조다(이번엔 쓰기 경로가
     정상임을 service_role 실삽입으로 확인했지만, 다음 고장은 로그가 잡아야 한다).
     던지지는 않는다 — 알림은 곁가지라 본작업을 죽이면 안 된다. */
  if (error) {
    logger.error("[inbox] insert 실패 — 알림이 유실됩니다:", error.message);
  }
}

export async function markInboxItemRead(
  email: string,
  id: string,
): Promise<boolean> {
  const key = normEmail(email);
  const sb = getServiceSupabase();
  if (!sb) {
    const list = memory.get(key) ?? [];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    list[i] = { ...list[i], readAt: new Date().toISOString() };
    memory.set(key, list);
    return true;
  }
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("user_inbox_notifications")
    .update({ read_at: now })
    .eq("id", id)
    .eq("user_email", key)
    .select("id")
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/** channel 을 주면 그 채널만, 안 주면 전 채널을 읽음 처리한다. */
export async function markAllInboxRead(
  email: string,
  channel?: InboxChannel,
): Promise<void> {
  const key = normEmail(email);
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const list = memory.get(key) ?? [];
    memory.set(
      key,
      list.map((x) =>
        channel && x.channel !== channel ? x : { ...x, readAt: x.readAt ?? now },
      ),
    );
    return;
  }
  let q = sb
    .from("user_inbox_notifications")
    .update({ read_at: now })
    .eq("user_email", key)
    .is("read_at", null);
  if (channel) q = q.eq("channel", channel);
  await q;
}

/** 미읽음 알림 수 — 헤더 벨 배지용(B10). read_at null 카운트.
 *  배지는 **사용자 알림만** 센다. 운영 경보는 매시 새로 들어와 영구히 빨간
 *  배지를 만들었고, 그건 사용자에게 아무 뜻도 없는 신호였다. */
export async function countUnreadInbox(
  email: string,
  channel: InboxChannel = "user",
): Promise<number> {
  const key = normEmail(email);
  if (!key) return 0;
  const sb = getServiceSupabase();
  if (!sb) {
    const list = memory.get(key) ?? [];
    return list.filter((x) => !x.readAt && x.channel === channel).length;
  }
  const { count, error } = await sb
    .from("user_inbox_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_email", key)
    .eq("channel", channel)
    .is("read_at", null);
  /* count 가 null 이 되는 건 미읽음이 0건일 때가 아니라 집계가 실패했을 때다.
     `?? 0` 으로 눌러 버리면 벨 배지가 "안 읽은 알림 없음" 을 사실인 것처럼 그린다.
     호출부(/api/notifications/unread-count)가 배지를 숨기는 쪽으로 처리한다. */
  if (error) {
    logger.error("[inbox] 미읽음 집계 실패", error.message);
    throw new Error(`user_inbox_notifications 미읽음 집계 실패: ${error.message}`);
  }
  if (typeof count !== "number") {
    throw new Error("user_inbox_notifications 미읽음 집계 결과가 숫자가 아닙니다");
  }
  return count;
}

/** Alias for appendInboxNotification — preferred name going forward */
export const pushInboxNotification = appendInboxNotification;
