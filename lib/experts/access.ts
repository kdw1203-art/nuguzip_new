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

/** API/공개 응답에서 소유자 이메일을 제외합니다. */
export function sanitizeExpertForPublic(
  e: UserExpertProfile,
): Omit<UserExpertProfile, "ownerEmail"> {
  const { ownerEmail, ...rest } = e;
  void ownerEmail;
  return rest;
}
