import type { UserExpertProfile } from "./store-db";

/** API/공개 응답에서 소유자 이메일·내부 user UUID 를 제외합니다.
    userId 는 내부 식별자다 — 공개 목록에 실리면 다른 API 와 조합해
    계정을 역추적하는 재료가 된다(2026-08-02 감사).
    [953] 순수 모듈로 분리 — access.ts 는 server-only 의존(프로필 조회)이 있어
    단위 테스트에서 못 불렀다. */
export function sanitizeExpertForPublic(
  e: UserExpertProfile,
): Omit<UserExpertProfile, "ownerEmail" | "userId"> {
  const { ownerEmail, userId, ...rest } = e;
  void ownerEmail;
  void userId;
  return rest;
}
