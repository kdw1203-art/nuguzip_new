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

const BASE =
  "press inline-flex items-center justify-center gap-1.5 rounded-xl font-bold no-underline text-center transition-colors disabled:opacity-60 disabled:pointer-events-none";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-[12px]",
  md: "px-4 py-2.5 text-[13px]",
  lg: "px-5 py-3 text-sm",
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

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    fullWidth = false,
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
    className: _cn2,
    children,
    href: _h,
    ...buttonRest
  } = props;
  return (
    <button
      type="button"
      className={filled ? cx(cls, "text-white") : cls}
      {...buttonRest}
    >
      {children}
    </button>
  );
}
