import {
  loadExperimentResults,
  MIN_CONVERSIONS_PER_VARIANT,
  MIN_EXPOSURES_PER_VARIANT,
  type ExperimentResult,
  type VariantResult,
} from "@/lib/experiments/results";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";

/* A7 — 실험(A/B) 결과.
   사실 우선: 표본이 기준을 못 넘기면 p 값·개선율을 아예 계산하지 않고 "표본 부족"만 말한다.
   n 이 작을 때 숫자를 띄우면 숫자가 있다는 이유만으로 결론이 서 버린다.
   비율의 분모는 사람이 아니라 **노출 이벤트 수**(CTR)이고, 화면에도 그대로 적는다. */

export const dynamic = "force-dynamic";

/* 다크 셸(#12161f) 위에 라이트 토큰 카드가 떠 있던 것을 다크 카드로 통일
   (2026-08-02 감사 — 관리자 콘솔 다크 테마 규칙). */
const darkCard =
  "flex flex-col gap-3 rounded-[20px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-5";

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

/** [G011] 현재 유입 속도로 표본 기준까지 몇 주 걸리는지.
 *
 * "부족하다"와 "얼마나 더"까지는 이미 말하고 있었는데, **언제** 볼 수 있는지가
 * 없었다. 지금 트래픽(주 150PV)에서는 그 답이 대부분 "수십 주"다 — 그걸
 * 숨기면 운영자는 실험이 곧 끝날 것처럼 기다린다. 속도가 0이면 기다림이
 * 아니라 유입이 먼저라고 말한다. */
function weeksToThreshold(r: ExperimentResult): string | null {
  const worst = Math.max(
    0,
    ...r.variants.map((v) => MIN_EXPOSURES_PER_VARIANT - v.exposures),
  );
  if (worst === 0) return null; // 기준 충족 — 계산 불필요
  const first = r.firstAt ? new Date(r.firstAt).getTime() : NaN;
  const last = r.lastAt ? new Date(r.lastAt).getTime() : NaN;
  const spanDays = Number.isFinite(first) && Number.isFinite(last)
    ? Math.max(1, (last - first) / 86_400_000)
    : null;
  if (spanDays === null || r.totalExposures === 0) {
    return "현 유입으로는 도달 시점을 예측할 수 없어요 — 실험보다 유입(D트랙)이 먼저입니다.";
  }
  const perVariantWeeklyPace =
    (r.totalExposures / Math.max(1, r.variants.length)) / (spanDays / 7);
  if (perVariantWeeklyPace <= 0) {
    return "현 유입으로는 도달 시점을 예측할 수 없어요 — 실험보다 유입(D트랙)이 먼저입니다.";
  }
  const weeks = Math.ceil(worst / perVariantWeeklyPace);
  if (weeks > 52) {
    return `현재 속도로는 기준 충족까지 약 ${weeks}주(1년 이상) — 이 트래픽에서는 실험이 사실상 판정 불가입니다. 유입(D트랙)이 먼저입니다.`;
  }
  return `현재 속도 기준, 표본 기준 충족까지 약 ${weeks}주 남았습니다.`;
}

function ExperimentCard({ r }: { r: ExperimentResult }) {
  const conflicts = r.variants.reduce((s, v) => s + v.variantConflicts, 0);
  const eta = weeksToThreshold(r);

  return (
    <div className={darkCard}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[13px] font-extrabold text-white">{r.def.key}</div>
        <span
          className={`rounded-full chip-pad text-[10px] font-bold ${
            r.def.enabled
              ? "bg-primary-soft text-primary"
              : "bg-[#eef1f5] text-[#9aa6b8]"
          }`}
        >
          {r.def.enabled ? "진행 중" : "중지됨 (전원 대조군)"}
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-[#c9d2e0]">{r.def.hypothesis}</p>

      <div className="flex flex-col gap-1 rounded-[10px] bg-[rgba(255,255,255,.05)] px-3 py-2.5 text-[12px] text-[#9aa6b8]">
        <div>
          노출 이벤트 <span className="font-semibold text-[#c9d2e0]">{r.def.exposureEvent}</span> · 전환
          이벤트 <span className="font-semibold text-[#c9d2e0]">{r.def.primaryMetricEvent}</span>
        </div>
        <div>
          집계 구간 {stamp(r.firstAt)} ~ {stamp(r.lastAt)} · 총 노출 {fmt(r.totalExposures)} · 총 전환{" "}
          {fmt(r.totalConversions)}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[#9aa6b8]">
              <th className="border-b border-[rgba(255,255,255,.08)] py-2 pr-3 font-semibold">변형</th>
              <th className="border-b border-[rgba(255,255,255,.08)] py-2 pr-3 text-right font-semibold">노출</th>
              <th className="border-b border-[rgba(255,255,255,.08)] py-2 pr-3 text-right font-semibold">전환</th>
              <th className="border-b border-[rgba(255,255,255,.08)] py-2 pr-3 text-right font-semibold">
                전환율 (노출당)
              </th>
              <th className="border-b border-[rgba(255,255,255,.08)] py-2 pr-3 text-right font-semibold">배정 대상</th>
              <th className="border-b border-[rgba(255,255,255,.08)] py-2 text-right font-semibold">표본</th>
            </tr>
          </thead>
          <tbody>
            {r.variants.map((v) => (
              <tr key={v.key} className="align-top">
                <td className="border-b border-[rgba(255,255,255,.08)] py-2 pr-3">
                  <div className="font-bold text-white">
                    {v.label}
                    {v.isControl && (
                      <span className="ml-1 text-[10px] font-semibold text-[#9aa6b8]">대조군</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#9aa6b8]">{v.key}</div>
                </td>
                <td className="border-b border-[rgba(255,255,255,.08)] py-2 pr-3 text-right tabular-nums text-[#c9d2e0]">
                  {fmt(v.exposures)}
                </td>
                <td className="border-b border-[rgba(255,255,255,.08)] py-2 pr-3 text-right tabular-nums text-[#c9d2e0]">
                  {fmt(v.conversions)}
                </td>
                <td className="border-b border-[rgba(255,255,255,.08)] py-2 pr-3 text-right tabular-nums font-bold text-white">
                  {pct(v.rate)}
                </td>
                <td className="border-b border-[rgba(255,255,255,.08)] py-2 pr-3 text-right tabular-nums text-[#c9d2e0]">
                  {fmt(v.subjects)}
                  <div className="text-[10px] text-[#9aa6b8]">로그인 {fmt(v.userSubjects)}</div>
                </td>
                <td className="border-b border-[rgba(255,255,255,.08)] py-2 text-right text-[10px] text-[#9aa6b8]">
                  {shortfall(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.hasEnoughSample && r.comparison ? (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            <span className="text-[#9aa6b8]">
              대조군 대비{" "}
              <span className="font-extrabold text-white">{signedPct(r.comparison.lift)}</span>
            </span>
            <span className="text-[#9aa6b8]">
              양측 p{" "}
              <span className="font-extrabold text-white">
                {r.comparison.pValue === null ? "—" : r.comparison.pValue.toFixed(3)}
              </span>
            </span>
            <span
              className={`rounded-full chip-pad text-[10px] font-bold ${
                r.comparison.pValue !== null && r.comparison.pValue < 0.05
                  ? "bg-primary-soft text-primary"
                  : "bg-[#eef1f5] text-[#9aa6b8]"
              }`}
            >
              {r.comparison.pValue !== null && r.comparison.pValue < 0.05
                ? "p < 0.05"
                : "유의하지 않음"}
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-[#9aa6b8]">{r.comparison.caveat}</p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)] px-3 py-2.5">
          <div className="text-[12px] font-bold text-white">표본 부족 — 아직 비교하지 않습니다</div>
          <p className="mt-1 text-[10px] leading-relaxed text-[#9aa6b8]">
            변형당 노출 {fmt(MIN_EXPOSURES_PER_VARIANT)}회 · 전환 {fmt(MIN_CONVERSIONS_PER_VARIANT)}회를
            모두 넘겨야 개선율과 p 값을 계산합니다. 그 전에 나온 차이는 대부분 우연이라, 숫자를
            띄우지 않는 편이 정확합니다.
          </p>
          {eta && (
            <p className="mt-1.5 text-[12px] font-bold leading-relaxed text-[#e0a92e]">{eta}</p>
          )}
        </div>
      )}

      {conflicts > 0 && (
        <div className="rounded-[10px] border border-[#f0c9c9] bg-[#fdecec] px-3 py-2.5 text-[12px] text-[#a33]">
          <span className="font-bold">재배정 {fmt(conflicts)}건</span> — 같은 대상이 도중에 다른
          변형을 받았습니다. 변형 구성이나 가중치가 실험 중에 바뀐 흔적이라, 이 비교는 깨끗하지
          않습니다. 구성을 고정한 뒤 다시 시작하는 편이 낫습니다.
        </div>
      )}
    </div>
  );
}

export default async function AdminExperimentsPage() {
  /* 2026-07-26: `.catch(() => [])` 였다. 조회가 실패하면 "등록된 실험이 없습니다"
     라고 단정해서, 돌아가고 있는 실험을 없는 것으로 읽게 만든다. */
  const loaded = await loadExperimentResults().then(
    (results) => ({ ok: true as const, results }),
    (err: unknown) => {
      logger.error("[admin/experiments] 실험 결과 조회 실패", err);
      return {
        ok: false as const,
        cause: err instanceof Error ? err.message : String(err),
      };
    },
  );
  const results = loaded.ok ? loaded.results : [];

  return (
    <>
      <div className="rise-in text-[19px] font-extrabold text-white">실험 (A/B)</div>
      <div className="rise-in -mt-2 mb-1 max-w-[760px] text-[12px] leading-relaxed text-[#9aa6b8]">
        문구·버튼 라벨처럼 <b>사실 주장이 아닌 표현</b>만 실험합니다. 가격·거래 건수·면적·시세는
        사람마다 다르게 보이면 안 되므로 실험 대상이 아닙니다. 전환율의 분모는 사람 수가 아니라{" "}
        <b>노출 이벤트 수</b>입니다(같은 사람이 여러 번 볼 수 있음).
      </div>

      {!loaded.ok ? (
        <ErrorState
          tone="admin"
          className="rise-in-1"
          title="실험 결과를 지금 불러오지 못했어요"
          desc="실험이 0개인 게 아니라 집계 조회가 실패했습니다. 잠시 후 새로고침해 주세요."
          cause={loaded.cause}
        />
      ) : results.length === 0 ? (
        <div className={`rise-in-1 ${darkCard}`}>
          <div className="text-[13px] font-extrabold text-white">등록된 실험이 없습니다</div>
          <p className="text-[12px] leading-relaxed text-[#9aa6b8]">
            실험은 <code className="text-[#c9d2e0]">lib/experiments/registry.ts</code> 에 선언된 것만
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
