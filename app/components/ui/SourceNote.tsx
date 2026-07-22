import Link from "next/link";
import type { ReactNode } from "react";

export type SourceNoteTone = "info" | "muted";

export type SourceNoteProps = {
  children: ReactNode;
  tone?: SourceNoteTone;
  href?: string;
  hrefLabel?: string;
};

/** Small source / disclaimer note with an optional trailing link. */
export function SourceNote({
  children,
  tone = "muted",
  href,
  hrefLabel,
}: SourceNoteProps) {
  const link = href ? (
    <>
      {" "}
      <Link
        href={href}
        className="font-semibold text-primary underline underline-offset-2"
      >
        {hrefLabel ?? "자세히"}
      </Link>
    </>
  ) : null;

  if (tone === "info") {
    return (
      <div className="rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6] text-primary">
        {children}
        {link}
      </div>
    );
  }
  return (
    <p className="text-[11px] leading-[1.6] text-text-3">
      {children}
      {link}
    </p>
  );
}
