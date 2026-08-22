import Link from "next/link";

/* [개선 #6, 2026-08-22] 계산기 상호 링크 줄.
   방문 실측에서 /calculator 는 상위 진입 경로(홈·동네이야기 다음)인데 검색에는
   한 장으로만 노출됐다 — "중개보수 계산기"·"전월세 전환" 같은 키워드는 각자
   검색량이 있는 별개 질의라 랜딩을 나눴다. 이 줄이 다섯 장을 서로 잇는다
   (내부 링크는 SEO 이기도 하지만, 우선 사용자가 옆 계산기를 발견하는 길이다). */

export const CALCULATORS = [
  { href: "/calculator", label: "대출 계산기" },
  { href: "/calculator/brokerage", label: "중개보수 계산기" },
  { href: "/calculator/jeonse-monthly", label: "전월세 전환 계산기" },
  { href: "/calculator/gap", label: "갭·전세가율 계산기" },
  { href: "/calculator/rental-yield", label: "임대수익률 계산기" },
] as const;

export function CalculatorNav({ current }: { current: string }) {
  return (
    <nav
      aria-label="계산기 목록"
      className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {CALCULATORS.map((c) =>
        c.href === current ? (
          <span
            key={c.href}
            aria-current="page"
            className="chip-active shrink-0 rounded-full px-3.5 py-2 text-[12px] font-bold"
          >
            {c.label}
          </span>
        ) : (
          <Link
            key={c.href}
            href={c.href}
            className="chip press shrink-0 border border-line bg-surface px-3.5 py-2 text-[12px] font-semibold text-text-2 no-underline"
          >
            {c.label}
          </Link>
        ),
      )}
    </nav>
  );
}
