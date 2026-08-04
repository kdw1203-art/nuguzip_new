/** middleware 가 심는 배포 ID 쿠키 이름 (운영 점검·/api/health 대조용) */
export const DEPLOY_COOKIE = "wd-deploy";

/** CSP 정책을 바꾸면 이 숫자를 올린다 — middleware 가 낡은 브라우저 캐시를 비운다 */
export const CSP_REVISION = "4";

export const CSP_REV_COOKIE = "wd-csp-rev";

export function currentDeployId(): string | null {
  return process.env.VERCEL_DEPLOYMENT_ID?.trim() || null;
}

/* ── 제거 기록: DEPLOY_SYNC_INLINE_SCRIPT / DEPLOY_RELOAD_PREFIX (2026-08-04) ──
 *
 * 여기에는 "낡은 HTML 을 들고 있는 탭을 감지해 한 번 새로고침한다"는 인라인
 * 스크립트가 있었다. 리스너 누수 전수 점검(#44) 중에 확인한 사실 두 가지:
 *
 *  1. 이 상수를 import 하는 곳이 저장소 어디에도 없었다(소비처 0).
 *  2. 스크립트가 읽는 <html data-deploy-id> / <html data-csp-rev> 속성도
 *     app/layout.tsx 에서 렌더한 적이 없다.
 *
 * 즉 그 동작은 한 번도 실행된 적이 없다. 구현 없이 약속만 있는 코드는 버그다 —
 * 폴링 주기를 30초로 고쳐 봐야 없던 동작이 생기지 않으므로, 죽은 코드를 지우고
 * 실제로 사는 경로만 남긴다.
 *
 * 살아 있는 stale 캐시 대응(서버 측 단독으로 완결):
 *  - middleware 가 CSP_REV_COOKIE 를 비교해 다르면 새로 심고, **그 응답에만**
 *    `Clear-Site-Data: "cache"` 를 실어 낡은 브라우저 캐시를 비운다.
 *  - DEPLOY_COOKIE 와 /api/health 의 deployId·cspRevision 은 운영 점검용으로 유지.
 *
 * 다시 클라이언트 감지가 필요해지면 (a) layout 에서 data-* 속성을 실제로 렌더하고
 * (b) 속성이 없을 때 stale=true 로 보지 않게 고친 뒤에 넣을 것 — 예전 스크립트는
 * 속성이 없으면 stale 로 판정했으므로, 그대로 배선했다면 전 방문자를 한 번씩
 * 새로고침시켰다.
 */
