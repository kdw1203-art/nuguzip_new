import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { PageShell } from "../../components/PageShell";
import { QaBlock } from "../../components/QaBlock";
import { CitationBlock } from "../../components/CitationBlock";
import {
  listLatestTemperatures,
  type TemperatureLatest,
} from "@/lib/market/temperature-archive";
import { formatWeekKorean } from "@/lib/market/temperature";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";

/* ============================================================
   N11 — 시장 온도 주간 기록 허브 (/analysis/temperature)

   /analysis/timing 은 "지금 이 순간의 온도" 하나만 보여 준다. 사람이 실제로
   알고 싶어 하는 문장은 "지금 62점"이 아니라 "3주 연속 오르고 있다" 쪽인데,
   시계열이 없으면 그 문장은 지어내는 수밖에 없다. 그래서 매주 값을 저장하고
   (public.market_temperature_snapshot) 이 허브가 그 기록의 입구가 된다.

   ── 저장값의 정의를 화면에 그대로 적는다 ───────────────────────────
   크론은 하루 두 번 도는데 키가 (지역, 그 주의 월요일)이라 같은 주의 행을
   계속 덮어쓴다. 그러니 저장된 값은 "그 주의 평균"도 "월요일의 값"도 아니라
   **그 주에 마지막으로 관측한 값**이다. 정의를 숨기면 숫자가 실제보다 정밀한
   것처럼 읽힌다 — 그래서 본문과 Q&A 양쪽에 적는다.

   ── 세 상태를 나눠 렌더하는 이유 ───────────────────────────────────
   /complex/compare 와 같은 규칙이다. 이 허브는 revalidate 가 있고 동적
   파라미터가 없어 `next build` 가 빌드 타임에 프리렌더하는데, CI 빌드 환경엔
   SUPABASE_SERVICE_ROLE_KEY 가 없다. 여기서 던지면 빌드가 깨진다.
     1) 정상 — 지역별 최신 주 점수 + 지난주 대비
     2) 조회 실패 — 그렇게 말하고 noindex
     3) 정말로 0주 — "아직 쌓인 주가 없다" (첫 크론 실행 전에는 이게 사실이다)
   2와 3을 같은 문장으로 처리하면 실패를 "데이터 없음"으로 위장하게 된다.
   ============================================================ */

export const revalidate = 3600;

const PATH = "/analysis/temperature";

type HubData = {
  weekStart: string | null;
  rows: TemperatureLatest[];
  /** 조회 자체가 실패한 사유. null 이면 "읽었고 결과가 이만큼"이라는 뜻. */
  loadError: string | null;
};

const loadHub = cache(async (): Promise<HubData> => {
  try {
    const { weekStart, rows } = await listLatestTemperatures();
    return { weekStart, rows, loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      "[/analysis/temperature] 주간 기록을 읽지 못했습니다 — 기록이 없는 것이 아니라 조회가 실패했습니다:",
      message,
    );
    return { weekStart: null, rows: [], loadError: message };
  }
});

/** 점수 밴드 색 — /analysis/timing 의 온도 막대와 같은 눈금을 쓴다. */
function scoreTone(score: number): { bg: string; fg: string } {
  if (score >= 65) return { bg: "rgba(220, 38, 38, 0.10)", fg: "#dc2626" };
  if (score >= 55) return { bg: "rgba(234, 88, 12, 0.10)", fg: "#ea580c" };
  if (score >= 45) return { bg: "var(--primary-soft)", fg: "var(--primary)" };
  if (score >= 35) return { bg: "rgba(2, 132, 199, 0.10)", fg: "#0284c7" };
  return { bg: "rgba(37, 99, 235, 0.10)", fg: "#2563eb" };
}

export async function generateMetadata(): Promise<Metadata> {
  const { weekStart, rows, loadError } = await loadHub();
  const description =
    rows.length > 0 && weekStart
      ? `${formatWeekKorean(weekStart)} 주 기준 ${rows.length}개 지역의 시장 온도(0~100)를 지난주와 나란히 봅니다. 매매가격지수 모멘텀과 실거래 거래량 추이로 계산하며, 매주 기록을 남겨 추세를 확인할 수 있습니다.`
      : "지역별 시장 온도(0~100)를 매주 기록해 추세를 확인합니다. 매매가격지수 모멘텀과 국토교통부 실거래 거래량 추이로만 계산하며, 근거가 없는 지역은 점수를 만들지 않습니다.";
  return {
    title: "지역별 시장 온도 주간 기록 | 누구집",
    description,
    alternates: seoAlternates(PATH),
    // 조회가 실패한 상태의 껍데기를 색인시키지 않는다. 다음 재검증에서 성공하면 사라진다.
    ...(loadError ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: "지역별 시장 온도 주간 기록 | 누구집",
      description,
      url: `https://nuguzip.com${PATH}`,
      type: "website",
    },
  };
}

export default async function TemperatureHubPage() {
  const { weekStart, rows, loadError } = await loadHub();

  const weekLabel = weekStart ? formatWeekKorean(weekStart) : null;
  const hottest = rows[0] ?? null;
  const coldest = rows.length > 0 ? rows[rows.length - 1] : null;
  const rising = rows.filter((r) => r.previous && r.current.score > r.previous.score).length;
  const falling = rows.filter((r) => r.previous && r.current.score < r.previous.score).length;
  const compared = rows.filter((r) => r.previous).length;

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "AI 분석", url: "/analysis" },
    { name: "시장 온도 주간 기록", url: PATH },
  ]);

  const qa: FaqItem[] = [
    {
      q: "시장 온도는 어떻게 계산하나요?",
      a: "50점을 중립으로 두고, 한국부동산원 아파트 매매가격지수의 최근 3개월 평균 변동률(±25점)과 국토교통부 실거래 월별 거래량의 최근 구간 대비 직전 구간 증감(±25점)을 더해 0~100으로 나타냅니다. 거래량은 신고 지연이 있는 이번 달을 빼고 완결월이 4개 이상일 때만 반영하며, 그렇지 못한 지역은 지수 모멘텀만으로 계산했다고 각 지역 페이지에 표시합니다. 지수 시계열 자체가 4구간 미만이면 점수를 만들지 않습니다.",
    },
    {
      q: "여기 적힌 점수는 그 주의 평균인가요?",
      a: "아닙니다. 기록의 키는 그 주(한국시간 기준)의 월요일이고, 값은 그 주에 마지막으로 관측한 온도입니다. 수집 작업이 하루 두 번 돌면서 같은 주의 값을 계속 갱신하고, 주가 넘어가면 그 값이 그대로 굳습니다. 주간 평균이나 월요일 시점의 값으로 읽으시면 실제보다 정밀한 숫자로 오해하게 됩니다.",
    },
    {
      q: "점수가 높으면 지금 사야 한다는 뜻인가요?",
      a: "아닙니다. 시장 온도는 가격과 거래량이 어느 방향으로 얼마나 움직이고 있는지를 하나의 눈금으로 요약한 관측값일 뿐, 매수·매도 권유가 아닙니다. 같은 점수라도 지수 모멘텀에서 온 것인지 거래량에서 온 것인지에 따라 의미가 다르므로, 각 지역 페이지에서 입력값을 함께 확인해 주세요.",
    },
    {
      q: "왜 어떤 지역은 목록에 없나요?",
      a: "해당 지역의 매매가격지수 시계열이 4구간 미만이라 추세 판정 자체가 성립하지 않거나, 아직 그 지역의 주간 기록이 쌓이지 않은 경우입니다. 근거가 없는 지역에 점수를 만들어 붙이지 않습니다.",
    },
  ];

  return (
    <PageShell breadcrumb="홈 › AI 분석 › 시장 온도 주간 기록" title="지역별 시장 온도 주간 기록">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        매매가격지수 모멘텀과 실거래 거래량 추이를 0~100 눈금으로 합쳐 매주 기록합니다.
        {rows.length > 0 && weekLabel && (
          <>
            {" "}
            가장 최근 기록은 <strong className="text-ink">{weekLabel}</strong>이 속한 주이며,{" "}
            <strong className="text-ink">{rows.length}개 지역</strong>이 담겨 있습니다
            {compared > 0 && (
              <>
                {" "}
                (지난주와 비교 가능한 {compared}개 중 <strong className="text-ink">{rising}곳
                상승</strong> · {falling}곳 하락)
              </>
            )}
            .
          </>
        )}{" "}
        50점이 중립이고, 매수·매도 권유가 아닙니다.
      </p>

      {loadError ? (
        <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
          <p className="py-8 text-center text-[13px] leading-[1.7] text-text-3">
            주간 기록을 <strong className="text-ink">불러오지 못했습니다</strong>.
            <br />
            기록이 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻입니다. 잠시 후 다시 확인해
            주세요.
          </p>
        </section>
      ) : rows.length === 0 ? (
        <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
          <p className="py-8 text-center text-[13px] leading-[1.7] text-text-3">
            아직 쌓인 주가 없습니다.
            <br />
            주간 기록은 매일 도는 수집 작업이 그 주의 값을 갱신하며 만들어집니다. 첫 기록이
            생기면 이곳에 나타납니다.
            <br />
            <Link href="/analysis/timing" className="font-bold text-primary underline">
              지금 이 순간의 시장 온도 보기
            </Link>
          </p>
        </section>
      ) : (
        <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
          <h2 className="flex items-baseline justify-between gap-3 text-[15px] font-extrabold text-ink">
            {weekLabel} 주 기준
            <span className="shrink-0 text-[11px] font-medium text-text-3">
              온도 높은 순 · {rows.length}개 지역
            </span>
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rows.map(({ current, previous }) => {
              const tone = scoreTone(current.score);
              const diff = previous ? current.score - previous.score : null;
              return (
                <Link
                  key={current.regionId}
                  href={`${PATH}/${current.regionId}`}
                  className="card-hover flex items-center gap-3 rounded-[10px] border border-border px-3 py-2.5"
                >
                  <span
                    className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] text-[15px] font-extrabold"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {current.score}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold leading-[1.5] text-ink">
                      {current.regionLabel}
                    </span>
                    <span className="block truncate text-[11px] text-text-3">
                      {current.headline}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-bold"
                    style={{
                      color:
                        diff === null || diff === 0
                          ? "var(--text-3)"
                          : diff > 0
                            ? "#dc2626"
                            : "#2563eb",
                    }}
                  >
                    {diff === null ? "—" : diff === 0 ? "±0" : `${diff > 0 ? "+" : ""}${diff}`}
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-[1.7] text-text-3">
            오른쪽 숫자는 지난주 기록과의 점수 차이입니다. &ldquo;—&rdquo;는 그 지역의 직전 주
            기록이 없다는 뜻입니다(기록이 시작된 첫 주이거나 그 주에 계산 근거가 없었던
            경우).
          </p>
        </section>
      )}

      {hottest && coldest && weekLabel && rows.length >= 2 && (
        <CitationBlock
          sentence={`누구집(nuguzip.com) 집계에 따르면, ${weekLabel}이 속한 주의 시장 온도는 ${hottest.current.regionLabel}가 ${hottest.current.score}점으로 가장 높고 ${coldest.current.regionLabel}가 ${coldest.current.score}점으로 가장 낮다 (0~100 눈금, 50이 중립. 한국부동산원 매매가격지수 모멘텀과 국토교통부 실거래 거래량 추이 기반, 그 주에 마지막으로 관측한 값).`}
        />
      )}

      <QaBlock title="시장 온도 Q&A" items={qa} />

      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">이 기록을 읽는 법</h2>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-[1.6] text-text-2">
          <li>
            · 값은 <strong className="text-ink">그 주에 마지막으로 관측한 온도</strong>입니다.
            주간 평균이 아니며, 주가 넘어가면 그 값이 그대로 굳습니다.
          </li>
          <li>
            · 점수는 <strong className="text-ink">지수 모멘텀 ±25점</strong>과{" "}
            <strong className="text-ink">거래량 추이 ±25점</strong>을 50에 더한 값입니다. 어느
            항이 점수를 밀어 올렸는지는 지역별 페이지에 그대로 적혀 있습니다.
          </li>
          <li>
            · 계산식을 바꾸면 <strong className="text-ink">공식 버전</strong>을 올려 함께
            저장합니다. 과거 기록을 새 공식으로 다시 칠하지 않으므로, 어느 구간이 다른
            공식으로 계산됐는지 나중에도 확인할 수 있습니다.
          </li>
          <li>
            · 실거래 신고는 계약일로부터 최대 30일까지 늦어질 수 있어, 거래량 항은 신고가
            마감되지 않은 이번 달을 빼고 계산합니다.
          </li>
        </ul>
      </section>

      <p className="mb-8 text-[12px] leading-[1.7] text-text-3">
        지금 이 순간의 온도와 지수·거래량 원본 그래프는{" "}
        <Link href="/analysis/timing" className="font-bold text-primary underline">
          시세·타이밍 분석
        </Link>
        , 계산에 쓴 자료의 출처와 갱신 주기는{" "}
        <Link href="/methodology" className="font-bold text-primary underline">
          데이터 방법론
        </Link>
        에서 확인하실 수 있습니다.
      </p>
    </PageShell>
  );
}
