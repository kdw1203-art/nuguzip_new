import { safeAuth } from "@/lib/safe-auth";

export async function isAdminApiRequest(): Promise<boolean> {
  const session = await safeAuth();
  return Boolean(session?.user?.email && session.user.role === "admin");
}
