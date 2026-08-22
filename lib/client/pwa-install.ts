"use client";

/**
 * 설치(홈 화면 추가) 안내 공통 로직.
 *
 * Chromium 계열용 배너(InstallPrompt)와 iOS Safari 용 안내(IosInstallHint)가
 * 같은 판정을 두 벌 들고 있으면 한쪽만 고쳐져 어긋난다 — "이미 설치했는지",
 * "닫은 지 얼마나 됐는지", "탭바 위 어디에 띄울지"는 한 곳에서 판단한다.
 */

/** 닫으면 다시 안 띄우는 기간 */
export const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

/** 탭바가 없는 화면(로그인 등)에서 쓸 기본 위치 */
export const FALLBACK_BOTTOM = "max(16px, env(safe-area-inset-bottom, 0px))";

const GAP_ABOVE_TABBAR = 12;

/** 이미 앱으로 실행 중인가 — 설치한 사람에게 설치를 권하지 않기 위한 확인 */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    /* iOS 는 display-mode 대신 비표준 navigator.standalone 을 쓴다 */
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function dismissedRecently(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch {
    /* 사파리 프라이빗 모드 등 localStorage 차단 환경 — 기억 못 할 뿐 동작은 한다 */
    return false;
  }
}

export function rememberDismiss(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* noop */
  }
}

/**
 * 쿠키 동의가 아직 미결정이면 하단이 배너 두 층이 된다 — 그 사이엔 띄우지 않는다.
 *
 * 판정은 use-cookie-consent 와 **같은 기준**이어야 한다. 예전 구현은 키가 있기만
 * 하면 "결정됨"으로 봤는데, 그 훅은 `analytics` 가 boolean 이 아니면 미결정으로
 * 되돌린다(구버전·손상된 값). 두 판정이 갈리면 동의 배너가 떠 있는데 설치 배너도
 * 같이 떠서 하단이 두 층이 된다 — 이 가드가 막으려던 바로 그 상태다.
 */
export function cookieConsentDecided(): boolean {
  try {
    const raw = window.localStorage.getItem("nz_cookie_consent");
    if (!raw) return false;
    const v = JSON.parse(raw) as { analytics?: unknown };
    return typeof v.analytics === "boolean";
  } catch {
    /* 저장소 접근 불가·JSON 파싱 실패 — 겹침 판정을 못 하면 띄우지 않는 쪽이 안전 */
    return false;
  }
}

/**
 * 탭바 높이를 상수로 박지 않고 실제로 잰다.
 * 탭바는 PageShell 을 쓰는 화면에만 있고, 안쪽 ＋ 버튼이 위로 튀어나와 있어
 * 높이가 눈대중과 다르다. 숫자를 박으면 탭바 디자인이 바뀔 때 배너만 조용히 겹친다.
 */
export function bottomAboveTabBar(): string {
  if (typeof document === "undefined") return FALLBACK_BOTTOM;
  const tabbar = document.querySelector('nav[aria-label="하단 내비게이션"]');
  const rect = tabbar?.getBoundingClientRect();
  if (!rect || rect.height === 0) return FALLBACK_BOTTOM;
  return `${Math.round(window.innerHeight - rect.top + GAP_ABOVE_TABBAR)}px`;
}

/**
 * [개선 #14, 2026-08-22] 설치를 권해도 되는 만큼 친해졌는가.
 *
 * 30일 실측: 프롬프트 노출 243회에 수락은 극소수, 명시적 거절 40회 — 첫 방문
 * 즉시 띄우는 설치 권유는 신뢰가 쌓이기 전의 요구라 거절만 학습시키고 있었다.
 * 방문 "일수"를 세어(같은 날 재방문은 1회) **3일째 방문부터** 띄운다.
 * localStorage 차단 환경은 셀 수 없으므로 종전대로 즉시 허용(기능 보존).
 */
const VISIT_DAYS_KEY = "nuguzip:visit-days";

export function recordVisitDay(): void {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(VISIT_DAYS_KEY);
    const days: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!Array.isArray(days)) throw new Error("corrupt");
    if (!days.includes(today)) {
      days.push(today);
      // 판정에는 3개면 충분 — 무한히 쌓지 않는다
      localStorage.setItem(VISIT_DAYS_KEY, JSON.stringify(days.slice(-10)));
    }
  } catch {
    /* noop */
  }
}

export function engagedEnoughForInstall(): boolean {
  try {
    const raw = localStorage.getItem(VISIT_DAYS_KEY);
    if (!raw) return false;
    const days = JSON.parse(raw) as string[];
    return Array.isArray(days) && days.length >= 3;
  } catch {
    /* 셀 수 없으면 종전 동작(즉시 허용) — 가드가 기능을 죽이면 안 된다 */
    return true;
  }
}

/** 설치 흐름 계측 — 실패해도 흐름을 막지 않는다 */
export function trackPwa(eventName: string, metadata: Record<string, unknown> = {}) {
  try {
    void fetch("/api/platform/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        source: "client",
        campaign: "pwa",
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
        metadata,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* noop */
  }
}
