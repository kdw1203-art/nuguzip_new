"use client";

import { useState } from "react";
import { Icon } from "@/app/components/Icon";

/**
 * 초대 공유 버튼 3종 — (카카오톡 | 공유) · 링크복사 · 문자.
 *
 * - 링크복사: navigator.clipboard(+ textarea 폴백).
 * - 문자:    sms: 스킴 앵커 — 모바일 메시지 앱을 본문 채워 연다.
 *
 * 첫 번째 버튼이 이 파일의 요점이다. 2026-07-28 이전에는 **항상** 카카오 노란색에
 * "카카오톡" 이라고 적힌 버튼이었는데, 정작 Kakao JS SDK 를 불러오는 코드가
 * 저장소 어디에도 없었다. 그래서 `window.Kakao` 는 언제나 undefined 였고 카카오
 * 분기는 실행될 수 없는 죽은 코드였다 — 실제로는 OS 공유 시트가 뜨거나 링크가
 * 복사됐다. 버튼은 카카오톡으로 바로 보내겠다고 말하고 있었는데 그 경로는 없었다.
 *
 * 지금은 둘 중 하나다:
 *  - JS 키가 있으면 → 누를 때 SDK 를 그 자리에서 받아 초기화하고 진짜 카카오 공유.
 *    (미리 받지 않는다. 안 누르는 사람에게 SDK 값을 물릴 이유가 없다.)
 *  - 키가 없으면  → 카카오라고 말하지 않는다. 이름도 색도 "공유" 로 둔다.
 *
 * 네이티브 alert 은 쓰지 않고 인라인 토스트로만 알린다.
 */

/* NEXT_PUBLIC_* 은 빌드 시점에 문자열로 치환된다. 그래서 이 값은 **배포된 번들이
   어떤 상태인지** 를 그대로 말해 준다 — 런타임에 바뀌지 않는다는 뜻이기도 하다. */
const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

const KAKAO_SDK_SRC = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";

type KakaoShareLike = {
  init?: (key: string) => void;
  isInitialized?: () => boolean;
  Share?: {
    sendDefault?: (settings: unknown) => void;
  };
};

function getKakao(): KakaoShareLike | null {
  if (typeof window === "undefined") return null;
  const k = (window as unknown as { Kakao?: KakaoShareLike }).Kakao;
  return k ?? null;
}

/** SDK 를 한 번만 받아 초기화한다. 실패하면 null — 호출부가 폴백을 탄다. */
let kakaoSdk: Promise<KakaoShareLike | null> | null = null;

function loadKakaoSdk(): Promise<KakaoShareLike | null> {
  if (kakaoSdk) return kakaoSdk;
  kakaoSdk = new Promise<KakaoShareLike | null>((resolve) => {
    if (!KAKAO_JS_KEY || typeof document === "undefined") return resolve(null);

    const ready = (): KakaoShareLike | null => {
      const k = getKakao();
      if (!k) return null;
      try {
        if (!k.isInitialized?.()) k.init?.(KAKAO_JS_KEY);
      } catch {
        return null;
      }
      return k.isInitialized?.() ? k : null;
    };

    const already = getKakao();
    if (already) return resolve(ready());

    const script = document.createElement("script");
    script.src = KAKAO_SDK_SRC;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(ready());
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  }).catch(() => null);
  return kakaoSdk;
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

export function ShareRow({ link, code }: { link: string; code: string }) {
  const [toast, setToast] = useState<string | null>(null);

  const message = `누구집에서 함께 부동산 봐요! 이 링크로 가입하면 나랑 친구 둘 다 300P를 받아요.\n${link}`;

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  async function share() {
    // 1) JS 키가 있는 배포에서만 — SDK 를 받아 정식 카카오 공유
    if (KAKAO_JS_KEY) {
      const kakao = await loadKakaoSdk();
      if (kakao?.Share?.sendDefault) {
        try {
          kakao.Share.sendDefault({
            objectType: "text",
            text: message,
            link: { webUrl: link, mobileWebUrl: link },
          });
          return;
        } catch {
          /* SDK 호출 실패 → 아래 폴백 */
        }
      }
    }
    // 2) Web Share (모바일 공유 시트)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "누구집 친구 초대", text: message, url: link });
        return;
      } catch {
        // 사용자가 취소했을 수 있음 → 조용히 종료
        return;
      }
    }
    // 3) 폴백: 링크 복사 후 안내 — 어디에 붙여넣으라고 할지는 상황에 맞게
    if (await copyText(link)) {
      flash(
        KAKAO_JS_KEY
          ? "링크를 복사했어요 · 카카오톡에 붙여넣어 보내세요"
          : "초대 링크를 복사했어요 · 원하는 곳에 붙여넣어 보내세요",
      );
    }
  }

  async function copyLink() {
    if (await copyText(link)) flash("초대 링크를 복사했어요");
  }

  const smsHref = `sms:?body=${encodeURIComponent(message)}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {/* 카카오 브랜드 색·이름은 **정말 카카오로 보낼 때만** 쓴다. */}
        <button
          type="button"
          onClick={() => void share()}
          className={`press flex flex-col items-center justify-center gap-1.5 rounded-[14px] px-2 py-3 ${
            KAKAO_JS_KEY
              ? "bg-[#FEE500] text-[#191600]"
              : "bg-surface text-text-1 [border:1px_solid_var(--border)]"
          }`}
        >
          <Icon name={KAKAO_JS_KEY ? "messages-square" : "share"} size={20} />
          <span className="t-sub font-bold">{KAKAO_JS_KEY ? "카카오톡" : "공유"}</span>
        </button>

        <button
          type="button"
          onClick={() => void copyLink()}
          className="press flex flex-col items-center justify-center gap-1.5 rounded-[14px] bg-primary-soft px-2 py-3 text-primary"
        >
          <Icon name="link" size={20} />
          <span className="t-sub font-bold">링크복사</span>
        </button>

        <a
          href={smsHref}
          className="press flex flex-col items-center justify-center gap-1.5 rounded-[14px] bg-surface px-2 py-3 text-text-1 no-underline"
          style={{ border: "1px solid var(--border)" }}
        >
          <Icon name="phone" size={20} />
          <span className="t-sub font-bold">문자</span>
        </a>
      </div>

      <div className="flex items-center gap-1.5 t-sub text-text-3" aria-live="polite">
        {toast ? (
          <>
            <Icon name="check" size={13} className="text-primary" />
            <span className="text-primary">{toast}</span>
          </>
        ) : (
          <span>
            내 코드 <span className="font-bold text-text-2">{code}</span> 로도 초대할 수
            있어요
          </span>
        )}
      </div>
    </div>
  );
}

export default ShareRow;
