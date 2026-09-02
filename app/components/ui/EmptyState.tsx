import { Icon } from "@/app/components/Icon";
import { Button } from "./Button";

/** 라이트(공개 화면) / 어드민(다크 셸) 두 표면. 어드민은 `.dark` 클래스에 의존하지 않고
 *  관리자 셸(bg-[#12161f]) 위에서 직접 성립하도록 고정 색을 씁니다. */
export type StateTone = "light" | "admin";

export type EmptyStateAction = {
  label: string;
  href: string;
};

export type EmptyStateProps = {
  icon?: string;
  title: string;
  desc?: string;
  action?: EmptyStateAction;
  tone?: StateTone;
  className?: string;
};

const SHELL: Record<StateTone, string> = {
  light: "card",
  admin:
    "rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)]",
};

const PAD: Record<StateTone, string> = {
  light: "p-[var(--pad-card)]",
  admin: "px-4 py-6",
};

const TITLE: Record<StateTone, string> = {
  light: "text-[15px] font-bold text-ink",
  admin: "text-[13px] font-bold text-white",
};

const DESC: Record<StateTone, string> = {
  light: "text-[13px] leading-[1.6] text-text-3",
  admin: "text-[11px] leading-[1.6] text-[#9aa6b8]",
};

const ICON_WRAP: Record<StateTone, string> = {
  light: "bg-primary-soft text-primary",
  admin: "bg-[rgba(126,162,255,.15)] text-ai-accent",
};

const ERROR_ICON_WRAP: Record<StateTone, string> = {
  light: "bg-danger-soft text-danger",
  admin: "bg-[rgba(248,113,113,.14)] text-ai-danger",
};

const CAUSE: Record<StateTone, string> = {
  light:
    "rounded-lg bg-bg px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] text-text-3",
  admin:
    "rounded-lg bg-[rgba(255,255,255,.05)] px-2.5 py-1.5 font-mono text-[10px] leading-[1.5] text-[#9aa6b8]",
};

const ADMIN_LINK =
  "press inline-flex items-center justify-center rounded-[10px] bg-[rgba(126,162,255,.15)] px-3.5 py-[7px] text-[11px] font-extrabold text-ai-accent no-underline";

function ActionButton({ action, tone }: { action: EmptyStateAction; tone: StateTone }) {
  if (tone === "admin") {
    return (
      <a href={action.href} className={`${ADMIN_LINK} mt-1`}>
        {action.label}
      </a>
    );
  }
  return (
    <Button href={action.href} variant="primary" size="sm" className="mt-1">
      {action.label}
    </Button>
  );
}

/**
 * 데이터가 "없는" 상태 — 조회는 성공했고 결과가 0건일 때만 씁니다.
 * 조회가 실패했을 때 이걸 쓰면 "없다"는 거짓말이 되므로 ErrorState 를 쓰세요.
 */
export function EmptyState({
  icon,
  title,
  desc,
  action,
  tone = "light",
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`${SHELL[tone]} ${PAD[tone]} flex flex-col items-center gap-2 text-center ${className}`.trim()}
      /* [946 리브랜딩 · 모션 07] 공개 화면의 빈 상태 = 한지 + 숨쉬는 온점.
         비어 있음이 초라함이 아니라 기다림이 되게 — 신규 사용자가 가장 먼저
         마주치는 화면이 브랜드의 첫 화면이다. 어드민 톤은 기존 유지. */
      style={tone === "light" ? { background: "var(--brand-hanji)", border: "none" } : undefined}
    >
      {tone === "light" ? (
        /* 온점만 숨쉰다(2.4s) — 심볼 전체를 흔들면 장식이 소음이 된다 */
        <svg width="44" height="40" viewBox="0 0 120 120" aria-hidden="true">
          <path
            d="M52 28 L68 28"
            fill="none"
            stroke="var(--brand-symbol-ink)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M14 46 C 38 64, 82 64, 106 46"
            fill="none"
            stroke="var(--brand-symbol-ink)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle
            className="empty-dot-breathe"
            cx="60"
            cy="86"
            r="8.5"
            fill="var(--brand-dot)"
            style={{ transformOrigin: "60px 86px" }}
          />
        </svg>
      ) : (
        icon && (
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${ICON_WRAP[tone]}`}
          >
            <Icon name={icon} size={22} />
          </div>
        )
      )}
      <p className={TITLE[tone]}>{title}</p>
      {desc && <p className={DESC[tone]}>{desc}</p>}
      {action && <ActionButton action={action} tone={tone} />}
    </div>
  );
}

export type ErrorStateProps = {
  /** 무엇이 안 됐는지. 기본값은 조회 실패. */
  title?: string;
  /** 이용자가 다음에 뭘 하면 되는지. */
  desc?: string;
  /** 원인 원문(에러 메시지 등). 있으면 그대로 보여줍니다 — 추측해 지어내지 않습니다. */
  cause?: string;
  action?: EmptyStateAction;
  /** 클라이언트 컴포넌트에서만 — 다시 시도 버튼. */
  onRetry?: () => void;
  retryLabel?: string;
  tone?: StateTone;
  className?: string;
};

/**
 * 조회·처리가 "실패한" 상태. 빈 상태와 구분해서 씁니다 —
 * 실패를 "데이터 없음"으로 표시하거나 목업으로 덮으면 사실이 아닌 화면이 됩니다.
 */
export function ErrorState({
  title = "지금은 불러올 수 없어요",
  desc,
  cause,
  action,
  onRetry,
  retryLabel = "다시 시도",
  tone = "light",
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`${SHELL[tone]} ${PAD[tone]} flex flex-col items-center gap-2 text-center ${className}`.trim()}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full ${ERROR_ICON_WRAP[tone]}`}
      >
        <Icon name="warning" size={22} />
      </div>
      <p className={TITLE[tone]}>{title}</p>
      {desc && <p className={DESC[tone]}>{desc}</p>}
      {cause && <p className={CAUSE[tone]}>{cause}</p>}
      {(onRetry || action) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {onRetry &&
            (tone === "admin" ? (
              <button type="button" onClick={onRetry} className={ADMIN_LINK}>
                {retryLabel}
              </button>
            ) : (
              <Button onClick={onRetry} variant="primary" size="sm">
                {retryLabel}
              </Button>
            ))}
          {action &&
            (tone === "admin" ? (
              <a href={action.href} className={ADMIN_LINK}>
                {action.label}
              </a>
            ) : (
              <Button href={action.href} variant="secondary" size="sm">
                {action.label}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
