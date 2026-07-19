/**
 * 토스 로그인 — 클라이언트(미니앱) appLogin 래퍼.
 * @see https://developers-apps-in-toss.toss.im/login/develop.md (1. 인가 코드 받기)
 *
 * appLogin()은 토스 앱(Apps-in-Toss 웹뷰) 환경에서만 동작하며, 인가 코드만 받아옵니다.
 * 토큰 교환·사용자 조회·복호화는 모두 서버(NextAuth `toss` provider)에서 처리합니다.
 */

export type TossAppLoginResult = {
  authorizationCode: string;
  referrer: string;
};

type FrameworkModule = {
  appLogin?: () => Promise<{
    authorizationCode: string;
    referrer: "DEFAULT" | "SANDBOX";
  }>;
};

async function loadAppsInTossFramework(): Promise<FrameworkModule | null> {
  try {
    // 패키지 미설치 시 번들러가 정적 resolve 하지 않도록 변수 경로 동적 import.
    const modName = "@apps-in-toss/web-framework";
    const dynImport = new Function("m", "return import(m)") as (
      m: string,
    ) => Promise<FrameworkModule>;
    return await dynImport(modName);
  } catch {
    return null;
  }
}

/**
 * 토스 앱 로그인 창을 띄워 인가 코드를 받아옵니다.
 * 토스 앱 환경이 아니거나 SDK 가 없으면 null 을 반환합니다.
 */
export async function requestTossAppLogin(): Promise<TossAppLoginResult | null> {
  const mod = await loadAppsInTossFramework();
  if (!mod?.appLogin) return null;
  const { authorizationCode, referrer } = await mod.appLogin();
  if (!authorizationCode) return null;
  return { authorizationCode, referrer };
}
