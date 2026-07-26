import { getGeocodeProgress } from "@/lib/map/complex-geocode";
import {
  loadDataFreshness,
  loadIngestSourceSummary,
  OUTCOME_COLOR,
  OUTCOME_LABEL,
  tallyText,
} from "@/lib/admin/data-freshness";
import type {
  FreshnessRow,
  FreshnessStatus,
  IngestOutcome,
  IngestSourceSummary,
} from "@/lib/admin/data-freshness";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";
import { GeocodeRunButton } from "./GeocodeRunButton";
import { CronRunPanel } from "./CronRunPanel";
import { UploadPanel } from "./UploadPanel";
import { RebCatalogPanel } from "./RebCatalogPanel";

/*
 * 데이터 관리 (F1·F2·F3)
 *  - 데이터셋별 신선도: 행 수 · 데이터 기준 시점 · 마지막 신규 행 · 마지막 수집 결과 (전부 실집계)
 *  - 소스별 최근 적재 로그 (market_ingest_log)
 *  - 수동 업로드 / 수집 작업 실행 / R-ONE 카탈로그 조회
 *
 * 이전 버전은 "최근 실거래 반영" 이라는 라벨 아래 REB 지수 적재 시각을 보여줬다.
 * 라벨과 값이 어긋나 잘못된 판단을 유도하므로 테이블별 실집계로 대체했다.
 *
 * #148 에서 다시 한 번: "마지막 적재" 로 쓰던 max(updated_at) 은 백필 UPDATE 에도
 * 오늘로 올라간다(2026-07-25 실측 — 신규 행 02:59 vs 쓰기 04:26, 그 사이에 들어온
 * 실거래는 0건). 그리고 부분 실패(2,096행 적재 + 시군구 13곳 실패)를 표현할 칸이
 * 없어서 빨간 "오류" 한 칸으로 뭉개고 있었다. 둘 다 아래에서 분리해 보여준다.
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

/* 부분 실패는 초록도 빨강도 아니다 — 주황으로 따로 둔다(OUTCOME_COLOR.partial).
   초록으로 칠하면 장애를 놓치고, 빨강으로 칠하면 "아무것도 안 들어왔다" 로 읽혀서
   둘 다 사실과 다르다.

   색은 lib/market/ingest-outcome 의 OUTCOME_COLOR 하나만 쓴다. 배경은 같은 색을
   옅게 깐 것뿐이라 rgba 를 따로 적어 두면 나중에 한쪽만 고쳐져 어긋난다. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

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

function OutcomeChip({ outcome }: { outcome: IngestOutcome }) {
  const color = OUTCOME_COLOR[outcome];
  return (
    <span
      className="rounded px-1.5 py-px text-[9.5px] font-bold"
      style={{ color, background: tint(color, 0.15) }}
    >
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

function lagText(row: FreshnessRow): string {
  /* rows 가 null 이면 행 수를 못 읽은 것이다 — 경과일도 믿을 수 없으니 같이 비운다. */
  if (row.rows == null) return "—";
  if (row.rows === 0) return "—";
  if (row.lagDays == null) return "기록 없음";
  if (row.lagDays === 0) return "오늘";
  return `${fmt(row.lagDays)}일 전`;
}

/** 서버에서 렌더하므로 표준시를 못 박는다 — 운영자가 보는 시계는 KST 다. */
const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function clock(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${KST.format(d)} KST`;
}

function relDays(lagDays: number | null): string {
  if (lagDays == null) return "기록 없음";
  if (lagDays === 0) return "오늘";
  return `${fmt(lagDays)}일 전`;
}

/** 마지막 수집 한 줄 요약 — 행 수와 조각 집계 중 실제로 있는 것만 붙인다. */
function runDetail(run: NonNullable<FreshnessRow["ingest"]>): string {
  const parts = [`${fmt(run.rows)}행`];
  const t = tallyText(run.tally);
  if (t) parts.push(t);
  return parts.join(" · ");
}

export default async function AdminDataPage() {
  /* 2026-07-26: 신선도·적재 로그가 `.catch(() => [])` 였다. 이 화면 머리말은
     "표시되는 수치는 모두 DB 실집계입니다" 라고 못 박고 있는데, 조회가 실패하면
     "총 적재 행 0 · 최신 0개 데이터셋 · 부분 실패 0건 · 0건" 이라는 **초록으로
     보이는 전면 0 화면**이 뜬다. 데이터 파이프라인이 통째로 죽었을 때 가장 먼저
     열어 보는 화면이 그 사고를 "이상 없음" 으로 그리는 셈이다. 실패는 실패로 쓴다. */
  const settle = <T,>(p: Promise<T>, tag: string) =>
    p.then(
      (value) => ({ ok: true as const, value }),
      (err: unknown) => {
        logger.error(`[admin/data] ${tag} 조회 실패`, err);
        return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
      },
    );

  const [geo, freshnessLoaded, ingestLoaded] = await Promise.all([
    getGeocodeProgress().catch(() => null),
    settle(loadDataFreshness(), "데이터셋 신선도"),
    settle(loadIngestSourceSummary(), "적재 로그"),
  ]);
  const freshness: FreshnessRow[] = freshnessLoaded.ok ? freshnessLoaded.value : [];
  const ingest: IngestSourceSummary[] = ingestLoaded.ok ? ingestLoaded.value : [];
  const summaryReady = freshnessLoaded.ok && ingestLoaded.ok;

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
  /* 행 수를 못 읽은 테이블은 합계에서 빠진다 — 그래서 합계는 "최소 이만큼" 이지
     정확한 총합이 아니다. 그 사실을 라벨에 적는다(0 으로 채워 넣지 않는다). */
  const rowsUnknownCount = freshness.filter((r) => r.rows == null).length;
  const totalRows = freshness.reduce((a, r) => a + (r.rows ?? 0), 0);

  /* 요약 카드에 "부분 실패" 를 세운다 — 이 숫자가 0이 아니면 데이터는 들어왔지만
     일부 구간이 비어 있다는 뜻이고, 그건 초록 화면 뒤에 숨으면 안 되는 사실이다. */
  const troubled = ingest.filter((r) => r.outcome === "partial" || r.outcome === "failed");
  const partialCount = ingest.filter((r) => r.outcome === "partial").length;
  const failedCount = ingest.filter((r) => r.outcome === "failed").length;

  return (
    <>
      <div className="rise-in text-[19px] font-extrabold text-white">데이터 관리</div>
      <div className="rise-in -mt-2 mb-1 text-[11px] text-[#9aa6b8]">
        데이터셋별 신선도·적재 로그와 수동 수집 도구입니다.{" "}
        {summaryReady
          ? "표시되는 수치는 모두 DB 실집계입니다."
          : "지금은 일부 집계를 불러오지 못해 아래 수치가 불완전합니다 — 실패한 칸은 “—”로 표시했습니다."}
      </div>

      {/* 요약 */}
      <div className="rise-in-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          /* 집계에 실패한 칸은 0 이 아니라 "—" 다 — 0 으로 쓰면 "이상 없음" 으로 읽힌다. */
          {
            label:
              freshnessLoaded.ok && rowsUnknownCount > 0
                ? `총 적재 행 (${rowsUnknownCount}개 집계 실패)`
                : "총 적재 행",
            value: freshnessLoaded.ok
              ? rowsUnknownCount > 0
                ? `${fmt(totalRows)}+`
                : fmt(totalRows)
              : "—",
            color: "#ffffff",
          },
          {
            label: "최신",
            value: freshnessLoaded.ok ? `${counts.fresh}개 데이터셋` : "—",
            color: freshnessLoaded.ok ? "#4ade80" : "#9aa6b8",
          },
          {
            label: "지연·정체",
            value: freshnessLoaded.ok ? `${counts.aging + counts.stale}개` : "—",
            color: freshnessLoaded.ok ? "#f2c94c" : "#9aa6b8",
          },
          {
            label: "마지막 수집 부분 실패·실패",
            value: ingestLoaded.ok ? `${partialCount}건 · ${failedCount}건` : "—",
            color: ingestLoaded.ok && partialCount + failedCount > 0 ? "#fb923c" : "#9aa6b8",
          },
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

      {/* 부분 실패 배너 — 요약 숫자만으로는 어느 소스인지 알 수 없어서 한 줄 더 준다 */}
      {troubled.length > 0 && (
        <div className="rise-in-1 rounded-2xl border border-[rgba(251,146,60,.28)] bg-[rgba(251,146,60,.08)] px-4 py-3">
          <div className="text-[11.5px] font-bold text-[#fb923c]">
            마지막 수집에서 문제가 있었던 소스 {troubled.length}건
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {troubled.map((r) => (
              <li key={`${r.source}|${r.dataset}`} className="text-[11px] text-[#c7d0de]">
                <code className="text-[#fb923c]">{r.source}</code> {r.dataset} —{" "}
                {OUTCOME_LABEL[r.outcome]} · {fmt(r.rows)}행 적재
                {tallyText(r.tally) ? ` · ${tallyText(r.tally)}` : ""}
              </li>
            ))}
          </ul>
          <div className="mt-1.5 text-[10px] leading-relaxed text-[#9aa6b8]">
            &ldquo;부분 실패&rdquo; 는 일부 행은 실제로 들어왔다는 뜻입니다. 화면에 보이는 수치는
            사실이지만 해당 구간의 커버리지가 비어 있을 수 있어요.
          </div>
        </div>
      )}

      {/* 데이터셋 신선도 */}
      <div className={`rise-in-2 ${card}`}>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-extrabold text-white">데이터셋 신선도</span>
          <span className="text-[11px] text-[#9aa6b8]">테이블별 실집계</span>
        </div>

        {!freshnessLoaded.ok ? (
          <ErrorState
            tone="admin"
            title="데이터셋 신선도를 지금 불러오지 못했어요"
            desc="집계가 0인 게 아니라 조회 자체가 실패했습니다. 이 화면의 요약 숫자도 함께 믿지 마세요."
            cause={freshnessLoaded.cause}
          />
        ) : freshness.length === 0 ? (
          <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] px-4 py-6 text-center text-[11.5px] text-[#9aa6b8]">
            Supabase 연결이 없어 집계를 표시할 수 없습니다.
          </div>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[11.5px]">
              <thead>
                <tr className="text-left text-[10px] text-[#9aa6b8]">
                  <th className="px-2 py-2 font-semibold">데이터셋</th>
                  <th className="px-2 py-2 text-right font-semibold">행 수</th>
                  <th className="px-2 py-2 font-semibold">데이터 기준</th>
                  <th className="px-2 py-2 font-semibold">마지막 신규 행</th>
                  <th className="px-2 py-2 font-semibold">마지막 수집</th>
                  <th className="px-2 py-2 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody>
                {freshness.map((r) => {
                  const writeClock = clock(r.lastWriteAt);
                  const insertClock = clock(r.lastInsertAt);
                  /* 백필로 쓰기 시각만 올라간 경우를 눈에 보이게 한다 */
                  const writeDiffers =
                    Boolean(r.lastInsertAt && r.lastWriteAt) && r.lastInsertAt !== r.lastWriteAt;
                  return (
                    <tr key={r.key} className="border-t border-[rgba(255,255,255,.05)]">
                      <td className="px-2 py-2.5 align-top">
                        <div className="font-bold text-white">{r.label}</div>
                        <div className="text-[10px] text-[#9aa6b8]">
                          {r.source} · <code className="text-[#6b7688]">{r.table}</code>
                          {r.sampleRows ? (
                            <span className="ml-1 text-[#f2c94c]">
                              예시 {fmt(r.sampleRows)}건 포함
                            </span>
                          ) : null}
                        </div>
                        {r.note ? (
                          <div className="mt-0.5 text-[9.5px] leading-snug text-[#6b7688]">
                            {r.note}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5 text-right align-top font-bold tabular-nums text-white">
                        {/* null = 집계 실패. 0 으로 그리면 "빈 테이블" 로 읽힌다. */}
                        {r.rows == null ? (
                          <span className="text-[#9aa6b8]" title="행 수 집계에 실패했습니다">
                            —
                          </span>
                        ) : (
                          fmt(r.rows)
                        )}
                      </td>
                      <td className="px-2 py-2.5 align-top text-[#c7d0de]">{r.dataAsOf ?? "—"}</td>
                      <td className="px-2 py-2.5 align-top">
                        <span className="text-[#c7d0de]">{lagText(r)}</span>
                        <span className="ml-1 text-[10px] text-[#6b7688]">
                          (기대 {r.expectedDays}일)
                        </span>
                        <div className="text-[9.5px] text-[#6b7688]">
                          {r.lagBasis === "insert"
                            ? insertClock
                              ? `신규 행 ${insertClock}`
                              : "신규 행 기록 없음"
                            : writeClock
                              ? `쓰기 ${writeClock} · 신규 행 시각 컬럼 없음`
                              : "쓰기 기록 없음"}
                        </div>
                        {writeDiffers && (
                          <div className="text-[9.5px] text-[#fb923c]">
                            쓰기 {writeClock} — 수집이 아닌 갱신
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        {r.ingest ? (
                          <>
                            <OutcomeChip outcome={r.ingest.outcome} />
                            <div className="mt-0.5 text-[9.5px] text-[#9aa6b8]">
                              {relDays(r.ingest.lagDays)} · {runDetail(r.ingest)}
                            </div>
                          </>
                        ) : (
                          <span className="text-[10px] text-[#6b7688]">수집 로그 없음</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        <StatusChip status={r.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[10px] leading-relaxed text-[#9aa6b8]">
          &ldquo;데이터 기준&rdquo; 은 계약월·기준월처럼 데이터 자체의 시점입니다. &ldquo;마지막
          신규 행&rdquo; 은 테이블에 <b className="text-[#c7d0de]">새 행이 들어온</b> 시각이고,
          기존 행을 고치기만 한 UPDATE 는 여기에 반영되지 않습니다 — 백필 한 번에 모든 데이터셋이
          &ldquo;오늘&rdquo; 로 보이는 일을 막기 위해서예요. created_at 이 없는 테이블은 쓰기
          시각으로 대신 재고, 그 사실을 각 줄에 적어 뒀습니다. &ldquo;마지막 수집&rdquo; 은
          market_ingest_log 에 남은 그 소스의 최근 실행 결과입니다.
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
          {!ingestLoaded.ok ? (
            <ErrorState
              tone="admin"
              title="적재 로그를 지금 불러오지 못했어요"
              desc="로그가 없는 게 아니라 조회 자체가 실패했습니다. 수집이 돌았는지 여부를 이 화면으로 판단하지 마세요."
              cause={ingestLoaded.cause}
            />
          ) : ingest.length === 0 ? (
            <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] px-4 py-6 text-center text-[11.5px] text-[#9aa6b8]">
              적재 로그가 아직 없습니다.
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto rounded-xl border border-[rgba(255,255,255,.07)]">
              {ingest.slice(0, 40).map((r) => (
                <div
                  key={`${r.source}|${r.dataset}`}
                  className="flex items-start justify-between gap-3 border-b border-[rgba(255,255,255,.05)] px-3 py-2 last:border-0"
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
                    {tallyText(r.tally) ? (
                      <div className="text-[10px] text-[#fb923c]">{tallyText(r.tally)}</div>
                    ) : r.message ? (
                      <div className="truncate text-[10px] text-[#6b7688]">{r.message}</div>
                    ) : null}
                  </div>
                  <span className="shrink-0">
                    <OutcomeChip outcome={r.outcome} />
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="text-[10px] leading-relaxed text-[#9aa6b8]">
            소스·데이터셋별 가장 최근 1건입니다. &ldquo;건너뜀&rdquo; 은 대개 해당 공공 API
            인증키가 없어 수집이 일어나지 않은 경우예요. &ldquo;부분 실패&rdquo; 는 일부 행은
            들어왔지만 일부 조각이 실패했다는 뜻이고, &ldquo;새 데이터 없음&rdquo; 은 정상
            실행이었지만 새로 들어온 행이 0건이라는 뜻입니다.
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
