import "server-only";
import { createHmac } from "crypto";

/* ============================================================
   채팅 가명 ID — 회원 이메일을 브라우저로 보내지 않기 위한 서버 전용 변환.

   왜 필요한가: 모임 채팅 API 는 메시지·멤버·차단 목록에 **원본 이메일**을
   그대로 실어 보냈다. 화면에서야 "abcd***" 로 가려 그렸지만, F12 네트워크
   탭에는 같은 방 모든 참여자의 이메일이 통째로 보였다 — 마스킹은 표시의
   문제고, 유출은 전송의 문제다. 전송에서 막아야 한다.

   설계:
   - 가명 ID = HMAC-SHA256(secret, 정규화 이메일) 앞 12 hex.
     · 단방향 — 클라이언트는 ID 에서 이메일을 복원할 수 없다.
     · 결정적 — 같은 사람은 방이 달라도 같은 ID (차단 목록 대조가 성립).
   - 차단 등 "사람을 지목하는" 요청은 (roomId, 가명 ID) 로 받는다. 서버가
     그 방 멤버들의 가명을 다시 계산해 일치하는 이메일을 찾는다 — 지목
     가능한 범위가 **자기가 속한 방의 멤버**로 자연히 제한된다.
   - 저장은 그대로 이메일 기준이다(차단 집행 로직 무변경). 가명은 오직
     전송 경계에서만 쓴다.

   비밀키: CHAT_ALIAS_SECRET(없으면 AUTH_SECRET). 키가 바뀌면 가명도 바뀌지만
   저장이 이메일 기준이라 차단 자체는 유지된다 — 클라이언트 화면 대조만
   다음 로드에서 새 ID 로 다시 맞춰진다.
   ============================================================ */

function aliasSecret(): string {
  const s = process.env.CHAT_ALIAS_SECRET || process.env.AUTH_SECRET || "";
  /* 프로덕션은 auth.ts 가 AUTH_SECRET 없이는 부팅을 거부하므로 여기 빈 문자열이
     올 일이 없다. 로컬·CI 일회용 서버만 이 폴백을 탄다. */
  return s || "chat-alias-dev-fallback";
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 이메일 → 가명 ID (12 hex, 단방향·결정적) */
export function chatAliasId(email: string): string {
  return createHmac("sha256", aliasSecret())
    .update(normalizeEmail(email))
    .digest("hex")
    .slice(0, 12);
}

/**
 * 화면 표시명. 이메일 로컬파트를 쓰지 않는다 — "kimc***" 같은 부분 마스킹도
 * 실명 이메일의 조각이라 유출이다. 가명 앞 4자리면 방 안에서 구분엔 충분하다.
 */
export function chatAliasLabel(aliasId: string): string {
  return `이웃 ${aliasId.slice(0, 4)}`;
}

/**
 * (같은 방 멤버 이메일 목록, 가명 ID) → 이메일. 없으면 null.
 * 후보를 방 멤버로 한정하는 것이 권한 경계다 — 방 밖 사람은 지목할 수 없다.
 */
export function resolveChatAlias(
  aliasId: string,
  candidateEmails: string[],
): string | null {
  const wanted = aliasId.trim().toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(wanted)) return null;
  for (const email of candidateEmails) {
    if (chatAliasId(email) === wanted) return normalizeEmail(email);
  }
  return null;
}
