import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Client Components — 쿠키 기반 세션과 동기화된 브라우저 클라이언트.
 *
 * 최적화 35(2026-08-04): 예전에는 여기서 `createBrowserClient` 를 **직접** 한 번 더
 * 불렀다. 즉 브라우저 클라이언트를 만드는 곳이 두 군데였고, 둘 다 부를 때마다 새
 * 인스턴스를 만들었다. 인스턴스가 둘 이상이면 각자 auth 토큰 갱신 타이머와 storage
 * 구독을 들고 돌면서 콘솔에 "Multiple GoTrueClient instances detected" 가 찍히고,
 * 같은 토큰을 서로 다른 시점에 갱신하려 들면 세션이 튄다.
 *
 * 이제 생성은 lib/supabase/browser 한 곳(탭당 1개 메모이즈)에 맡기고, 여기서는
 * **계약만** 유지한다 — 이쪽 호출처는 null 을 처리하지 않고 throw 를 기대한다.
 */
export function createClient() {
  const client = createSupabaseBrowserClient();
  if (!client) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return client;
}
