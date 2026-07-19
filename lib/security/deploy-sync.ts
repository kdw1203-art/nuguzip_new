/** middleware·클라이언트가 공유하는 배포 ID 쿠키 이름 */
export const DEPLOY_COOKIE = "wd-deploy";

/** CSP 정책 변경 시 숫자를 올리면 stale HTML 탭이 자동 새로고침됩니다 */
export const CSP_REVISION = "4";

export const CSP_REV_COOKIE = "wd-csp-rev";

export const DEPLOY_RELOAD_PREFIX = "wd-reloaded-";

export function currentDeployId(): string | null {
  return process.env.VERCEL_DEPLOYMENT_ID?.trim() || null;
}

/**
 * SPA·SW·bfcache로 예전 HTML(CSP 포함)을 들고 있을 때 감지·한 번 새로고침.
 * data-deploy-id / data-csp-rev 가 없거나 쿠키·health 와 다르면 reload.
 */
export const DEPLOY_SYNC_INLINE_SCRIPT = `(function(){try{var COOKIE=${JSON.stringify(DEPLOY_COOKIE)};var CSP_COOKIE=${JSON.stringify(CSP_REV_COOKIE)};var CSP_REV=${JSON.stringify(CSP_REVISION)};var RELOAD_PREFIX=${JSON.stringify(DEPLOY_RELOAD_PREFIX)};function readCookie(n){var m=document.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)"));return m?decodeURIComponent(m[1]):""}function reloadKey(live,cspRev){return(live||"x")+"-"+(cspRev||CSP_REV)}function alreadyReloaded(key){return sessionStorage.getItem(RELOAD_PREFIX+key)}function doReload(key){sessionStorage.setItem(RELOAD_PREFIX+key,"1");location.replace(location.href.split("#")[0])}function stale(live,cspRev){var htmlDeploy=document.documentElement.getAttribute("data-deploy-id");var htmlCsp=document.documentElement.getAttribute("data-csp-rev");if(!htmlDeploy||!htmlCsp)return true;if(htmlDeploy==="local")return false;if(live&&htmlDeploy!==live)return true;if(cspRev&&htmlCsp!==cspRev)return true;return false}function check(live,cspRev){var key=reloadKey(live,cspRev);if(!stale(live,cspRev)||alreadyReloaded(key))return;doReload(key)}function maybeReload(){var live=readCookie(COOKIE);var cspRev=readCookie(CSP_COOKIE)||CSP_REV;if(live){check(live,cspRev);return}fetch("/api/health",{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(d){if(!d)return;check(d.deployId?String(d.deployId).trim():"",d.cspRevision?String(d.cspRevision):"")}).catch(function(){})}maybeReload();document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")maybeReload()});window.addEventListener("pageshow",function(e){if(e.persisted)maybeReload()});setInterval(maybeReload,3000)}catch(e){}})();`;
