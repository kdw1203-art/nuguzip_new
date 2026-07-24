import { getGeocodeProgress } from "@/lib/map/complex-geocode";
import { loadDataFreshness, loadIngestSourceSummary } from "@/lib/admin/data-freshness";
import type { FreshnessRow, FreshnessStatus } from "@/lib/admin/data-freshness";
import { GeocodeRunButton } from "./GeocodeRunButton";
import { CronRunPanel } from "./CronRunPanel";
import { UploadPanel } from "./UploadPanel";
import { RebCatalogPanel } from "./RebCatalogPanel";

/*
 * 데이터 관리 (F1·F2·F3)
 *  - 데이터셋별 신선도: 행 수 · 데이터 기준 시점 · 마지막 쓰기 · 경과일 (전부 실집계)
 *  - 소스별 최근 적재 로그 (market_ingest_log)
 *  - 수동 업로드 / 수집 작업 실행 / R-ONE 카탈로그 조회
 *
 * 이전 버전은 "최근 실거래 반영" 이라는 라벨 아래 REB 지수 적재 시각을 보여줬다.
 * 라벨과 값이 어긋나 잘못된 판단을 유도하므로 테이블별 실집계로 대체했다.
 */

export const dynamic = "force-dynamic";

const card =
  "flex flex-col gap-3 rounded-2xl border border-[rgba(255,255,255,.06)] bg-[#12161f] p-5";

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

const STATUS_META: Record<FreshnessStatus, { label: string; color: string; bg: string }> = {
  fresh: { label: "최신", color: "#4ade80", bg: "rgba(74,222,128,.14)" },
  aging: { label: "지연", color: "#f2c94c", bg: "rgba(242,201,76,.14)" },
  stale: { label: "정체", color: "#f87171", bg: "rgba(248,113,113,.14)" },
  empty: { label: "비어있음", color: "#9aa6b8", bg: "rgba(154,166,184,.14)" },
  unknown: { label: "확인불가", color: "#9aa6b8", bg: "rgba(154,166,184,.14)" },
};

function StatusChip({ status }: { status: FreshnessStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="rounded px-1.5 py-px text-[9.5px] font-bold"
      style={{ color: m.color, background: m.bg }}
    >
      {m.label}
    </span>
  );
}

function lagText(row: FreshnessRow): string {
  if (row.rows === 0) return "—";
  if (row.lagDays == null) return "기록 없음";
  if (row.lagDays === 0) return "오늘";
  return `${fmt(row.lagDays)}일 전`;
}

export default async function AdminDataPage() {
  const [geo, freshness, ingest] = await Promise.all([
    getGeocodeProgress().catch(() => null),
    loadDataFreshness().catch(() => [] as FreshnessRow[]),
    loadIngestSourceSummary().catch(() => []),
  ]);

  const ok = geo?.ok ?? 0;
  const total = geo?.total ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((ok / total) * 100)) : 0;

  const counts = freshness.reduce<Record<FreshnessStatus, number>>(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { fresh: 0, aging: 0, stale: 0, empty: 0, unknown: 0 },
  );
  const totalRows = freshness.reduce((a, r) => a + r.rows, 0);

  return (
    <>
      <div className="rise-in text-[19px] font-extrabold text-white">데이터 관리</div>
      <div className="rise-in -mt-2 mb-1 text-[11px] text-[#9aa6b8]">
        데이터셋별 신선도·적재 로그와 수동 수집 도구입니다. 표시되는 수치는 모두 DB 실집계입니다.
      </div>

      {/* 요약 */}
      <div className="rise-in-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "총 적재 행", value: fmt(totalRows), color: "#ffffff" },
          { label: "최신", value: `${counts.fresh}개 데이터셋`, color: "#4ade80" },
          { label: "지연·정체", value: `${counts.aging + counts.stale}개`, color: "#f2c94c" },
          { label: "비어있음", value: `${counts.empty}개`, color: "#9aa6b8" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-[rgba(255,255,255,.06)] bg-[#12161f] px-4 py-3.5"
          >
            <div className="text-[10px] text-[#9aa6b8]">{s.label}</div>
            <div className="mt-0.5 text-[17px] font-extrabold" style={{ color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* 데이터셋 신선도 */}
      <div className={`rise-in-2 ${card}`}>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-extrabold text-white">데이터셋 신선도</span>
          <span className="text-[11px] text-[#9aa6b8]">테이블별 실집계</span>
        </div>

        {freshness.length === 0 ? (
          <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] px-4 py-6 text-center text-[11.5px] text-[#9aa6b8]">
            Supabase 연결이 없어 집계를 표시할 수 없습니다.
          </div>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[11.5px]">
              <thead>
                <tr className="text-left text-[10px] text-[#9aa6b8]">
                  <th className="px-2 py-2 font-semibold">데이터셋</th>
                  <th className="px-2 py-2 text-right font-semibold">행 수</th>
                  <th className="px-2 py-2 font-semibold">데이터 기준</th>
                  <th className="px-2 py-2 font-semibold">마지막 적재</th>
                  <th className="px-2 py-2 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody>
                {freshness.map((r) => (
                  <tr key={r.key} className="border-t border-[rgba(255,255,255,.05)]">
                    <td className="px-2 py-2.5">
                      <div className="font-bold text-white">{r.label}</div>
                      <div className="text-[10px] text-[#9aa6b8]">
                        {r.source} · <code className="text-[#6b7688]">{r.table}</code>
                        {r.sampleRows ? (
                          <span className="ml-1 text-[#f2c94c]">예시 {fmt(r.sampleRows)}건 포함</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right font-bold tabular-nums text-white">
                      {fmt(r.rows)}
                    </td>
                    <td className="px-2 py-2.5 text-[#c7d0de]">{r.dataAsOf ?? "—"}</td>
                    <td className="px-2 py-2.5">
                      <span className="text-[#c7d0de]">{lagText(r)}</span>
                      <span className="ml-1 text-[10px] text-[#6b7688]">
                        (기대 {r.expectedDays}일)
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <StatusChip status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[10px] leading-relaxed text-[#9aa6b8]">
          &ldquo;데이터 기준&rdquo; 은 계약월·기준월처럼 데이터 자체의 시점, &ldquo;마지막
          적재&rdquo; 는 테이블에 마지막으로 쓴 시각입니다. 둘은 다를 수 있어요(예: 오늘 적재한
          지난달 실거래). 상태는 마지막 적재 경과일이 기대 주기를 넘겼는지로만 판정합니다.
        </div>
      </div>

      <div className="rise-in-2 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 지오코딩 진행률 */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">단지 좌표 지오코딩</span>
            <span className="text-[11px] text-[#9aa6b8]">네이버(NCP)</span>
          </div>

          <div className="flex items-end gap-2">
            <span className="text-[26px] font-extrabold text-[#7ea2ff]">{fmt(ok)}</span>
            <span className="mb-1 text-[12px] text-[#9aa6b8]">
              / {fmt(total)} 단지 · {pct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,.08)]">
            <span className="block h-full rounded-full bg-[#7ea2ff]" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-4 text-[11px] text-[#9aa6b8]">
            <span>
              성공 <b className="text-[#4ade80]">{fmt(ok)}</b>
            </span>
            <span>
              실패 <b className="text-[#f2c94c]">{fmt(geo?.notfound ?? 0)}</b>
            </span>
            <span>
              남음 <b className="text-white">{fmt(Math.max(0, total - (geo?.cached ?? 0)))}</b>
            </span>
          </div>

          <GeocodeRunButton configured={geo?.configured ?? false} />
        </div>

        {/* 소스별 최근 적재 로그 */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">최근 적재 로그</span>
            <span className="text-[11px] text-[#9aa6b8]">market_ingest_log</span>
          </div>
          {ingest.length === 0 ? (
            <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] px-4 py-6 text-center text-[11.5px] text-[#9aa6b8]">
              적재 로그가 아직 없습니다.
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto rounded-xl border border-[rgba(255,255,255,.07)]">
              {ingest.slice(0, 40).map((r) => (
                <div
                  key={`${r.source}|${r.dataset}`}
                  className="flex items-center justify-between gap-3 border-b border-[rgba(255,255,255,.05)] px-3 py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <code className="text-[10px] text-[#7ea2ff]">{r.source}</code>
                      <span className="truncate text-[11.5px] text-white">{r.dataset}</span>
                    </div>
                    <div className="text-[10px] text-[#9aa6b8]">
                      {r.origin} · {r.rows > 0 ? `${fmt(r.rows)}행` : "0행"} ·{" "}
                      {r.lagDays === 0 ? "오늘" : `${fmt(r.lagDays)}일 전`}
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded px-1.5 py-px text-[9.5px] font-bold"
                    style={
                      r.status === "ok"
                        ? { color: "#4ade80", background: "rgba(74,222,128,.14)" }
                        : r.status === "error"
                          ? { color: "#f87171", background: "rgba(248,113,113,.14)" }
                          : { color: "#9aa6b8", background: "rgba(154,166,184,.14)" }
                    }
                  >
                    {r.status === "ok" ? "성공" : r.status === "error" ? "오류" : "건너뜀"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="text-[10px] leading-relaxed text-[#9aa6b8]">
            소스·데이터셋별 가장 최근 1건입니다. &ldquo;건너뜀&rdquo; 은 대개 해당 공공 API
            인증키가 없어 수집이 일어나지 않은 경우예요.
          </div>
        </div>
      </div>

      <div className="rise-in-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 수동 업로드 */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">수동 업로드</span>
            <span className="text-[11px] text-[#9aa6b8]">CSV · XLSX · ZIP</span>
          </div>
          <UploadPanel />
        </div>

        {/* 수집 작업 실행 */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">수집 작업 실행</span>
            <span className="text-[11px] text-[#9aa6b8]">즉시 1회</span>
          </div>
          <CronRunPanel />
        </div>
      </div>

      {/* R-ONE 카탈로그 */}
      <div className={`rise-in-3 ${card}`}>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-extrabold text-white">R-ONE 통계표 카탈로그</span>
          <span className="text-[11px] text-[#9aa6b8]">조회 전용</span>
        </div>
        <RebCatalogPanel />
      </div>
    </>
  );
}
