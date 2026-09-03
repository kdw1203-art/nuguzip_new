import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";
import { logger } from "@/lib/log";
import { maskEmailPublic } from "@/lib/privacy/mask-email";

/**
 * [945 · 실사용50 #14] 환영 메일 — **첫 로그인 성공 시 1회**.
 *
 * 가입 시점이 아니라 첫 로그인에 보내는 이유:
 * - 가입 직후에는 Supabase 인증 메일이 이미 나간다 — 같은 순간 두 통은 소음.
 * - 인증을 끝내지 않은(=로그인한 적 없는) 계정에는 보낼 이유가 없다.
 *
 * 중복 방지는 app_users.welcomed_at 을 **원자적으로 선점**해서 한다 —
 * `update … where email = ? and welcomed_at is null` 이 행을 돌려줄 때만
 * 발송한다. 조회→발송→기록 순서로 하면 동시 로그인 두 번에 두 통 나간다.
 *
 * app_users 행이 없는 계정(OAuth 등)은 건너뛴다 — 선점할 자리가 없으면
 * 중복을 막을 수 없고, 없는 행을 여기서 만들면 가입 경로가 두 개가 된다.
 */
export async function maybeSendWelcomeEmail(
  email: string,
  name?: string | null,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return;
  /* 카카오 이메일 미동의 사용자의 합성 주소 — 수신함이 없는 도메인 */
  if (normalized.endsWith("@noreply.nuguzip.com")) return;
  if (!isEmailConfigured()) return;
  const sb = getServiceSupabase();
  if (!sb) return;

  try {
    const { data, error } = await sb
      .from("app_users")
      .update({ welcomed_at: new Date().toISOString() })
      .eq("email", normalized)
      .is("welcomed_at", null)
      .select("email, name")
      .maybeSingle();
    if (error) {
      /* welcomed_at 컬럼 미적용 배포 등 — 환영 메일은 필수 경로가 아니다 */
      logger.warn("[welcome-email] 선점 실패 — 발송 생략", {
        message: error.message,
      });
      return;
    }
    if (!data) return; // 이미 발송했거나 app_users 행이 없다

    const displayName =
      (typeof data.name === "string" && data.name.trim()) ||
      (name ?? "").trim() ||
      normalized.split("@")[0] ||
      "회원";
    const result = await sendEmail({ to: normalized, ...welcomeEmail({ name: displayName }) });
    if (!result.sent) {
      logger.warn("[welcome-email] 발송 실패", {
        email: maskEmailPublic(normalized),
        reason: result.reason,
      });
    }
  } catch (e) {
    logger.warn("[welcome-email] 예외 — 로그인에는 영향 없음", e);
  }
}
