import type { DefaultSession } from "next-auth";
import type { AppPlan } from "@/lib/billing/plan";

export type AppUserRole = "admin" | "user";

declare module "next-auth" {
  interface User {
    role?: AppUserRole;
    /** JWT/세션에 반영되는 서버 플랜 (Supabase app_users.plan) */
    plan?: AppPlan;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: AppUserRole;
      plan: AppPlan;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: AppUserRole;
    plan?: AppPlan;
  }
}
