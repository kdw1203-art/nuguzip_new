export function HouseMark({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6 L22 10.4 V20 a1.4 1.4 0 0 1 -1.4 1.4 H14.8 V14.6 H9.2 V21.4 H3.4 A1.4 1.4 0 0 1 2 20 V10.4 Z"
        fill="var(--primary)"
      />
    </svg>
  );
}

export function Logo({ size = 21 }: { size?: number }) {
  return (
    <span className="flex items-center gap-[7px] select-none">
      <HouseMark size={size} />
      <span
        className="font-extrabold text-primary"
        style={{ fontSize: size * 0.81, letterSpacing: "-0.4px" }}
      >
        누구집
      </span>
    </span>
  );
}
