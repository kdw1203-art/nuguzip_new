/** 23c 탑 임장러 — 홀로그램 링 아바타 + ◈ 배지 (최상위 활동 배지, 구매 불가) */

export function HoloAvatar({
  size = 52,
  label,
}: {
  size?: number;
  label?: string;
}) {
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
      aria-label={label ?? "탑 임장러"}
    >
      <span
        className="block h-full w-full rounded-full"
        style={{
          background:
            "repeating-linear-gradient(45deg,#2a3342,#2a3342 5px,#39424f 5px,#39424f 10px)",
        }}
      />
      <span
        className="pointer-events-none absolute -inset-[3px] rounded-full"
        style={{
          border: "2.5px solid transparent",
          background:
            "conic-gradient(from 0deg,#1d4fd8,#7ea2ff,#5fd0e0,#1d4fd8) border-box",
          WebkitMask:
            "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
    </span>
  );
}

export function TopScoutBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-[9px] py-[3px] text-[9px] font-extrabold ${className}`}
      style={{
        color: "#7ea2ff",
        background: "rgba(126,162,255,.14)",
        borderColor: "rgba(126,162,255,.4)",
      }}
    >
      ◈ 탑 임장러
    </span>
  );
}
