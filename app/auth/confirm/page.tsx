import { AuthConfirmClient } from "./AuthConfirmClient";

export const dynamic = "force-dynamic";

/**
 * Supabase 이메일 확인·매직링크 수신 페이지.
 * - PKCE: ?code=… → /auth/callback 으로 넘겨 세션 교환
 * - 레거시/브릿지: #access_token=… → 클라이언트에서 세션 복구
 * - 죽은 Site URL(my-project-*.vercel.app) 브릿지도 여기로 모은다.
 */
export default function AuthConfirmPage() {
  return <AuthConfirmClient />;
}
