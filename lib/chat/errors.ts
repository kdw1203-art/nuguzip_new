/**
 * 채팅 저장소가 "못 읽었다"를 말하는 방법.
 *
 * store-db 의 조회는 예전에 실패해도 빈 배열·false·null 을 그대로 돌려줬다.
 * 그러면 화면은 그것을 "방이 없다", "당신은 멤버가 아니다", "차단 목록이
 * 비었다"로 그린다 — 못 읽은 것과 없는 것은 다른 사실인데 같은 그림이 된다.
 * 이 프로젝트에서 확인된 실제 피해는 이렇다.
 *   - findGroupRoomIdByMeeting 실패 → "방 없음" → 같은 모임에 채팅방이 하나 더
 *     생기고 joinMeeting 이 다시 불려 current_members 가 부풀었다.
 *   - hasRoomMembershipRecord 실패 → "처음 온 사람" → 이미 집계된 멤버가 다시
 *     정원에 더해지거나 "정원이 가득 찼어요"로 막혔다.
 *   - leaveChatRoom 실패 → "멤버 아님" → 자기 방에서 나가려는데 403 이 떴다.
 *   - listBlocksForUser 실패 → "차단 없음" → 차단이 조용히 풀린 채로 동작했다.
 *
 * 그래서 조회·갱신이 실패하면 이 예외를 던진다. app/api/chat/_shared.ts 의
 * toErrorResponse 가 이 예외만 503 + Retry-After 로 옮긴다. 기본 경로인 400 으로
 * 가면 "네 요청이 잘못됐다"가 되어 클라이언트가 재시도할 이유를 못 찾고,
 * 404 로 가면 "그런 방은 없다"라는 없는 사실이 된다.
 *
 * `!sb`(저장소 미설정) 는 여기 해당하지 않는다 — 그건 개발용 in-memory 폴백이
 * 의도적으로 동작하는 경로다.
 */
export class ChatUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatUnavailableError";
  }
}

/** Supabase 의 `{ error }` 를 그대로 옮겨 던질 예외로 만든다. */
export function chatDbError(where: string, err: { message?: string } | null): ChatUnavailableError {
  return new ChatUnavailableError(`${where}: ${err?.message ?? "알 수 없는 오류"}`);
}
