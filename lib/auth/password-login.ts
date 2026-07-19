import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/auth/types";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";
import { getServiceSupabase } from "@/lib/supabase/service";

type Creds = Record<"email" | "password", string> | undefined;

async function tryAppUsersBcrypt(
  email: string,
  password: string,
): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
} | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;

  const { data: row, error } = await sb
    .from("app_users")
    .select("id, email, name, password_hash, role")
    .eq("email", email)
    .maybeSingle();

  if (error || !row?.password_hash) return null;

  const ok = await bcrypt.compare(password, row.password_hash as string);
  if (!ok) return null;

  const role: UserRole =
    (row.role as string) === "admin" ? "admin" : "user";

  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name ?? row.email.split("@")[0] ?? "회원"),
    role,
  };
}

/** Supabase Auth(대시보드·signUp) 사용자 — anon/Publishable 키만으로 검증 */
async function trySupabaseAuthPassword(
  email: string,
  password: string,
): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
} | null> {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return null;

  const anon = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user?.email) return null;

  const meta = data.user.user_metadata as Record<string, unknown> | undefined;
  const nameFromMeta =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.name === "string"
        ? meta.name
        : undefined;

  return {
    id: data.user.id,
    email: data.user.email,
    name: nameFromMeta ?? data.user.email.split("@")[0] ?? "회원",
    role: "user",
  };
}

export async function authorizeWithPassword(
  credentials: Creds,
): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
} | null> {
  const email = String(credentials?.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(credentials?.password ?? "");
  if (!email.includes("@") || password.length < 8) return null;

  const fromDb = await tryAppUsersBcrypt(email, password);
  if (fromDb) return fromDb;

  return trySupabaseAuthPassword(email, password);
}
