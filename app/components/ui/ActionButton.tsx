"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * [961] 4상태 실행 버튼 — 인터랙션 라이브러리 v2.0 §02.
 *
 * 기본 → 잉크 번짐(탭, tap-ripple) → 진행(흐린 블루 + 링, 조작 잠금) →
 * 완료(네이비 + 체크가 그려짐) / 실패(주홍 + 좌우 흔들림).
 * 사용자는 문구를 읽기 전에 색으로 결과를 안다.
 *
 * 왜 새 컴포넌트인가: 저장·전송·접수 버튼 20여 곳이 전부 `disabled:opacity-60` 과
 * 문구 교체("저장 중…")만으로 상태를 말하고 있었다 — 디자인 시스템의 "disabled 에
 * opacity 금지" 규칙에도 어긋났고, 성공·실패가 색으로 구분되지 않았다.
 * 호출자는 `state` 만 넘긴다. 문구는 상태별 라벨이 있으면 그것, 없으면 children.
 */
export type ActionState = "idle" | "busy" | "done" | "error";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  state: ActionState;
  children: ReactNode;
  busyLabel?: ReactNode;
  doneLabel?: ReactNode;
  errorLabel?: ReactNode;
  /** 기본 .btn-primary — 크기·모서리는 className 으로 */
  className?: string;
};

export function ActionButton({
  state,
  children,
  busyLabel = "처리 중",
  doneLabel,
  errorLabel,
  className = "",
  disabled,
  type = "button",
  ...rest
}: Props) {
  const stateCls =
    state === "busy" ? "is-busy" : state === "done" ? "is-done" : state === "error" ? "is-error" : "";
  const label =
    state === "busy" ? busyLabel : state === "done" ? (doneLabel ?? children) : state === "error" ? (errorLabel ?? children) : children;
  return (
    <button
      type={type}
      className={`btn-primary tap-ripple inline-flex items-center justify-center gap-2 ${stateCls} ${className}`}
      disabled={disabled || state === "busy" || state === "done"}
      aria-busy={state === "busy" || undefined}
      aria-live="polite"
      {...rest}
    >
      {state === "busy" && <span className="njn-ring" aria-hidden="true" />}
      {state === "done" && (
        <svg
          className="njn-check"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12l6 6L20 6" />
        </svg>
      )}
      <span>{label}</span>
    </button>
  );
}

export default ActionButton;
