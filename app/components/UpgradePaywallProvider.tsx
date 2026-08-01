"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { UpgradePaywall } from "@/app/components/UpgradePaywall";

/**
 * 전역 페이월 — 402 / QUOTA_EXCEEDED / TIER 부족을 한곳에서 띄운다.
 * SoftSignup(401)과 짝: 로그인 벽 vs 플랜 벽.
 */

export type UpgradeIntent = {
  title?: string;
  message: string;
  href?: string;
  ctaLabel?: string;
};

type UpgradePaywallContextValue = {
  promptUpgrade: (intent: UpgradeIntent) => void;
  /**
   * fetch 응답을 보고 402/403(쿼터)·플랜 부족이면 페이월을 띄우고 true.
   * 호출측은 true면 early-return 하면 된다.
   */
  handleUpgradeResponse: (
    status: number,
    body?: { code?: string; error?: string; message?: string } | null,
  ) => boolean;
};

const UpgradePaywallContext = createContext<UpgradePaywallContextValue | null>(null);

const DEFAULT_MESSAGE =
  "이 기능은 현재 플랜 한도를 넘었어요. 구독에서 이어서 쓸 수 있어요.";

export function useUpgradePaywall(): UpgradePaywallContextValue {
  const ctx = useContext(UpgradePaywallContext);
  return (
    ctx ?? {
      promptUpgrade: () => {
        /* Provider 밖 — 조용히 no-op (기능 자체는 호출측 에러 처리에 맡김) */
      },
      handleUpgradeResponse: () => false,
    }
  );
}

export function UpgradePaywallProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<UpgradeIntent | null>(null);

  const promptUpgrade = useCallback((next: UpgradeIntent) => {
    setIntent({
      title: next.title ?? "플랜 업그레이드",
      message: next.message || DEFAULT_MESSAGE,
      href: next.href ?? "/subscription",
      ctaLabel: next.ctaLabel ?? "요금제 보기",
    });
  }, []);

  const handleUpgradeResponse = useCallback(
    (
      status: number,
      body?: { code?: string; error?: string; message?: string } | null,
    ) => {
      const code = body?.code ?? "";
      const quota =
        status === 402 ||
        (status === 403 && (code === "QUOTA_EXCEEDED" || code === "TIER"));
      if (!quota) return false;
      const msg =
        (typeof body?.error === "string" && body.error.trim()) ||
        (typeof body?.message === "string" && body.message.trim()) ||
        DEFAULT_MESSAGE;
      promptUpgrade({
        title: code === "QUOTA_EXCEEDED" ? "이용 한도 도달" : "플랜 업그레이드",
        message: msg,
        ctaLabel: "구독하고 이어서 쓰기",
      });
      return true;
    },
    [promptUpgrade],
  );

  const value = useMemo(
    () => ({ promptUpgrade, handleUpgradeResponse }),
    [promptUpgrade, handleUpgradeResponse],
  );

  return (
    <UpgradePaywallContext.Provider value={value}>
      {children}
      <UpgradePaywall
        open={Boolean(intent)}
        onClose={() => setIntent(null)}
        title={intent?.title}
        message={intent?.message ?? DEFAULT_MESSAGE}
        href={intent?.href}
        ctaLabel={intent?.ctaLabel}
      />
    </UpgradePaywallContext.Provider>
  );
}

export default UpgradePaywallProvider;
