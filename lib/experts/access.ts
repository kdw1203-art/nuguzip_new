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

export { sanitizeExpertForPublic } from "./public-dto";
