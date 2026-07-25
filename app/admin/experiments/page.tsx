import {
  loadExperimentResults,
  MIN_CONVERSIONS_PER_VARIANT,
  MIN_EXPOSURES_PER_VARIANT,
  type ExperimentResult,
  type VariantResult,
} from "@/lib/experiments/results";

/* A7 — 실험(A/B) 결과.
   사실 우선: 표본이 기준을 못 넘기면 p 값·개선율을 아예 계산하지 않고 "표본 부족"만 말한다.
   n 이 작을 때 숫자를 띄우면 숫자가 있다는 이유만으로 결론이 서 버린다.
   비율의 분모는 사람이 아니라 **노출 이벤트 수**(CTR)이고, 화면에도 그대로 적는다. */

export const dynamic = "force-dynamic";

const lightCard =
  "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5";

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 노출이 0이면 "0%" 가 아니라 "—" 다. 아직 안 재본 것과 0인 것은 다르다. */
function pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(2)}%`;
}

function signedPct(v: number | null): string {
  if (v === null) return "—";
  const s = (v * 100).toFixed(1);
  return v > 0 ? `+${s}%` : `${s}%`;
}

function stamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 기준까지 얼마나 남았는지 — "부족하다"만 말하면 언제 볼 수 있는지 모른다. */
function shortfall(v: VariantResult): string {
  const needExp = Math.max(0, MIN_EXPOSURES_PER_VARIANT - v.exposures);
  const needConv = Math.max(0, MIN_CONVERSIONS_PER_VARIANT - v.conversions);
  if (needExp === 0 && needConv === 0) return "기준 충족";
  const parts: string[] = [];
  if (needExp > 0) parts.push(`노출 ${fmt(needExp)}회`);
  if (needConv > 0) parts.push(`전환 ${fmt(needConv)}회`);
  return `${parts.join(" · ")} 더 필요`;
}

function ExperimentCard({ r }: { r: ExperimentResult }) {
  const conflicts = r.variants.reduce((s, v) => s + v.variantConflicts, 0);

  return (
    <div className={lightCard}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-extrabold text-ink">{r.def.key}</div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            r.def.enabled
              ? "bg-primary-soft text-primary"
              : "bg-[#eef1f5] text-text-3"
          }`}
        >
          {r.def.enabled ? "진행 중" : "중지됨 (전원 대조군)"}
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-text-2">{r.def.hypothesis}</p>

      <div className="flex flex-col gap-1 rounded-[10px] bg-bg px-3 py-2.5 text-[11px] text-text-3">
        <div>
          노출 이벤트 <span className="font-semibold text-text-2">{r.def.exposureEvent}</span> · 전환
          이벤트 <span className="font-semibold text-text-2">{r.def.primaryMetricEvent}</span>
        </div>
        <div>
          집계 구간 {stamp(r.firstAt)} ~ {stamp(r.lastAt)} · 총 노출 {fmt(r.totalExposures)} · 총 전환{" "}
          {fmt(r.totalConversions)}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[11px]">
          <thead>
            <tr className="text-left text-text-3">
              <th className="border-b border-line py-2 pr-3 font-semibold">변형</th>
              <th className="border-b border-line py-2 pr-3 text-right font-semibold">노출</th>
              <th className="border-b border-line py-2 pr-3 text-right font-semibold">전환</th>
              <th className="border-b border-line py-2 pr-3 text-right font-semibold">
                전환율 (노출당)
              </th>
              <th className="border-b border-line py-2 pr-3 text-right font-semibold">배정 대상</th>
              <th className="border-b border-line py-2 text-right font-semibold">표본</th>
            </tr>
          </thead>
          <tbody>
            {r.variants.map((v) => (
              <tr key={v.key} className="align-top">
                <td className="border-b border-line py-2 pr-3">
                  <div className="font-bold text-ink">
                    {v.label}
                    {v.isControl && (
                      <span className="ml-1 text-[10px] font-semibold text-text-3">대조군</span>
                    )}
                  </div>
                  <div className="text-[10px] text-text-3">{v.key}</div>
                </td>
                <td className="border-b border-line py-2 pr-3 text-right tabular-nums text-text-2">
                  {fmt(v.exposures)}
                </td>
                <td className="border-b border-line py-2 pr-3 text-right tabular-nums text-text-2">
                  {fmt(v.conversions)}
                </td>
                <td className="border-b border-line py-2 pr-3 text-right tabular-nums font-bold text-ink">
                  {pct(v.rate)}
                </td>
                <td className="border-b border-line py-2 pr-3 text-right tabular-nums text-text-2">
                  {fmt(v.subjects)}
                  <div className="text-[10px] text-text-3">로그인 {fmt(v.userSubjects)}</div>
                </td>
                <td className="border-b border-line py-2 text-right text-[10px] text-text-3">
                  {shortfall(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.hasEnoughSample && r.comparison ? (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-bg px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            <span className="text-text-3">
              대조군 대비{" "}
              <span className="font-extrabold text-ink">{signedPct(r.comparison.lift)}</span>
            </span>
            <span className="text-text-3">
              양측 p{" "}
              <span className="font-extrabold text-ink">
                {r.comparison.pValue === null ? "—" : r.comparison.pValue.toFixed(3)}
              </span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                r.comparison.pValue !== null && r.comparison.pValue < 0.05
                  ? "bg-primary-soft text-primary"
                  : "bg-[#eef1f5] text-text-3"
              }`}
            >
              {r.comparison.pValue !== null && r.comparison.pValue < 0.05
                ? "p < 0.05"
                : "유의하지 않음"}
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-text-3">{r.comparison.caveat}</p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-line bg-bg px-3 py-2.5">
          <div className="text-[12px] font-bold text-ink">표본 부족 — 아직 비교하지 않습니다</div>
          <p className="mt-1 text-[10px] leading-relaxed text-text-3">
            변형당 노출 {fmt(MIN_EXPOSURES_PER_VARIANT)}회 · 전환 {fmt(MIN_CONVERSIONS_PER_VARIANT)}회를
            모두 넘겨야 개선율과 p 값을 계산합니다. 그 전에 나온 차이는 대부분 우연이라, 숫자를
            띄우지 않는 편이 정확합니다.
          </p>
        </div>
      )}

      {conflicts > 0 && (
        <div className="rounded-[10px] border border-[#f0c9c9] bg-[#fdecec] px-3 py-2.5 text-[11px] text-[#a33]">
          <span className="font-bold">재배정 {fmt(conflicts)}건</span> — 같은 대상이 도중에 다른
          변형을 받았습니다. 변형 구성이나 가중치가 실험 중에 바뀐 흔적이라, 이 비교는 깨끗하지
          않습니다. 구성을 고정한 뒤 다시 시작하는 편이 낫습니다.
        </div>
      )}
    </div>
  );
}

export default async function AdminExperimentsPage() {
  const results = await loadExperimentResults().catch(() => []);

  return (
    <>
      <div className="rise-in text-[19px] font-extrabold text-white">실험 (A/B)</div>
      <div className="rise-in -mt-2 mb-1 max-w-[760px] text-[11px] leading-relaxed text-[#9aa6b8]">
        문구·버튼 라벨처럼 <b>사실 주장이 아닌 표현</b>만 실험합니다. 가격·거래 건수·면적·시세는
        사람마다 다르게 보이면 안 되므로 실험 대상이 아닙니다. 전환율의 분모는 사람 수가 아니라{" "}
        <b>노출 이벤트 수</b>입니다(같은 사람이 여러 번 볼 수 있음).
      </div>

      {results.length === 0 ? (
        <div className={`rise-in-1 ${lightCard}`}>
          <div className="text-sm font-extrabold text-ink">등록된 실험이 없습니다</div>
          <p className="text-[11px] leading-relaxed text-text-3">
            실험은 <code className="text-text-2">lib/experiments/registry.ts</code> 에 선언된 것만
            존재합니다. 코드 아무 데서나 만든 키는 서버에서 버려집니다.
          </p>
        </div>
      ) : (
        <div className="rise-in-1 flex flex-col gap-4">
          {results.map((r) => (
            <ExperimentCard key={r.def.key} r={r} />
          ))}
        </div>
      )}
    </>
  );
}
