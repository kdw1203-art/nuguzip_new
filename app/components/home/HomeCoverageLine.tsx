import Link from "next/link";
import { formatCount, type HomeCoverage } from "@/lib/newui/home-coverage";

/* [950 · 홈 대개편] 커버리지 한 줄 — "얼마나 넓게 볼 수 있는가"를 실수치로.
 *
 * 홈 비판(투자자 ⑤·사용자 ②): 숫자가 하나도 없어 규모를 가늠할 수 없었고, 지역 칩이
 * 서비스 범위를 안양 근방으로 오해하게 했다. 전부 실카운트이며 못 읽은 값은 그 조각을
 * 뺀다. 공개 노트 수는 작아도 그대로 적는다 — 작은 수를 숨기는 것도 부풀리는 것과 같은
 * 종류의 왜곡이다(단, 0이면 적지 않는다: "0편"은 정보가 아니라 빈 방 안내다). */
export function HomeCoverageLine({
  coverage,
  publicNotes,
  className = "",
}: {
  coverage: HomeCoverage;
  publicNotes: number | null;
  className?: string;
}) {
  const parts: { label: string; href: string }[] = [];
  if (coverage.txCount) {
    parts.push({ label: `국토교통부 실거래 ${formatCount(coverage.txCount)}건`, href: "/tx" });
  }
  if (coverage.complexCount) {
    parts.push({ label: `단지 ${formatCount(coverage.complexCount)}개`, href: "/map" });
  }
  if (coverage.regionCount) {
    parts.push({ label: `전국 ${formatCount(coverage.regionCount)}개 시군구`, href: "/map" });
  }
  if (publicNotes && publicNotes > 0) {
    parts.push({ label: `공개 임장노트 ${formatCount(publicNotes)}편`, href: "/notes" });
  }
  if (parts.length === 0) return null;
  return (
    /* [963] t-fit — 좁은 화면에서 두 줄로 접힐 때 마지막 줄에 한 조각만 떨어지지 않게
       (text-wrap: pretty). 데스크톱에서는 칩과 함께 한 줄로 들어간다. */
    <p className={`m-0 text-center t-caption t-fit text-text-3 ${className}`}>
      {parts.map((p, i) => (
        <span key={p.label}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <Link href={p.href} className="text-text-3 no-underline hover:text-primary">
            {p.label}
          </Link>
        </span>
      ))}
    </p>
  );
}
