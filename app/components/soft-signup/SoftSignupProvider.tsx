"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useExperiment } from "@/lib/experiments/client";

/**
 * A3 — 비로그인 액션 → 소프트 가입 프롬프트.
 *
 * 지금까지는 401 이 오면 곧바로 `/login` 으로 튕겼다. 사용자 입장에선
 * "관심 담기"를 눌렀는데 갑자기 로그인 화면이라, 뭘 하려다 말았는지 맥락이 끊긴다.
 * 대신 그 자리에서 "이걸 하면 뭐가 좋은지"를 한 줄로 보여주고,
 * 가입/로그인은 선택하게 한다. 닫으면 하던 화면 그대로 남는다.
 *
 * 퍼널 이벤트(`/api/platform/event`)로 노출·전환·이탈을 각각 남겨서
 * 어떤 액션이 가입으로 이어지는지 나중에 실제로 셀 수 있게 한다.
 * ToastProvider 와 같은 규약: Provider 밖에서 호출돼도 no-op 이 아니라
 * 최소한 로그인 페이지로는 보낸다(기능이 조용히 죽는 것보다 낫다).
 */

export type SoftSignupIntent = {
  /** 퍼널 집계용 키. 예: "watchlist_add" */
  action: string;
  /** 모달 제목 — 사용자가 방금 누른 것 기준으로 쓴다. */
  title: string;
  /** 왜 로그인이 필요한지 한 줄. 과장 금지 — 실제로 제공하는 것만. */
  benefit: string;
  /** 로그인 후 돌아올 경로. 생략 시 현재 경로. */
  callbackUrl?: string;
};

type SoftSignupContextValue = {
  promptSignup: (intent: SoftSignupIntent) => void;
};

const SoftSignupContext = createContext<SoftSignupContextValue | null>(null);

function loginHref(callbackUrl: string): string {
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

export function useSoftSignup(): SoftSignupContextValue {
  const ctx = useContext(SoftSignupContext);
  return (
    ctx ?? {
      promptSignup: (intent) => {
        if (typeof window === "undefined") return;
        window.location.href = loginHref(
          intent.callbackUrl ?? window.location.pathname + window.location.search,
        );
      },
    }
  );
}

/* A7 — 이 배너의 CTA 문구가 첫 실험 대상이다(lib/experiments/registry.ts).
   문구만 나뉘고 조건·혜택은 두 변형이 완전히 같다. "가입은 무료" 는 실제 사실이라
   어느 쪽 문구도 없는 이야기를 하지 않는다. */
const EXPERIMENT_KEY = "signup_cta_copy";

const CTA_LABEL: Record<string, string> = {
  control: "가입하고 이어하기",
  free_first: "무료로 가입하고 이어보기",
};

type ExperimentTag = { experimentKey: string; variant: string; anonId: string | null } | null;

function track(eventName: string, metadata: Record<string, unknown>, tag: ExperimentTag) {
  try {
    void fetch("/api/platform/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        source: "client",
        campaign: "funnel",
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
        metadata,
        ...(tag
          ? { experimentKey: tag.experimentKey, variant: tag.variant, anonId: tag.anonId }
          : {}),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 계측 실패가 사용자 흐름을 막지 않는다
  }
}

export function SoftSignupProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<SoftSignupIntent | null>(null);
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  /* 배정은 마운트 직후 끝난다. 이 배너는 사용자가 무언가를 누른 뒤에야 열리므로
     열릴 시점엔 ready 다 — 첫 렌더 깜빡임이 생기지 않는다. */
  const exp = useExperiment(EXPERIMENT_KEY);
  const tag: ExperimentTag = exp.active && exp.ready
    ? { experimentKey: EXPERIMENT_KEY, variant: exp.variant, anonId: exp.anonId }
    : null;
  const tagRef = useRef<ExperimentTag>(tag);
  tagRef.current = tag;

  const ctaLabel = CTA_LABEL[tag?.variant ?? "control"] ?? CTA_LABEL.control;

  const promptSignup = useCallback((next: SoftSignupIntent) => {
    setIntent(next);
    track("soft_signup_prompt_view", { action: next.action }, tagRef.current);
  }, []);

  const dismiss = useCallback(() => {
    setIntent((cur) => {
      if (cur) track("soft_signup_prompt_dismiss", { action: cur.action }, tagRef.current);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!intent) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [intent, dismiss]);

  const callback = intent?.callbackUrl ?? pathname ?? "/";

  return (
    <SoftSignupContext.Provider value={{ promptSignup }}>
      {children}
      {intent && (
        <div
          className="fixed inset-0 z-[190] flex items-end justify-center px-4 pb-[max(env(safe-area-inset-bottom,0px),16px)] sm:items-center sm:pb-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="soft-signup-title"
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={dismiss}
            className="absolute inset-0 h-full w-full cursor-default bg-[rgba(11,20,40,.5)]"
          />
          <div className="relative w-full max-w-[380px] rounded-[18px] bg-surface p-5 shadow-[0_24px_60px_rgba(16,28,54,.3)]">
            <div id="soft-signup-title" className="text-[15px] font-extrabold text-ink">
              {intent.title}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-text-2">{intent.benefit}</p>
            <a
              href={loginHref(callback)}
              onClick={() => {
                track("soft_signup_prompt_click", { action: intent.action }, tagRef.current);
                /* [945 #11] 수락 → 실제 가입 완료 귀속. 가입 화면(/signup)이 이 키를
                   읽어 register 의 source/campaign 으로 보낸다 — "어떤 액션이 가입을
                   만들었나"를 클릭이 아니라 **가입 완료**로 셀 수 있게 된다. */
                try {
                  window.sessionStorage.setItem("nz_signup_via", `soft:${intent.action}`);
                } catch {
                  /* 계측 실패가 흐름을 막지 않는다 */
                }
              }}
              className="btn-primary mt-4 block rounded-xl px-4 py-3 text-center text-[13px] font-bold no-underline"
            >
              {ctaLabel}
            </a>
            <button
              ref={closeRef}
              type="button"
              onClick={dismiss}
              className="mt-2 w-full rounded-xl px-4 py-2.5 text-center text-[13px] font-semibold text-text-3"
            >
              지금은 그냥 둘러볼게요
            </button>
            <p className="mt-2 text-center text-[12px] text-text-3">
              가입은 무료이고, 지금 보던 화면으로 돌아옵니다.
            </p>
          </div>
        </div>
      )}
    </SoftSignupContext.Provider>
  );
}

export default SoftSignupProvider;
