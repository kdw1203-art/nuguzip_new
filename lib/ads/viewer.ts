import { safeAuth } from "@/lib/safe-auth";
import { isAdFreePlan } from "@/lib/ads/ad-free";

export type AdViewer = {
  signedIn: boolean;
  /** null = 비로그인(또는 세션 없음) — AdSlot 은 이를 "모른다"로 취급한다 */
  plan: string | null;
  adFree: boolean;
};

/**
 * AdSlot 에 넘길 보는 사람 정보 공용 헬퍼 (동적 렌더 페이지용).
 *
 * 플랜은 세션에서 읽는다 — auth.ts jwt 콜백이 요청마다 DB plan 을 동기화하므로
 * 별도 조회 없이 최신에 가깝다. ⚠️ `revalidate` 로 정적 캐시되는 페이지에서는
 * 부르지 말 것: 세션(쿠키) 접근이 페이지를 통째로 동적으로 만들어 캐시가 죽는다.
 * 그런 페이지는 AdSlot 이 클라이언트 게이트(AdFreeGate)로 유료 플랜을 숨긴다.
 */
export async function getAdViewer(): Promise<AdViewer> {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) return { signedIn: false, plan: null, adFree: false };
  const plan = (session?.user as { plan?: string } | undefined)?.plan ?? "free";
  return { signedIn: true, plan, adFree: isAdFreePlan(plan) };
}
