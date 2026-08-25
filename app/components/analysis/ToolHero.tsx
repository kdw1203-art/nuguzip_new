import type { ReactNode } from "react";
import { Icon } from "@/app/components/Icon";

export interface HeroKpi {
  /** 큰 숫자 */
  value: ReactNode;
  /** 이 숫자가 무엇인지 */
  label: string;
  /** 기준·출처 한 줄 (없으면 생략) */
  note?: string;
  /** 전기 대비 — 값이 있을 때만 배지가 붙는다 */
  delta?: { pct: number; label?: string } | null;
}

function DeltaBadge({ pct, label }: { pct: number; label?: string }) {
  const tone = pct > 0 ? "delta-up-b" : pct < 0 ? "delta-down-b" : "delta-flat-b";
  const sign = pct > 0 ? "▲" : pct < 0 ? "▼" : "–";
  return (
    <span className={`delta ${tone}`}>
      {sign} {Math.abs(pct).toLocaleString("ko-KR")}%{label ? ` ${label}` : ""}
    </span>
  );
}

/* 분석 도구 페이지 공통 히어로.
 *
 * 왜: 기능 페이지들이 "제목 한 줄 → 바로 표"로 시작했다. 도구가 무슨 숫자를
 * 내는지가 첫 화면에 없어서, 들어온 사람이 뭘 읽어야 하는지 모른 채 스크롤하다
 * 나갔다(체류 1~3초 실측). 첫 화면을 **핵심 숫자 + 그림 + 다음 행동**으로 바꾼다.
 *
 * 사실 우선: KPI 는 값이 있는 것만 넘긴다. 없는 칸을 "—"로 채우지 않는다.
 */
export function ToolHero({
  eyebrow,
  icon,
  title,
  lead,
  kpis,
  chart,
  actions,
  source,
  toneClass = "text-primary",
}: {
  eyebrow?: string;
  /** 선형 아이콘 이름 (Icon.tsx) */
  icon?: string;
  title: string;
  lead?: ReactNode;
  kpis?: readonly HeroKpi[];
  /** 오른쪽(모바일에선 아래) 그림 — 차트 컴포넌트를 그대로 넣는다 */
  chart?: ReactNode;
  actions?: ReactNode;
  /** 기준·출처 — 숫자를 냈으면 반드시 적는다 */
  source?: ReactNode;
  /** 계열 색 (차트의 currentColor 가 이걸 탄다) */
  toneClass?: string;
}) {
  return (
    <section className="hub-hero card-pad-lg flex flex-col gap-4" data-reveal="">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow && (
            <span className="t-caption font-bold uppercase tracking-wider text-primary">
              {eyebrow}
            </span>
          )}
          <div className="flex items-center gap-2.5">
            {icon && (
              <span
                className={`tile-ico flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-primary-soft ${toneClass}`}
              >
                <Icon name={icon} size={17} />
              </span>
            )}
            <h1 className="t-display text-balance text-ink">{title}</h1>
          </div>
          {lead && <p className="t-body max-w-[52ch] text-text-2">{lead}</p>}
        </div>
        {chart && (
          <div className={`w-full shrink-0 md:w-[320px] ${toneClass}`}>{chart}</div>
        )}
      </div>

      {kpis && kpis.length > 0 && (
        <div className="kpi-row">
          {kpis.map((k) => (
            <div key={k.label} className="kpi">
              <span className="kpi-k">{k.label}</span>
              <span className="kpi-v flex flex-wrap items-baseline gap-1.5">
                {k.value}
                {k.delta && <DeltaBadge pct={k.delta.pct} label={k.delta.label} />}
              </span>
              {k.note && <span className="kpi-d">{k.note}</span>}
            </div>
          ))}
        </div>
      )}

      {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
      {source && <p className="t-caption text-text-3">{source}</p>}
    </section>
  );
}
