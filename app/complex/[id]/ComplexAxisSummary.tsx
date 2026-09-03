import Link from "next/link";
import { loadAxisContext } from "./section-loaders";
import { timingSignals } from "@/lib/ai/insight-blocks";

/* [OPT-48] 단지 허브 2.0 — 워크벤치와 같은 근거(라이브 컨텍스트)를 허브에도 요약.
   원칙(이 페이지의 예산 규율을 따른다):
   - 컨텍스트는 5분 캐시(unstable_cache) — 보통 첫 방문자 이후 DB 왕복 0.
   - 1.2초 안에 못 받으면 **아무것도 그리지 않는다**(섹션 자체 생략 — 허브를 늦추지 않기).
   - 수치가 없는 축은 만들지 않는다 — 지어내지 않기(워크벤치와 같은 규칙). */
export async function ComplexAxisSummary({
  complexId,
  regionName,
}: {
  complexId: string;
  regionName: string;
}) {
  const ctx = await Promise.race([
    loadAxisContext(complexId, regionName).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 1200)),
  ]);
  if (!ctx) return null;

  const cells: { label: string; value: string; sub: string }[] = [];
  const snap = ctx.region?.snapshot;
  if (snap?.saleChangeMonthly != null) {
    cells.push({
      label: "지역 월간 변동",
      value: `${snap.saleChangeMonthly > 0 ? "+" : ""}${snap.saleChangeMonthly}%`,
      sub: `월 거래 ${snap.tradeCount ?? "—"}건 · ${snap.period}`,
    });
  }
  if (ctx.rent?.wolseSharePct != null) {
    cells.push({
      label: "월세 비중",
      value: `${ctx.rent.wolseSharePct}%`,
      sub: `신고 ${ctx.rent.sample ?? 0}건 · 최근 ${ctx.rent.months}개월`,
    });
  }
  if (ctx.supply?.upcomingHouseholds != null && ctx.supply.upcomingHouseholds > 0) {
    cells.push({
      label: "입주 예정",
      value: `${ctx.supply.upcomingHouseholds.toLocaleString()}세대`,
      sub: `${ctx.supply.upcomingComplexes}개 단지 · 24개월 내`,
    });
  }
  if (ctx.macro?.baseRatePct != null) {
    cells.push({
      label: "기준금리",
      value: `${ctx.macro.baseRatePct}%`,
      sub: `한국은행 · ${ctx.macro.asOf ?? ""}`,
    });
  }
  if (cells.length < 2) return null; // 셀 1개짜리 섹션은 소음

  const signals = timingSignals(ctx).filter((s) => s.state !== "na");
  const SIGNAL_DOT: Record<string, string> = {
    green: "bg-success",
    yellow: "bg-warning",
    red: "bg-danger",
  };

  return (
    <section aria-label="시장 축 요약" className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold text-ink">시장 축 요약 — AI 워크벤치와 같은 근거</h2>
        <Link
          href={`/analysis/ai/ai-diagnosis?complexId=${encodeURIComponent(complexId)}`}
          className="shrink-0 text-xs font-semibold text-primary"
        >
          AI 진단으로 ›
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-bg p-2.5">
            <div className="t-caption font-bold uppercase tracking-wide text-text-3">{c.label}</div>
            <div className="mt-0.5 text-[19px] font-extrabold text-ink tabular-nums">{c.value}</div>
            <div className="t-caption text-text-3">{c.sub}</div>
          </div>
        ))}
      </div>
      {signals.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-3">
          {signals.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-text-2">
              <span className={`h-2 w-2 rounded-full ${SIGNAL_DOT[s.state] ?? "bg-text-3"}`} aria-hidden />
              {s.label}: {s.basis}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 t-caption text-text-3">
        참고용 요약이며 투자 권유가 아닙니다 · 축별 출처·기준일은 AI 진단 화면의 근거 각주에서 확인
      </p>
    </section>
  );
}
