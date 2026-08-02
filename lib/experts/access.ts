import type { Session } from "next-auth";
import { getAppUserIdByEmail } from "@/lib/me/profile";
import type { UserExpertProfile } from "./store-db";

export async function canManageExpertProfile(
  session: Session | null,
  expert: UserExpertProfile,
): Promise<boolean> {
  if (!session?.user?.email) return false;
  if (session.user.role === "admin") return true;
  const email = session.user.email.trim().toLowerCase();
  const owner = expert.ownerEmail?.trim().toLowerCase();
  if (owner && owner === email) return true;
  const uid = await getAppUserIdByEmail(session.user.email);
  if (uid && expert.userId && expert.userId === uid) return true;
  return false;
}

/** API/공개 응답에서 소유자 이메일·내부 user UUID 를 제외합니다.
    userId 는 내부 식별자다 — 공개 목록에 실리면 다른 API 와 조합해
    계정을 역추적하는 재료가 된다(2026-08-02 감사). */
export function sanitizeExpertForPublic(
  e: UserExpertProfile,
): Omit<UserExpertProfile, "ownerEmail" | "userId"> {
  const { ownerEmail, userId, ...rest } = e;
  void ownerEmail;
  void userId;
  return rest;
}
