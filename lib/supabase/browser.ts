"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * 브라우저용 Supabase 클라이언트 — **탭당 하나만** 만든다.
 *
 * 최적화 35(2026-08-04): 전에는 부를 때마다 새로 만들었다. 지금 호출처가
 * /reset-password 한 곳(두 지점)이라 티가 안 났을 뿐, 인스턴스가 늘어나면
 * 각자 auth 토큰 자동 갱신 타이머와 storage 이벤트 구독을 따로 들고 돌면서
 * 콘솔에 "Multiple GoTrueClient instances detected" 가 찍히고, 두 인스턴스가
 * 같은 토큰을 서로 다른 시점에 갱신하려 들면 세션이 튄다.
 *
 * 모듈 변수로 잡아 둔다 — 브라우저 번들에서 모듈은 탭 수명 동안 하나다.
 * (undefined = 아직 안 만듦, null = 키가 없어 만들 수 없음. null 을 캐시하는
 * 이유는 키 없는 환경에서 매번 env 를 다시 훑지 않기 위해서다.)
 */
let _client: SupabaseClient | null | undefined;

export function createSupabaseBrowserClient() {
  if (_client !== undefined) return _client;
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    _client = null;
    return null;
  }
  _client = createBrowserClient(url, key);
  return _client;
}
