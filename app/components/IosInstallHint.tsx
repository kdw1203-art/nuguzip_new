"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FALLBACK_BOTTOM,
  bottomAboveTabBar,
  cookieConsentDecided,
  dismissedRecently,
  isInstalled,
  rememberDismiss,
  trackPwa,
} from "@/lib/client/pwa-install";

/**
 * iOS Safari 전용 "홈 화면에 추가" 안내 (2026-08-04, 소유자 요청).
 *
 * 왜 만드는가 — 아이폰 사파리에서는 주소창(위)과 도구막대(아래)가 화면의
 * 상당 부분을 계속 차지한다. 웹 페이지가 그 막대를 지우는 방법은 없다.
 * 실제로 사라지는 경로는 **홈 화면에 추가**뿐이다(그때는 manifest 의
 * `display: standalone` 으로 열려 브라우저 UI 가 통째로 빠진다).
 * 그 경로를 아무도 알려주지 않으면 없는 기능이나 같다.
 *
 * InstallPrompt(=Chromium `beforeinstallprompt`) 는 iOS 에서 절대 뜨지 않는다.
 * iOS 사파리는 그 이벤트를 구현하지 않고, 공유 시트를 코드로 열 방법도 없다.
 * 그래서 여기서는 버튼이 아니라 **안내**만 한다 — 누르면 설치되는 척하지 않는다.
 *
 * UA 판정을 쓰는 이유와 그 위험을 줄이는 방법:
 *  - iOS 에는 "설치 가능"을 알려 주는 신호가 없어 UA 말고는 근거가 없다.
 *  - 대신 조건을 좁힌다. iOS + Safari 이면서, "홈 화면에 추가"가 **없는**
 *    인앱 브라우저(카카오톡·네이버·인스타 등)와 다른 브라우저(Chrome·Firefox·
 *    Edge iOS)는 제외한다. 없는 메뉴를 찾게 만드는 안내가 안 하느니만 못하다.
 *  - 판정이 틀려도 손해가 작도록 안내는 닫을 수 있고, 닫으면 30일간 안 뜬다.
 */

const DISMISS_KEY = "nuguzip:ios-a2hs-dismissed-at";
/** 첫 화면부터 안내로 가리지 않는다 — 두 번째 방문(문서 로드)부터 */
const VISIT_KEY = "nuguzip:visits";
const MIN_VISITS = 2;

/* 베타 안내 모달이 아직 안 끝났으면 순서를 양보한다.
   실측(로컬 프로덕션, iPhone 13 UA): 안내가 600ms 에 떴다가 900ms 에 열리는
   베타 모달 때문에 사라졌다 — 깜빡였다 사라지는 안내는 읽히지 않는다.
   베타 공지는 첫 방문 1회성이고 이 안내는 다음 방문에 다시 뜰 수 있으므로,
   기다리는 쪽은 이쪽이다. (키·기간은 BetaNoticeModal 과 같은 값) */
const BETA_NOTICE_KEY = "nuguzip:beta-notice-v1";
const BETA_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

function betaNoticePending(): boolean {
  try {
    const raw = localStorage.getItem(BETA_NOTICE_KEY);
    if (!raw) return true;
    const at = Date.parse(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at >= BETA_DISMISS_MS;
  } catch {
    /* 저장소를 못 읽으면 베타 모달도 뜨는 쪽을 택한다 — 겹치지 않게 이쪽이 물러난다 */
    return true;
  }
}

/** 홈 화면 추가 메뉴가 **없는** 인앱 웹뷰들 — 여기서 안내하면 틀린 설명이 된다 */
const IN_APP = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|Snapchat|Threads/i;
/** iOS 의 다른 브라우저 — 공유 시트 구성이 사파리와 달라 같은 안내를 쓸 수 없다 */
const OTHER_IOS_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|Whale|SamsungBrowser/i;

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  /* iPadOS 13+ 는 스스로를 Macintosh 라고 말한다 — 터치 지원으로 가려낸다 */
  const isIos =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  if (IN_APP.test(ua) || OTHER_IOS_BROWSER.test(ua)) return false;
  return /Safari/.test(ua);
}

/** 문서 로드 횟수를 세어 돌려준다(저장소가 막혀 있으면 0 — 그러면 안 띄운다) */
function bumpVisits(): number {
  try {
    const next = Number(localStorage.getItem(VISIT_KEY) ?? "0") + 1;
    localStorage.setItem(VISIT_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

export function IosInstallHint() {
  const [visible, setVisible] = useState(false);
  const [bottom, setBottom] = useState(FALLBACK_BOTTOM);
  /* 전체 화면 모달이 열려 있는 동안에는 내린다(InstallPrompt 와 같은 이유 —
     보이는데 눌리지 않는 컨트롤은 없는 것보다 나쁘다). */
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const read = () => setModalOpen(document.body.dataset.modalOpen != null);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-modal-open"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isInstalled()) return;
    if (!isIosSafari()) return;
    /* 방문 수는 다른 조건보다 **먼저** 센다. 뒤에서 세면 베타 모달이 떠 있는
       동안의 방문이 한 번도 집계되지 않아, 모달을 닫은 뒤 다시 두 번을 채워야
       안내가 뜬다(= 사실상 안 뜬다). */
    const visits = bumpVisits();
    if (!cookieConsentDecided()) return;
    if (dismissedRecently(DISMISS_KEY)) return;
    if (betaNoticePending()) return;
    if (visits < MIN_VISITS) return;

    setBottom(bottomAboveTabBar());
    setVisible(true);
    trackPwa("pwa_ios_hint_view");
  }, []);

  const measure = useCallback(() => setBottom(bottomAboveTabBar()), []);
  useEffect(() => {
    if (!visible) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [visible, measure]);

  const dismiss = useCallback(() => {
    setVisible(false);
    rememberDismiss(DISMISS_KEY);
    trackPwa("pwa_ios_hint_dismiss");
  }, []);

  if (!visible || modalOpen) return null;

  return (
    <div
      role="region"
      aria-label="홈 화면에 추가 안내"
      /* z-50 은 탭바, z-[190] 은 소프트 가입 모달 — 그 사이(InstallPrompt 와 동일).
         정렬에 transform 을 쓰지 않는다(.fade-in 과 충돌 방지, InstallPrompt 주석 참고). */
      className="fade-in fixed inset-x-0 z-[60] mx-auto w-[min(420px,calc(100%-28px))] rounded-[18px] border border-line bg-surface p-4 shadow-[0_16px_40px_rgba(15,23,42,.18)]"
      style={{ bottom }}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary"
        >
          {/* iOS 공유 아이콘(위로 향한 화살표 + 상자) — 찾아야 할 버튼과 같은 모양 */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 15V3" />
            <path d="m8 7 4-4 4 4" />
            <path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold text-ink">주소창 없이 앱처럼 쓰기</div>
          <p className="mt-1 text-[12px] leading-relaxed text-text-2">
            사파리 <span className="font-semibold text-text-1">공유</span> 버튼을 누르고 목록에서{" "}
            <span className="font-semibold text-text-1">홈 화면에 추가</span>를 선택하세요. 위아래
            브라우저 막대가 사라져 화면을 더 넓게 씁니다.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="min-h-[44px] flex-1 rounded-xl border border-line bg-surface px-4 text-[13px] font-semibold text-text-2"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

export default IosInstallHint;
