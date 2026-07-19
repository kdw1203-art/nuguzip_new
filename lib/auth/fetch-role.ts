import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import type { UserRole } from "@/lib/auth/types";

export type { UserRole };

export async function fetchUserRoleByEmail(
  email: string,
): Promise<UserRole> {
  const { role } = await fetchAppUserByEmail(email);
  return role;
}
