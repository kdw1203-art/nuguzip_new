import {
  loadFieldPerf,
  loadIndexCoverage,
  type FieldPerfRow,
  type IndexCoverageRow,
  type Loaded,
} from "@/lib/admin/seo-metrics";
import type { ReactElement, ReactNode } from "react";
import { cwvVerdict, type CwvVerdict } from "@/lib/seo/crux";

/*
 * SEO 측정 (N5 · N25)
 *  - 실사용자 성능: CrUX 주간 기록 (기기별 LCP·INP·CLS p75 + good 비율)
 *  - 색인률: 사이트맵 제출 수 대비 URL 검사 API 표본 색인 수
 *
 * 이 화면의 규칙 하나: **모르는 것을 아는 척하지 않는다.**
 * 키가 없는 상태 · 크론이 아직 안 돈 상태 · 표본이 모자란 상태 · 조회가 실패한 상태를
 * 각각 다른 문장으로 적는다. 넷을 "데이터 없음" 하나로 뭉치면 이 대시보드를 보고
 * 할 수 있는 판단이 사라진다.
 *
 * 색인률에는 항상 표본 수를 붙여 적는다. 분모 없는 비율은 숫자가 아니라 인상이다.
 */

export const dynamic = "force-dynamic";

const card =
  "flex flex-col gap-3 rounded-2xl border border-[rgba(255,255,255,.06)] bg-[#12161f] p-5";

const VERDICT_COLOR: Record<CwvVerdict, string> = {
  good: "var(--ai-success)",
  "needs-improvement": "#f2c94c",
  poor: "var(--ai-danger)",
  unknown: "#9aa6b8",
};

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-[1.7] text-[#9aa6b8]">{children}</p>;
}

/**
 * 키 미설정 · 조회 실패는 데이터 표를 그리기 전에 각각 다른 문장으로 처리한다.
 *
 * 컴포넌트가 아니라 **평범한 함수**로 둔 이유: 호출부가 `const gate = …; if (gate) return gate;`
 * 로 쓰는데, JSX 엘리먼트를 돌려주는 컴포넌트를 `<GateNotice … />` 로 부르면 그 값은
 * 내용과 무관하게 항상 truthy 라서 정상 상태에서도 게이트가 걸린다. 함수로 부르면
 * "게이트 없음"이 실제로 null 이 된다.
 */
function gateNotice<T>(loaded: Loaded<T>, configureHint: string): ReactElement | null {
  if (loaded.state === "not_configured") {
    return <Empty>아직 켜지 않은 측정입니다. {configureHint}</Empty>;
  }
  if (loaded.state === "failed") {
    return (
      <Empty>
        기록을 불러오지 못했습니다 — 데이터가 없다는 뜻이 아니라 조회에 실패했다는
        뜻입니다. ({loaded.detail})
      </Empty>
    );
  }
  return null;
}

function MetricCell({
  label,
  value,
  unit,
  verdict,
  goodPct,
}: {
  label: string;
  value: number | null;
  unit: string;
  verdict: CwvVerdict;
  goodPct: number | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold text-[#9aa6b8]">{label}</span>
      <span className="text-[17px] font-extrabold" style={{ color: VERDICT_COLOR[verdict] }}>
        {value === null ? "—" : `${fmt(Math.round(value * 1000) / 1000)}${unit}`}
      </span>
      <span className="text-[10px] text-[#6b7688]">
        {goodPct === null ? "분포 없음" : `양호 ${goodPct.toFixed(1)}%`}
      </span>
    </div>
  );
}

function FieldPerfPanel({ loaded }: { loaded: Loaded<FieldPerfRow> }) {
  const gate = gateNotice(
    loaded,
    "Vercel 환경변수에 CRUX_API_KEY 를 넣으면 매주 월요일 15시(KST) 무렵 ETL 실행 때 기록이 쌓입니다. Google Cloud 콘솔에서 Chrome UX Report API 를 켜고 만드는 무료 API 키입니다.",
  );
  if (gate) return gate;
  if (loaded.state !== "ok") return null;

  if (loaded.rows.length === 0) {
    return (
      <Empty>
        키는 설정돼 있는데 아직 기록이 없습니다. 첫 수집은 다음 월요일 15시(KST) 무렵(ETL 스케줄)이며,
        지금 바로 확인하려면 GitHub Actions 의 Market ETL 을 수동 실행하세요.
      </Empty>
    );
  }

  const weeks = [...new Set(loaded.rows.map((r) => r.collectedWeek))].sort().reverse();
  const latestWeek = weeks[0];
  const latest = loaded.rows.filter((r) => r.collectedWeek === latestWeek);

  return (
    <div className="flex flex-col gap-4">
      {latest.map((row) => {
        if (row.status === "insufficient_data") {
          return (
            <div key={row.formFactor} className="rounded-xl border border-[rgba(255,255,255,.06)] p-3">
              <span className="text-[12px] font-bold text-[#c9d2e0]">{row.formFactor}</span>
              <p className="mt-1 text-[11px] leading-[1.7] text-[#9aa6b8]">
                CrUX 표본 미달 — 아직 이 사이트의 실사용자 데이터가 공개 기준을 넘지
                못했습니다. 성능이 나쁘다는 뜻이 아니라 방문자 수가 아직 적다는 뜻이고,
                트래픽이 늘면 자동으로 잡힙니다.
              </p>
            </div>
          );
        }
        if (row.status === "error") {
          return (
            <div key={row.formFactor} className="rounded-xl border border-[rgba(248,113,113,.25)] p-3">
              <span className="text-[12px] font-bold text-[#c9d2e0]">{row.formFactor}</span>
              <p className="mt-1 text-[11px] leading-[1.7] text-ai-danger">
                조회 실패: {row.errorDetail ?? "원인 미기록"}
              </p>
            </div>
          );
        }
        return (
          <div key={row.formFactor} className="rounded-xl border border-[rgba(255,255,255,.06)] p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-bold text-[#c9d2e0]">{row.formFactor}</span>
              <span className="text-[10px] text-[#6b7688]">
                {row.periodFirstDate && row.periodLastDate
                  ? `수집 기간 ${row.periodFirstDate} ~ ${row.periodLastDate}`
                  : "수집 기간 미기록"}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <MetricCell
                label="LCP p75"
                value={row.lcpP75Ms}
                unit="ms"
                verdict={cwvVerdict("lcpMs", row.lcpP75Ms)}
                goodPct={row.lcpGoodPct}
              />
              <MetricCell
                label="INP p75"
                value={row.inpP75Ms}
                unit="ms"
                verdict={cwvVerdict("inpMs", row.inpP75Ms)}
                goodPct={row.inpGoodPct}
              />
              <MetricCell
                label="CLS p75"
                value={row.clsP75}
                unit=""
                verdict={cwvVerdict("cls", row.clsP75)}
                goodPct={row.clsGoodPct}
              />
              <MetricCell
                label="FCP p75"
                value={row.fcpP75Ms}
                unit="ms"
                verdict="unknown"
                goodPct={null}
              />
              <MetricCell
                label="TTFB p75"
                value={row.ttfbP75Ms}
                unit="ms"
                verdict="unknown"
                goodPct={null}
              />
            </div>
          </div>
        );
      })}

      {weeks.length > 1 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,.08)] text-[10px] text-[#6b7688]">
                <th className="py-1.5 font-medium">주(월요일)</th>
                <th className="py-1.5 font-medium">기기</th>
                <th className="py-1.5 text-right font-medium">LCP</th>
                <th className="py-1.5 text-right font-medium">INP</th>
                <th className="py-1.5 text-right font-medium">CLS</th>
              </tr>
            </thead>
            <tbody>
              {loaded.rows.map((r) => (
                <tr
                  key={`${r.collectedWeek}-${r.formFactor}`}
                  className="border-b border-[rgba(255,255,255,.04)] last:border-b-0"
                >
                  <td className="py-1.5 text-[#9aa6b8]">{r.collectedWeek}</td>
                  <td className="py-1.5 text-[#9aa6b8]">{r.formFactor}</td>
                  <td className="py-1.5 text-right text-[#c9d2e0]">
                    {r.status === "ok" && r.lcpP75Ms !== null ? `${fmt(r.lcpP75Ms)}ms` : "—"}
                  </td>
                  <td className="py-1.5 text-right text-[#c9d2e0]">
                    {r.status === "ok" && r.inpP75Ms !== null ? `${fmt(r.inpP75Ms)}ms` : "—"}
                  </td>
                  <td className="py-1.5 text-right text-[#c9d2e0]">
                    {r.status === "ok" && r.clsP75 !== null ? r.clsP75.toFixed(3) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] leading-[1.7] text-[#6b7688]">
            &quot;—&quot;는 그 주에 표본이 모자랐거나 조회가 실패했다는 뜻입니다. 0 이 아닙니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function IndexCoveragePanel({ loaded }: { loaded: Loaded<IndexCoverageRow> }) {
  const gate = gateNotice(
    loaded,
    "Vercel 환경변수에 GSC_SERVICE_ACCOUNT_EMAIL · GSC_SERVICE_ACCOUNT_PRIVATE_KEY · GSC_SITE_URL 을 넣고, 서치콘솔 속성에 그 서비스 계정을 사용자로 추가하면 켜집니다.",
  );
  if (gate) return gate;
  if (loaded.state !== "ok") return null;

  if (loaded.rows.length === 0) {
    return (
      <Empty>
        키는 설정돼 있는데 아직 기록이 없습니다. 첫 수집은 다음 월요일 15시(KST) 무렵(ETL 스케줄)입니다.
      </Empty>
    );
  }

  const latest = loaded.rows[0];
  if (!latest) return null;
  const rate = latest.sampled > 0 ? (latest.indexed / latest.sampled) * 100 : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="text-[10px] font-semibold text-[#9aa6b8]">색인률(표본)</div>
          <div className="text-[26px] font-extrabold text-ai-accent">
            {rate === null ? "—" : `${rate.toFixed(1)}%`}
          </div>
          <div className="text-[10px] text-[#6b7688]">
            표본 {fmt(latest.sampled)}개 중 {fmt(latest.indexed)}개 색인
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[#9aa6b8]">사이트맵 제출</div>
          <div className="text-[26px] font-extrabold text-[#c9d2e0]">{fmt(latest.submitted)}</div>
          <div className="text-[10px] text-[#6b7688]">우리 사이트맵이 싣고 있는 URL 수</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[#9aa6b8]">검사 실패</div>
          <div className="text-[26px] font-extrabold text-[#c9d2e0]">{fmt(latest.errored)}</div>
          <div className="text-[10px] text-[#6b7688]">미색인으로 세지 않습니다</div>
        </div>
        <div className="text-[10px] text-[#6b7688]">기준 주 {latest.collectedWeek}</div>
      </div>

      <p className="text-[10px] leading-[1.7] text-[#6b7688]">
        전수가 아니라 표본입니다. URL 검사 API 할당량(2,000/일)상 {fmt(latest.submitted)}개를 매주
        전부 확인할 수 없어, 사이트맵 유형별로 고르게 뽑은 {fmt(latest.sampled)}개를 실측합니다.
        표본은 매주 같은 자리에서 뽑으므로 주간 변화는 표본 교체가 아니라 색인 상태의 변화입니다.
      </p>

      {Object.keys(latest.bySection).length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,.08)] text-[10px] text-[#6b7688]">
                <th className="py-1.5 font-medium">유형</th>
                <th className="py-1.5 text-right font-medium">제출</th>
                <th className="py-1.5 text-right font-medium">표본</th>
                <th className="py-1.5 text-right font-medium">색인</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(latest.bySection).map(([slug, t]) => (
                <tr key={slug} className="border-b border-[rgba(255,255,255,.04)] last:border-b-0">
                  <td className="py-1.5 text-[#c9d2e0]">{slug}</td>
                  <td className="py-1.5 text-right text-[#9aa6b8]">{fmt(t.submitted)}</td>
                  <td className="py-1.5 text-right text-[#9aa6b8]">{fmt(t.sampled)}</td>
                  <td className="py-1.5 text-right text-[#c9d2e0]">{fmt(t.indexed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {Object.keys(latest.coverageStates).length > 0 ? (
        <div>
          <div className="mb-1 text-[10px] font-semibold text-[#9aa6b8]">
            색인 상태 내역 (서치콘솔 원문)
          </div>
          <ul className="flex flex-col gap-0.5">
            {Object.entries(latest.coverageStates)
              .sort((a, b) => b[1] - a[1])
              .map(([state, count]) => (
                <li key={state} className="text-[11px] text-[#9aa6b8]">
                  {state} — {fmt(count)}건
                </li>
              ))}
          </ul>
          <p className="mt-1 text-[10px] text-[#6b7688]">
            색인이 안 되는 <strong>이유</strong>는 여기에만 남습니다. 비율만 보면 무엇을 고쳐야
            할지 알 수 없습니다.
          </p>
        </div>
      ) : null}

      {loaded.rows.length > 1 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,.08)] text-[10px] text-[#6b7688]">
                <th className="py-1.5 font-medium">주(월요일)</th>
                <th className="py-1.5 text-right font-medium">제출</th>
                <th className="py-1.5 text-right font-medium">표본</th>
                <th className="py-1.5 text-right font-medium">색인률</th>
              </tr>
            </thead>
            <tbody>
              {loaded.rows.map((r) => (
                <tr key={r.collectedWeek} className="border-b border-[rgba(255,255,255,.04)] last:border-b-0">
                  <td className="py-1.5 text-[#9aa6b8]">{r.collectedWeek}</td>
                  <td className="py-1.5 text-right text-[#9aa6b8]">{fmt(r.submitted)}</td>
                  <td className="py-1.5 text-right text-[#9aa6b8]">{fmt(r.sampled)}</td>
                  <td className="py-1.5 text-right text-[#c9d2e0]">
                    {r.sampled > 0 ? `${((r.indexed / r.sampled) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default async function AdminSeoPage() {
  const [perf, coverage] = await Promise.all([loadFieldPerf(8), loadIndexCoverage(8)]);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[18px] font-extrabold text-[#e8eef8]">SEO 측정</h1>
        <p className="mt-1 text-[12px] leading-[1.7] text-[#9aa6b8]">
          실사용자 성능(CrUX)과 색인률을 주 단위로 쌓아 둡니다. 둘 다 매주 월요일
          15시(KST) 무렵에 한 번 수집합니다. 반복 관측 루틴(AI 인용·쿼리 갭)은 코드가 아니라
          문서와 이슈로 돕니다 — <code className="text-[#c9d2e0]">docs/seo-geo-routines.md</code>.
        </p>
      </header>

      <section className={card}>
        <h2 className="text-[14px] font-extrabold text-[#e8eef8]">
          실사용자 성능 (CrUX) <span className="text-[10px] font-medium text-[#6b7688]">N5</span>
        </h2>
        <p className="-mt-1 text-[11px] leading-[1.7] text-[#9aa6b8]">
          릴리스 게이트의 번들 예산은 실험실 지표입니다. 구글이 순위 신호로 쓰는 것은 실제
          방문자의 기기·회선에서 측정된 이 값입니다.
        </p>
        <FieldPerfPanel loaded={perf} />
      </section>

      <section className={card}>
        <h2 className="text-[14px] font-extrabold text-[#e8eef8]">
          색인률 <span className="text-[10px] font-medium text-[#6b7688]">N25</span>
        </h2>
        <p className="-mt-1 text-[11px] leading-[1.7] text-[#9aa6b8]">
          사이트맵에 올린 URL 중 실제로 색인된 비율. 사이트맵을 유형별로 나눈 효과가
          여기서 드러납니다 — 어느 유형이 안 잡히는지 보입니다.
        </p>
        <IndexCoveragePanel loaded={coverage} />
      </section>

      {/* [#102] 타이틀 CTR 실험 배정표 — 배정은 결정적 해시(요청 간 불변) */}
      <section className={card}>
        <h2 className="text-[14px] font-extrabold text-[#e8eef8]">
          타이틀 실험 <span className="text-[10px] font-medium text-[#6b7688]">#102</span>
        </h2>
        <TitleExperimentPanel />
      </section>

      {/* [#107] 위젯 채택 — 임베드 비콘(host 일집계) 최근 30일 */}
      <section className={card}>
        <h2 className="text-[14px] font-extrabold text-[#e8eef8]">
          위젯 채택 <span className="text-[10px] font-medium text-[#6b7688]">#107</span>
        </h2>
        <WidgetAdoptionPanel />
      </section>

      {/* [#117] 뉴스 → 단지 링크율 — 자동 뉴스가 전환 표면(단지 허브)으로 흐르는 비율 */}
      <section className={card}>
        <h2 className="text-[14px] font-extrabold text-[#e8eef8]">
          뉴스→단지 연결률 <span className="text-[10px] font-medium text-[#6b7688]">#117</span>
        </h2>
        <NewsComplexLinkPanel />
      </section>
    </div>
  );
}

async function NewsComplexLinkPanel() {
  const { getServiceSupabase } = await import("@/lib/supabase/service");
  const { resolveComplexHref } = await import("@/lib/newui/complex-link");
  const sb = getServiceSupabase();
  if (!sb) return <p className="text-[12px] text-[#9aa6b8]">DB 미구성</p>;
  const { data, error } = await sb
    .from("board_posts")
    .select("title, region, automation_meta")
    .eq("is_automated", true)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return <p className="text-[12px] text-[#ff9d9d]">조회 실패 — {error.message}</p>;
  const rows = (data ?? []) as Array<{
    title: string;
    region: string | null;
    automation_meta: Record<string, unknown> | null;
  }>;
  let withEntity = 0;
  let hit = 0;
  const misses: string[] = [];
  for (const r of rows) {
    /* 수집 세션이 뽑은 지명 엔티티(geo.landmarks) 중 단지명으로 해석되는 것이
       있는가 — 상세 페이지의 그 매칭 함수(resolveComplexHref)로 실측. */
    const geo = (r.automation_meta as { geo?: { landmarks?: unknown } } | null)?.geo;
    const landmarks = Array.isArray(geo?.landmarks)
      ? (geo!.landmarks as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (landmarks.length === 0) {
      if (misses.length < 8) misses.push(`[엔티티 없음] ${r.title.slice(0, 26)}`);
      continue;
    }
    withEntity += 1;
    let matched = false;
    for (const lm of landmarks.slice(0, 3)) {
      const href = await resolveComplexHref(lm, r.region ?? "").catch(() => null);
      if (href) {
        matched = true;
        break;
      }
    }
    if (matched) hit += 1;
    else if (misses.length < 8) misses.push(landmarks[0].slice(0, 30));
  }
  void withEntity;
  const rate = rows.length > 0 ? Math.round((hit / rows.length) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 text-[12px] text-[#c9d2e0]">
      <p>
        최근 자동 뉴스 {rows.length}건 중 단지 허브 링크 매칭{" "}
        <b className="text-ai-accent">{hit}건 ({rate}%)</b> — 상세 페이지의
        resolveComplexHref 실측정.
      </p>
      {misses.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-[#8b94a6]">미매칭 표본 (별칭 사전 보강 후보):</span>
          {misses.map((m) => (
            <span key={m} className="truncate text-[11px] text-[#9aa6b8]">
              · {m}
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] leading-[1.6] text-[#8b94a6]">
        연결률이 30% 미만으로 유지되면 REGION_ALIASES·단지명 별칭 사전 보강 회차를
        엽니다 — 보강은 미매칭 표본 실측에서만 (추측 별칭 금지).
      </p>
    </div>
  );
}

async function WidgetAdoptionPanel() {
  const { getServiceSupabase } = await import("@/lib/supabase/service");
  const sb = getServiceSupabase();
  if (!sb) return <p className="text-[12px] text-[#9aa6b8]">DB 미구성</p>;
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("widget_embed_hits")
    .select("host, kind, hits, day, sample_url")
    .gte("day", since)
    .order("day", { ascending: false })
    .limit(300);
  if (error) return <p className="text-[12px] text-[#ff9d9d]">조회 실패 — {error.message}</p>;
  const byHost = new Map<string, { hits: number; kinds: Set<string>; sample: string | null }>();
  for (const r of data ?? []) {
    const cur = byHost.get(r.host) ?? { hits: 0, kinds: new Set<string>(), sample: null };
    cur.hits += Number(r.hits) || 0;
    cur.kinds.add(String(r.kind));
    if (!cur.sample && r.sample_url) cur.sample = String(r.sample_url);
    byHost.set(r.host, cur);
  }
  const rows = [...byHost.entries()].sort((a, b) => b[1].hits - a[1].hits).slice(0, 20);
  if (rows.length === 0) {
    return (
      <p className="text-[12px] leading-[1.7] text-[#9aa6b8]">
        아직 외부 임베드 관측 0 — 위젯을 처음 심는 블로그가 생기면 host 별로 여기
        잡힙니다(부모 페이지 referrer 기준, 개인 식별 없음). B2B 영업 리스트(#144)의
        원천입니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(([host, v]) => (
        <div key={host} className="flex items-center justify-between gap-3 text-[12px]">
          <span className="min-w-0 truncate font-bold text-[#e7ecf5]" title={v.sample ?? host}>
            {host}
            <span className="ml-1.5 text-[10px] text-[#8b94a6]">{[...v.kinds].join("·")}</span>
          </span>
          <span className="shrink-0 font-extrabold text-ai-accent tabular-nums">{v.hits}뷰</span>
        </div>
      ))}
    </div>
  );
}

async function TitleExperimentPanel() {
  const { REGION_CATALOG } = await import("@/lib/region/catalog");
  const { regionTitle, TITLE_EXPERIMENTS } = await import("@/lib/seo/title-experiment");
  const rows = REGION_CATALOG.map((r) => ({ id: r.id, name: r.name, ...regionTitle(r.id, r.name) }));
  const a = rows.filter((r) => r.variant === "A").length;
  const exp = TITLE_EXPERIMENTS[0];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-[1.7] text-[#9aa6b8]">
        {exp.label} · 시작 {exp.startedAt} · 판정: {exp.judge}. 배정 A {a} / B{" "}
        {rows.length - a} — GSC 성능 탭에서 아래 두 그룹의 페이지 CTR을 비교하세요.
      </p>
      <div className="flex flex-wrap gap-1">
        {rows.map((r) => (
          <span
            key={r.id}
            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
              r.variant === "A" ? "bg-[#1a2540] text-ai-accent" : "bg-[#2a2416] text-[#e0c589]"
            }`}
            title={r.title}
          >
            {r.name} {r.variant}
          </span>
        ))}
      </div>
    </div>
  );
}
