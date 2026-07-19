import type { Session } from "next-auth";
import { auth } from "@/auth";
import { logger } from "@/lib/log";

function isNextDynamicUsageError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const o = e as { digest?: string; description?: string };
  if (o.digest === "DYNAMIC_SERVER_USAGE") return true;
  const d = o.description ?? "";
  return typeof d === "string" && d.includes("Dynamic server usage");
}

/** AUTH_SECRET 누락 등으로 `auth()` 가 던지는 오류를 500 대신 흡수 (정적 프리렌더 유도 오류는 재던짐) */
export async function safeAuth(): Promise<Session | null> {
  try {
    return await auth();
  } catch (e) {
    if (isNextDynamicUsageError(e)) throw e;
    logger.error("[safeAuth]", e);
    return null;
  }
}
