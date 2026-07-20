/**
 * 사용자 팔로우 스토어.
 * Supabase `user_follows` 테이블을 사용하며 미설정 시 in-memory.
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
  const { data } = await sb
    .from("user_follows")
    .select("follower_email")
    .eq("follower_email", followerEmail)
    .eq("followed_email", followedEmail)
    .maybeSingle();
  return !!data;
}

export async function listFollowing(followerEmail: string): Promise<FollowRecord[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    return inMemory.filter((f) => f.followerEmail === followerEmail);
  }
  const { data } = await sb
    .from("user_follows")
    .select("follower_email, followed_email, created_at")
    .eq("follower_email", followerEmail)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
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
  const { data } = await sb
    .from("user_follows")
    .select("follower_email, followed_email, created_at")
    .eq("followed_email", followedEmail)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
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
    sb.from("user_follows").select("followed_email", { count: "exact", head: true }).eq("follower_email", email),
    sb.from("user_follows").select("follower_email", { count: "exact", head: true }).eq("followed_email", email),
  ]);
  return {
    following: fing.count ?? 0,
    followers: fers.count ?? 0,
  };
}
