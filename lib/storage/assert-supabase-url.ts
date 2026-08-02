import { getSupabaseUrl } from "@/lib/supabase/env";

/**
 * "서버가 대신 가져올 URL" 을 사용자에게 받지 않기 위한 출처 허용목록.
 *
 * ── 왜 있나 ────────────────────────────────────────────────────────────
 * 임장 세션 미디어는 파일 없이 `publicUrl` 만 보내도 저장됐고, 그 URL 을
 * STT 잡(lib/ai/transcribe.ts)이 서버에서 그대로 fetch 했다. 검사는
 * `url.startsWith("http")` 뿐이었다 — 그래서 이런 것들이 전부 통과한다:
 *
 *   http://169.254.169.254/latest/meta-data/...   (클라우드 인스턴스 메타데이터)
 *   http://127.0.0.1:<port>/...                    (내부 서비스·관리 포트)
 *   http://10.x.x.x/...                            (사설망)
 *
 * 이게 SSRF 다. 응답 본문 일부가 transcript 로 되돌아오고, 실패해도 응답의
 * `source` 가 fetch_failed / fetch_exception 으로 갈리므로 **내부 포트 스캐너**
 * 로도 쓸 수 있다. IP 대역 블랙리스트는 DNS 재바인딩·리다이렉트·IPv6 표기로
 * 새기 때문에, 우리가 실제로 필요한 단 하나의 출처만 허용한다:
 * 우리 Supabase 프로젝트의 스토리지 오리진.
 */

/** 허용 오리진 — Supabase 프로젝트 URL 의 origin (예: https://xxx.supabase.co) */
export function getSupabaseOrigin(): string | null {
  const raw = getSupabaseUrl();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * 이 URL 을 서버가 가져가도 되는가.
 * https 이고, 오리진이 Supabase 프로젝트와 정확히 같을 때만 true.
 * (호스트 접미사 비교가 아니라 origin 완전 일치 — `evil-xxx.supabase.co.attacker.com`
 *  같은 값이 접미사 검사만으로 통과하는 일을 없앤다.)
 */
export function isAllowedSupabaseUrl(url: string): boolean {
  const allowed = getSupabaseOrigin();
  if (!allowed) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return parsed.origin === allowed;
}

/**
 * 허용목록 밖이면 던진다 — 저장 경로에서 쓴다.
 *
 * `data:` 는 예외로 둔다. Supabase Storage 미설정 환경에서 lib/storage/upload.ts
 * 가 10 KB 이하 파일을 base64 data URL 로 돌려주는 폴백이 있고, 그 값은 바깥으로
 * 나가는 요청이 아니라 본문 그 자체라 SSRF 와 무관하다. 반대로 STT 가 쓰는
 * isAllowedSupabaseUrl 은 data: 도 막는다 — 거기서는 "가져올 대상"이어야 한다.
 */
export function assertSupabaseUrl(url: string): string {
  if (url.startsWith("data:")) return url;
  if (!isAllowedSupabaseUrl(url)) {
    throw new Error("허용되지 않은 URL 입니다. 파일 업로드 URL만 사용할 수 있습니다.");
  }
  return url;
}
