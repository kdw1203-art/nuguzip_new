"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * G9 — PWA 설치 프롬프트
 *
 * 브라우저가 "이 사이트는 설치 가능하다" 고 **먼저 알려줄 때만** 배너를 띄운다.
 * 그 신호가 `beforeinstallprompt` 다. 이 이벤트는 manifest 가 유효하고, fetch 핸들러가
 * 있는 서비스워커가 등록돼 있고, HTTPS 이고, 브라우저 자체 참여도 기준을 넘겼을 때만
 * 발생한다. 즉 "설치할 수 있다" 는 우리 추측이 아니라 브라우저의 판정이다.
 *
 * 그래서 UA 문자열로 기기를 찍어 맞히지 않는다. UA 스니핑은 (1) 설치 못 하는 환경에
 * 설치 버튼을 띄우고 (2) 새 브라우저가 나올 때마다 틀린다. 이벤트가 안 오면 안 띄운다 —
 * 못 띄우는 게 아니라 띄우면 안 되는 상황이라고 본다.
 *
 * ⚠️ 알려진 미구현: iOS Safari
 *   iOS 사파리는 `beforeinstallprompt` 를 구현하지 않는다(웹 표준이 아니라 Chromium
 *   확장 API 다). 홈 화면 추가는 공유 시트를 직접 여는 수동 경로뿐이고, 웹에서
 *   프로그램적으로 띄울 방법이 없다. 그래서 iOS 에서는 이 배너가 절대 안 뜬다.
 *
 *   "공유 → 홈 화면에 추가" 안내 UI 를 UA 로 판별해 넣는 방법이 흔히 쓰이지만 여기선
 *   넣지 않았다. iOS 실기기가 없어 검증할 수 없고, 검증 못 한 안내는 사파리 버전에 따라
 *   메뉴 위치·명칭이 달라 틀린 설명이 된다. 없는 안내보다 틀린 안내가 나쁘다.
 *   → iOS 안내가 필요하면 실기기 확인 후 별도로 추가할 것. 지금은 미구현이 사실이다.
 */

/** Chromium 전용 이벤트라 lib.dom 타입에 없다. 필요한 두 멤버만 좁혀서 선언한다. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/**
 * 닫으면 30일간 다시 안 띄운다.
 * 이벤트는 페이지를 열 때마다 다시 발생하므로, 기억하지 않으면 닫아도 다음 방문에
 * 또 뜬다 — 그건 설치 유도가 아니라 그냥 방해다.
 */
const DISMISS_KEY = "nuguzip:pwa-install-dismissed-at";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

/** 하단 탭바가 있는 화면에서는 그 위로 띄운다. 탭바가 없는 화면(로그인 등)은 기본 여백. */
const FALLBACK_BOTTOM = "max(16px, env(safe-area-inset-bottom, 0px))";
const GAP_ABOVE_TABBAR = 12;

function track(eventName: string, metadata: Record<string, unknown> = {}) {
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
    /* 계측 실패가 설치 흐름을 막지 않는다 */
  }
}

/** 이미 앱으로 실행 중인가. 설치된 사람에게 설치를 권하지 않기 위한 확인. */
function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    /* iOS 는 display-mode 대신 비표준 navigator.standalone 을 쓴다 */
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch {
    /* 사파리 프라이빗 모드 등 localStorage 차단 환경 — 기억 못 할 뿐 동작은 한다 */
    return false;
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* noop */
  }
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [bottom, setBottom] = useState(FALLBACK_BOTTOM);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  /* 화면 전체를 덮는 모달이 열려 있는 동안에는 배너를 내린다.
     2026-07-28: 홈의 클로즈 베타 안내 모달이 이 배너 위를 덮으면서 "추가하기"가
     보이는데 눌리지 않는 상태가 됐다(E2E 가 pointer interception 으로 잡음).
     보이지만 못 누르는 컨트롤은 없는 것보다 나쁘다 — 모달이 닫히면 다시 뜬다.
     표식은 ui/Modal 이 body 에 남긴다(data-modal-open). */
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    const read = () => setModalOpen(document.body.dataset.modalOpen != null);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-modal-open"] });
    return () => observer.disconnect();
  }, []);

  /**
   * 탭바 높이를 상수로 박지 않고 실제로 잰다.
   * 탭바는 PageShell 을 쓰는 화면에만 있고(로그인 등은 없다), 안쪽 + 버튼이 위로
   * 튀어나와 있어 높이가 눈대중과 다르다. 숫자를 박으면 탭바 디자인이 바뀔 때
   * 배너만 조용히 겹친다.
   */
  const measure = useCallback(() => {
    const tabbar = document.querySelector('nav[aria-label="하단 내비게이션"]');
    const rect = tabbar?.getBoundingClientRect();
    if (!rect || rect.height === 0) {
      setBottom(FALLBACK_BOTTOM);
      return;
    }
    setBottom(`${Math.round(window.innerHeight - rect.top + GAP_ABOVE_TABBAR)}px`);
  }, []);

  useEffect(() => {
    if (isInstalled()) return;

    const onBeforeInstallPrompt = (e: Event) => {
      /* 기본 동작(브라우저 자체 미니 인포바)을 막고 이벤트를 쥐고 있는다.
         쥐고 있지 않으면 나중에 prompt() 를 호출할 방법이 없다. */
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      if (dismissedRecently()) return;
      measure();
      setVisible(true);
      track("pwa_install_prompt_view");
    };

    const onInstalled = () => {
      /* 배너를 거치지 않고 브라우저 메뉴로 설치했을 수도 있다. 어느 쪽이든 즉시 치운다. */
      deferredRef.current = null;
      setVisible(false);
      track("pwa_installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [measure]);

  useEffect(() => {
    if (!visible) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [visible, measure]);

  const dismiss = useCallback(() => {
    setVisible(false);
    rememberDismiss();
    track("pwa_install_prompt_dismiss");
  }, []);

  const install = useCallback(async () => {
    const deferred = deferredRef.current;
    if (!deferred) {
      setVisible(false);
      return;
    }
    /* 브라우저 설치 다이얼로그가 뜨는 동안 배너가 뒤에 남아 있을 이유가 없다 */
    setVisible(false);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      track("pwa_install_prompt_result", { outcome: choice.outcome });
      /* 여기서 취소했다는 건 "지금은 됐다" 는 뜻이므로 닫기와 같이 취급한다 */
      if (choice.outcome === "dismissed") rememberDismiss();
    } catch {
      /* 이미 소비된 이벤트를 다시 prompt() 하면 예외가 난다. 조용히 넘긴다. */
    } finally {
      /* beforeinstallprompt 이벤트는 1회용이다 — 재사용하면 반드시 실패한다 */
      deferredRef.current = null;
    }
  }, []);

  if (!visible || modalOpen) return null;

  return (
    <div
      role="region"
      aria-label="앱 설치 안내"
      /* z-50 은 탭바, z-[190] 은 소프트 가입 모달이다. 그 사이에 둔다 —
         탭바는 가려도 되지만 모달을 가리면 안 된다.
       *
       * 가로 정렬을 `left-1/2 -translate-x-1/2` 가 아니라 `inset-x-0 mx-auto` 로 한다.
       * 이 사이트의 진입 애니메이션 `.rise-in` 은 keyframes 에서 transform 을 쓰고
       * fill-mode 가 both 라, 같은 요소에 걸면 Tailwind 의 -translate-x-1/2 을
       * **덮어쓴 채로 끝난다**(애니메이션 종료 후에도 마지막 키프레임 값이 남는다).
       * 처음에 .rise-in 을 붙였다가 실제로 두 가지가 동시에 깨졌다:
       *   - 세로: translateY(18px) 잔상 때문에 탭바와 6px 겹침
       *   - 가로: -translate-x-1/2 이 사라져 왼쪽 끝이 화면 중앙에 박힘
       * transform 을 안 쓰는 정렬로 바꾸면 애니메이션과 충돌할 여지 자체가 없다.
       * 등장 효과는 opacity 만 건드리는 .fade-in 으로 대체했다. */
      className="fade-in fixed inset-x-0 z-[60] mx-auto w-[min(420px,calc(100%-28px))] rounded-[20px] border border-line bg-surface p-4 shadow-[0_16px_40px_rgba(15,23,42,.18)]"
      style={{ bottom }}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-[18px] leading-none"
        >
          🏠
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-extrabold text-ink">누구집을 홈 화면에 추가</div>
          <p className="mt-1 text-[12px] leading-relaxed text-text-2">
            앱처럼 바로 열 수 있고, 저장한 임장노트는 오프라인에서도 다시 볼 수 있습니다.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="min-h-[44px] flex-1 rounded-xl border border-line bg-surface px-4 text-[13px] font-semibold text-text-2"
        >
          나중에
        </button>
        <button
          type="button"
          onClick={install}
          className="btn-primary press min-h-[44px] flex-1 rounded-xl px-4 text-[13px] font-bold"
        >
          추가하기
        </button>
      </div>
    </div>
  );
}
