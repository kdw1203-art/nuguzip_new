import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
} from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "cta";
export type ButtonSize = "sm" | "md" | "lg";

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /**
   * 처리 중 표시. 스피너를 앞에 붙이고 버튼을 잠근다.
   * 누른 뒤 아무 반응이 없으면 사람은 한 번 더 누른다 — 그 두 번째 클릭이
   * 중복 제출이 된다. 잠그는 것이 연출보다 먼저다.
   * 링크(href) 에는 붙이지 않는다. 이동은 상단 진행바가 알려 준다.
   */
  loading?: boolean;
  className?: string;
  children: ReactNode;
};

/** Renders a native <button type="button"> (no href). */
type ButtonAsButton = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> & {
    href?: undefined;
  };

/** Renders a Next <Link> (href required). */
type ButtonAsLink = BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/* `tap-ripple` 은 CSS 만으로 도는 눌림 파문이다(:active + ::after).
   포인터 좌표를 따라가려면 클라이언트 컴포넌트로 내려야 하는데, 버튼 하나
   때문에 서버 컴포넌트를 포기할 값어치는 없다 — 가운데서 퍼지게 둔다. */
/* [E71] disabled 는 **투명도로 표현하지 않는다** — globals.css 의
   "15b disabled: bg #eef1f6 · text #b0b8c1 (opacity 금지)" 규칙과 같은 처리다.
   여기만 opacity-60 을 쓰고 있어서, 같은 화면에서 비활성 <Button> 과 비활성
   .btn-primary 가 서로 다르게 보였다(하나는 흐려지고 하나는 회색으로 바뀐다).
   opacity 는 글자·배경·테두리를 한꺼번에 흐려 대비를 무너뜨리기도 한다. */
const BASE =
  "press tap-ripple inline-flex items-center justify-center gap-1.5 rounded-xl font-bold no-underline text-center transition-colors disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)] disabled:border-[var(--disabled-bg)] disabled:shadow-none disabled:pointer-events-none";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-[12px]",
  md: "px-4 py-2.5 text-[13px]",
  lg: "px-5 py-3 text-[15px]",
};

const VARIANTS: Record<ButtonVariant, string> = {
  // filled primary — white text is applied per-element below: `text-white` on the
  // <button>, and an inline color on the <a>/<Link> (never rely on text-white for links).
  primary: "bg-primary hover:bg-[var(--primary-strong)]",
  cta: "btn-cta bg-primary hover:bg-[var(--primary-strong)]",
  secondary: "glass text-text-1",
  outline: "border border-primary bg-transparent text-primary hover:bg-primary-soft",
  ghost: "bg-transparent text-text-1 hover:bg-primary-soft",
};

const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

/* [961] 진행 표시는 온점 링(.njn-ring) — 인터랙션 라이브러리 §01 "링 · 버튼 내부·소형" */

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    fullWidth = false,
    loading = false,
    className = "",
  } = props;
  const filled = variant === "primary" || variant === "cta";
  const cls = cx(
    BASE,
    SIZES[size],
    VARIANTS[variant],
    fullWidth && "w-full",
    className,
  );

  if (props.href !== undefined) {
    // Link branch: white text guaranteed via inline style only (no text-white on <a>).
    const {
      variant: _v,
      size: _s,
      fullWidth: _fw,
      loading: _ld,
      className: _cn,
      children,
      href,
      style,
      ...anchorRest
    } = props;
    const linkStyle: CSSProperties | undefined = filled
      ? { ...style, color: "#fff" }
      : style;
    return (
      <Link href={href} className={cls} style={linkStyle} {...anchorRest}>
        {children}
      </Link>
    );
  }

  // Button branch: filled variants get the text-white utility (safe on <button>).
  const {
    variant: _v2,
    size: _s2,
    fullWidth: _fw2,
    loading: _ld2,
    className: _cn2,
    children,
    href: _h,
    disabled,
    ...buttonRest
  } = props;
  return (
    <button
      type="button"
      className={filled ? cx(cls, "text-white") : cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...buttonRest}
    >
      {loading && <span className="njn-ring" aria-hidden="true" />}
      {children}
    </button>
  );
}
