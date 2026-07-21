"use client";

import { useState } from "react";
import { Icon } from "@/app/components/Icon";

/**
 * 초대 공유 버튼 3종 — 카카오톡 · 링크복사 · 문자.
 *
 * - 카카오톡: Kakao JS SDK 가 전역에 초기화돼 있으면 Share.sendDefault,
 *   없으면 Web Share(navigator.share) → 그래도 안 되면 링크 복사 폴백.
 * - 링크복사: navigator.clipboard(+ textarea 폴백).
 * - 문자:    sms: 스킴 앵커 — 모바일 메시지 앱을 본문 채워 연다.
 *
 * 네이티브 alert 은 쓰지 않고 인라인 토스트로만 알린다.
 */

type KakaoShareLike = {
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

  async function shareKakao() {
    const kakao = getKakao();
    // 1) Kakao SDK 가 초기화돼 있으면 정식 공유
    if (kakao?.Share?.sendDefault && kakao.isInitialized?.()) {
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
    // 2) Web Share (모바일 공유 시트에서 카카오톡 선택 가능)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "누구집 친구 초대", text: message, url: link });
        return;
      } catch {
        // 사용자가 취소했을 수 있음 → 조용히 종료
        return;
      }
    }
    // 3) 폴백: 링크 복사 후 안내
    if (await copyText(link)) flash("링크를 복사했어요 · 카카오톡에 붙여넣어 보내세요");
  }

  async function copyLink() {
    if (await copyText(link)) flash("초대 링크를 복사했어요");
  }

  const smsHref = `sms:?body=${encodeURIComponent(message)}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => void shareKakao()}
          className="press flex flex-col items-center justify-center gap-1.5 rounded-[14px] bg-[#FEE500] px-2 py-3 text-[#191600]"
        >
          <Icon name="messages-square" size={20} />
          <span className="text-[12px] font-bold">카카오톡</span>
        </button>

        <button
          type="button"
          onClick={() => void copyLink()}
          className="press flex flex-col items-center justify-center gap-1.5 rounded-[14px] bg-primary-soft px-2 py-3 text-primary"
        >
          <Icon name="link" size={20} />
          <span className="text-[12px] font-bold">링크복사</span>
        </button>

        <a
          href={smsHref}
          className="press flex flex-col items-center justify-center gap-1.5 rounded-[14px] bg-surface px-2 py-3 text-text-1 no-underline"
          style={{ border: "1px solid var(--border)" }}
        >
          <Icon name="phone" size={20} />
          <span className="text-[12px] font-bold">문자</span>
        </a>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-text-3" aria-live="polite">
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
