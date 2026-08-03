import "server-only";

/**
 * 토스페이먼츠 결제창을 끝까지 돌릴 수 있는 설정인가 (서버 판정).
 *
 * 클라이언트 키만 있으면 결제창은 뜨지만 승인(confirm)이 실패하고,
 * 시크릿 키만 있으면 창 자체가 안 뜬다 — 둘 다 있어야 "준비됨"이다.
 * lib/admin/integrations.ts 의 판정과 같은 기준을 쓴다.
 */
export function isTossPaymentsConfigured(): boolean {
  return (
    Boolean(process.env.TOSS_SECRET_KEY?.trim()) &&
    Boolean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim())
  );
}
