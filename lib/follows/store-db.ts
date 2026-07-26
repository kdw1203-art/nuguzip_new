/**
 * 사용자 팔로우 스토어.
 * Supabase `user_follows` 테이블을 사용하며 미설정 시 in-memory.
 *
 * 조회는 **실패하면 던진다.** 예전에는 error 를 받지 않아서 조회가 밀리는 동안
 * 팔로잉·팔로워 목록이 빈 배열로, 팔로워 수가 `0명`으로, 팔로우 여부가
 * "안 하는 중"으로 나갔다. 특히 프로필의 "팔로워 0명"은 누가 봐도 사실 주장이라
 * 못 셌다는 말과 바꿔 쓸 수 없다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";

export interface FollowRecord {
  followerEmail: string;
  followedEmail: string;
  createdAt: string;
}

const inMemory: FollowRecord[] = [];

export async function followUser(followerEmail: string, followedEmail: string): Promise<void> {
  if (followerEmail === followedEmail) throw new Error("자기 자신은 팔로우할 수 없습니다.");
  const sb = getServiceSupabase();
  if (!sb) {
    if (!inMemory.find((f) => f.followerEmail === followerEmail && f.followedEmail === followedEmail)) {
      inMemory.push({ followerEmail, followedEmail, createdAt: new Date().toISOString() });
    }
    return;
  }
  await sb.from("user_follows").upsert({ follower_email: followerEmail, followed_email: followedEmail });
}

export async function unfollowUser(followerEmail: string, followedEmail: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) {
    const idx = inMemory.findIndex(
      (f) => f.followerEmail === followerEmail && f.followedEmail === followedEmail,
    );
    if (idx !== -1) inMemory.splice(idx, 1);
    return;
  }
  await sb.from("user_follows")
    .delete()
    .eq("follower_email", followerEmail)
    .eq("followed_email", followedEmail);
}

export async function isFollowing(followerEmail: string, followedEmail: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) {
    return inMemory.some(
      (f) => f.followerEmail === followerEmail && f.followedEmail === followedEmail,
    );
  }
  const { data, error } = await sb
    .from("user_follows")
    .select("follower_email")
    .eq("follower_email", followerEmail)
    .eq("followed_email", followedEmail)
    .maybeSingle();
  /* 행이 없으면 error 없이 data=null 이다 — 그 null 만 "팔로우 안 함"이다. */
  if (error) throw new Error(`user_follows 조회 실패: ${error.message}`);
  return !!data;
}

export async function listFollowing(followerEmail: string): Promise<FollowRecord[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    return inMemory.filter((f) => f.followerEmail === followerEmail);
  }
  const { data, error } = await sb
    .from("user_follows")
    .select("follower_email, followed_email, created_at")
    .eq("follower_email", followerEmail)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`user_follows 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) {
    throw new Error("user_follows 조회 실패: 응답이 배열이 아닙니다");
  }
  return data.map((r) => ({
    followerEmail: String(r.follower_email),
    followedEmail: String(r.followed_email),
    createdAt: String(r.created_at),
  }));
}

export async function listFollowers(followedEmail: string): Promise<FollowRecord[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    return inMemory.filter((f) => f.followedEmail === followedEmail);
  }
  const { data, error } = await sb
    .from("user_follows")
    .select("follower_email, followed_email, created_at")
    .eq("followed_email", followedEmail)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`user_follows 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) {
    throw new Error("user_follows 조회 실패: 응답이 배열이 아닙니다");
  }
  return data.map((r) => ({
    followerEmail: String(r.follower_email),
    followedEmail: String(r.followed_email),
    createdAt: String(r.created_at),
  }));
}

/** ilike 패턴 이스케이프 — %·_·\ 를 리터럴로 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * 핸들(또는 닉네임) → profiles.email 해석.
 * /u/[handle]과 동일한 매칭 규칙: handle 일치(대소문자 무시) → full_name 폴백.
 * 클라이언트에 이메일을 노출하지 않고 팔로우하기 위한 서버 전용 헬퍼.
 */
export async function resolveEmailByHandle(handleOrName: string): Promise<string | null> {
  const q = handleOrName.trim();
  if (!q) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const pattern = escapeLike(q);
    const byHandle = await sb.from("profiles").select("email").ilike("handle", pattern).limit(1);
    let row = byHandle.error ? null : (byHandle.data?.[0] ?? null);
    if (!row) {
      const byName = await sb.from("profiles").select("email").ilike("full_name", pattern).limit(1);
      row = byName.error ? null : (byName.data?.[0] ?? null);
    }
    const email = row?.email ? String(row.email).trim() : "";
    return email || null;
  } catch {
    return null;
  }
}

export async function followCounts(email: string): Promise<{ following: number; followers: number }> {
  const sb = getServiceSupabase();
  if (!sb) {
    return {
      following: inMemory.filter((f) => f.followerEmail === email).length,
      followers: inMemory.filter((f) => f.followedEmail === email).length,
    };
  }
  const [fing, fers] = await Promise.all([
    sb
      .from("user_follows")
      .select("followed_email", { count: "exact", head: true })
      .eq("follower_email", email),
    sb
      .from("user_follows")
      .select("follower_email", { count: "exact", head: true })
      .eq("followed_email", email),
  ]);
  if (fing.error) throw new Error(`user_follows 개수 조회 실패: ${fing.error.message}`);
  if (fers.error) throw new Error(`user_follows 개수 조회 실패: ${fers.error.message}`);
  /* `?? 0` 은 "못 셌다"를 "0명"으로 바꾼다. 화면에는 그 0 이 그대로 찍힌다. */
  if (typeof fing.count !== "number" || typeof fers.count !== "number") {
    throw new Error("user_follows 개수 조회 실패: count 를 받지 못했습니다");
  }
  return { following: fing.count, followers: fers.count };
}
