import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { QaBlock } from "@/app/components/QaBlock";
import { CitationBlock } from "@/app/components/CitationBlock";
import {
  listRegionTemperatureHistory,
  type TemperatureSnapshot,
} from "@/lib/market/temperature-archive";
import {
  findTemperatureRegion,
  formatWeekKorean,
  formatWeekLabel,
  type TemperatureRegion,
} from "@/lib/market/temperature";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   N11 — 지역별 시장 온도 주간 기록 · /analysis/temperature/[region]

   ── 조회 실패를 삼키지 않는다 ────────────────────────────────
   허브(/analysis/temperature)는 빌드 타임 프리렌더 대상이라 예외를 잡아
   "불러오지 못했습니다"를 렌더한다. 이 페이지는 동적 라우트라 사정이 다르다 —
   여기서 던지면 5xx 가 나가고, 크롤러는 그걸 "지금은 못 준다(나중에 다시
   와라)"로 읽는다. 조회 실패를 404 나 빈 화면으로 바꾸면 "이 지역 기록은
   영영 없다"는 잘못된 신호가 된다. 그래서 listRegionTemperatureHistory()
   가 던지는 오류를 그대로 통과시킨다.

   ── 기록이 0주인 경우는 실패가 아니다 ────────────────────────
   지역 자체는 유효한데 아직 그 주가 쌓이지 않았을 수 있다(첫 크론 실행 전,
   또는 지수 시계열이 없어 계산이 성립하지 않는 지역). 이때는 404 가 아니라
   "아직 기록이 없다"고 적고 noindex 로 둔다. 사이트맵도
   listArchivedRegionIds() 로 **행이 있는 지역만** 싣기 때문에, 빈 페이지를
   크롤러에게 광고하지는 않는다.
   ============================================================ */

export const revalidate = 3600;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { region: string }[] {
  return [];
}

/** 표·차트에 쓰는 최대 주 수. 1년치면 계절성까지 눈에 들어온다. */
const MAX_WEEKS = 52;

type PageData = {
  region: TemperatureRegion;
  history: TemperatureSnapshot[];
};

const loadPage = cache(async (regionId: string): Promise<PageData | null> => {
  const region = findTemperatureRegion(regionId);
  if (!region) return null;
  // 실패는 던진다(위 주석 참고). 빈 배열은 "아직 기록 없음"이라는 사실이다.
  const history = await listRegionTemperatureHistory(region.id, MAX_WEEKS);
  return { region, history };
});

/** 마지막 값이 이어 온 같은 방향 흐름의 길이. 1이면 "직전 주 대비 변화" 한 번뿐이다. */
function streak(history: TemperatureSnapshot[]): { dir: "up" | "down" | "flat"; weeks: number } {
  if (history.length < 2) return { dir: "flat", weeks: 0 };
  const diffs: number[] = [];
  for (let i = 1; i < history.length; i += 1) {
    diffs.push(history[i].score - history[i - 1].score);
  }
  const last = diffs[diffs.length - 1] ?? 0;
  if (last === 0) return { dir: "flat", weeks: 0 };
  const dir = last > 0 ? "up" : "down";
  let weeks = 0;
  for (let i = diffs.length - 1; i >= 0; i -= 1) {
    const d = diffs[i] ?? 0;
    if ((dir === "up" && d > 0) || (dir === "down" && d < 0)) weeks += 1;
    else break;
  }
  return { dir, weeks };
}

function streakSentence(history: TemperatureSnapshot[]): string | null {
  const { dir, weeks } = streak(history);
  if (weeks === 0) return null;
  const word = dir === "up" ? "상승" : "하락";
  return weeks >= 2
    ? `기록상 ${weeks}주 연속 ${word}했습니다.`
    : `직전 주보다 ${word}했습니다(연속 흐름은 아직 1주입니다).`;
}

function pct(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string }>;
}): Promise<Metadata> {
  const { region: regionId } = await params;
  const data = await loadPage(regionId);
  if (!data) {
    return { title: "시장 온도 주간 기록 | 누구집", robots: { index: false, follow: false } };
  }
  const { region, history } = data;
  const latest = history[history.length - 1] ?? null;
  const path = `/analysis/temperature/${region.id}`;

  if (!latest) {
    return {
      title: `${region.label} 시장 온도 주간 기록 | 누구집`,
      description: `${region.label}의 시장 온도 주간 기록입니다. 아직 저장된 주가 없습니다.`,
      alternates: seoAlternates(path),
      // 내용이 없는 페이지를 색인시키지 않는다. 기록이 쌓이면 자연히 풀린다.
      robots: { index: false, follow: true },
    };
  }

  const description =
    `${region.label} 시장 온도는 ${formatWeekKorean(latest.weekStart)}이 속한 주 기준 ${latest.score}점(0~100, 50이 중립)입니다. ` +
    `${latest.headline}. 최근 ${history.length}주 기록을 한국부동산원 매매가격지수 모멘텀과 국토교통부 실거래 거래량 추이로 계산해 매주 저장합니다.`;
  return {
    title: `${region.label} 시장 온도 주간 기록 | 누구집`,
    description,
    alternates: seoAlternates(path),
    robots: { index: true, follow: true },
    openGraph: {
      title: `${region.label} 시장 온도 주간 기록 | 누구집`,
      description,
      url: `https://nuguzip.com${path}`,
      type: "website",
    },
  };
}

export default async function TemperatureRegionPage({
  params,
}: {
  params: Promise<{ region: string }>;
}) {
  const { region: regionId } = await params;
  const data = await loadPage(regionId);
  if (!data) notFound();
  const { region, history } = data;

  const path = `/analysis/temperature/${region.id}`;
  const latest = history[history.length - 1] ?? null;
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const diff = latest && prev ? latest.score - prev.score : null;

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "AI 분석", url: "/analysis" },
    { name: "시장 온도 주간 기록", url: "/analysis/temperature" },
    { name: region.label, url: path },
  ]);

  /* 기록이 아직 없는 경우 — 지역은 유효하므로 404 가 아니라 사실을 적는다. */
  if (!latest) {
    return (
      <PageShell
        breadcrumb={`홈 › AI 분석 › 시장 온도 주간 기록 › ${region.label}`}
        title={`${region.label} 시장 온도 주간 기록`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
        />
        <section className="rise-in card mb-6 p-[var(--pad-card)]">
          <p className="py-8 text-center text-[13px] leading-[1.7] text-text-3">
            아직 이 지역의 저장된 주가 없습니다.
            <br />
            매매가격지수 시계열이 4구간 이상 모여야 온도를 계산할 수 있고, 그 뒤부터 매주
            기록이 쌓입니다.
            <br />
            <Link href="/analysis/timing" className="font-bold text-primary underline">
              지금 이 순간의 시장 온도 보기
            </Link>
          </p>
        </section>
        <p className="mb-8 text-[12px] text-text-3">
          다른 지역의 기록은{" "}
          <Link href="/analysis/temperature" className="font-bold text-primary underline">
            시장 온도 주간 기록
          </Link>
          에서 볼 수 있습니다.
        </p>
      </PageShell>
    );
  }

  const scores = history.map((h) => h.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const firstWeek = history[0]?.weekStart ?? latest.weekStart;
  const rangeLabel =
    history.length >= 2
      ? `${formatWeekLabel(firstWeek)}~${formatWeekLabel(latest.weekStart)}`
      : formatWeekLabel(latest.weekStart);
  const flow = streakSentence(history);
  const recent = [...history].slice(-12).reverse();

  /* Dataset — 이 페이지가 실제로 보여 주는 주간 시계열을 데이터셋으로 기술한다.
     원출처(한국부동산원 지수·국토교통부 실거래)를 명시해 AI 가 우리 가공값을
     원자료로 오인하지 않게 한다. */
  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${region.label} 시장 온도 주간 시계열`,
    description: `${region.label}의 시장 온도(0~100, 50이 중립) 주간 기록 ${history.length}주(${rangeLabel}). 한국부동산원 아파트 매매가격지수 모멘텀과 국토교통부 실거래 월별 거래량 추이를 합성한 값이며, 각 주의 값은 그 주에 마지막으로 관측한 것입니다.`,
    url: `https://nuguzip.com${path}`,
    inLanguage: "ko-KR",
    temporalCoverage: `${firstWeek}/${latest.weekStart}`,
    variableMeasured: "시장 온도 (0~100)",
    creator: { "@id": "https://nuguzip.com/#organization" },
    isBasedOn: ["https://www.reb.or.kr", "https://rt.molit.go.kr"],
    license: "https://nuguzip.com/methodology",
    keywords: [region.name, "시장 온도", "매매가격지수", "실거래", "주간"],
    /* 항목 45 — 최신 관측 주 = 기계 판독용 갱신일. 인용 가능한 공개 API 연결. */
    dateModified: latest.weekStart,
    distribution: [
      {
        "@type": "DataDownload",
        contentUrl: "https://nuguzip.com/api/public/v1/regions/monthly",
        encodingFormat: "application/json",
      },
    ],
  };

  const qa: FaqItem[] = [
    {
      q: `${region.label} 시장 온도는 지금 몇 점인가요?`,
      a: `${formatWeekKorean(latest.weekStart)}이 속한 주 기준 ${latest.score}점입니다(0~100 눈금, 50이 중립). ${latest.headline}에 해당합니다.${
        diff === null
          ? ""
          : diff === 0
            ? " 지난주와 같은 점수입니다."
            : ` 지난주(${prev?.score}점)보다 ${Math.abs(diff)}점 ${diff > 0 ? "높습니다" : "낮습니다"}.`
      }`,
    },
    ...(flow
      ? [
          {
            q: `${region.label} 시장 온도는 오르는 중인가요?`,
            a: `${rangeLabel} ${history.length}주 기록 기준으로 ${flow} 같은 기간 최고 ${maxScore}점, 최저 ${minScore}점, 평균 ${avgScore}점이었습니다. 주간 기록은 그 주에 마지막으로 관측한 값이므로, 주 중간의 등락은 담기지 않습니다.`,
          },
        ]
      : []),
    {
      q: "이 점수는 무엇으로 계산했나요?",
      a: `50점을 중립으로 두고 지수 모멘텀(±25점)과 거래량 추이(±25점)를 더합니다. ${formatWeekKorean(
        latest.weekStart,
      )} 주 기준 ${region.label}의 지수 최근 3개${latest.periodType === "monthly" ? "월" : "주"} 평균 변동률은 ${pct(
        latest.momentumPct,
      )}, 직전 3개${latest.periodType === "monthly" ? "월" : "주"}는 ${pct(latest.priorPct)}였습니다.${
        latest.volumeRecentCount !== null && latest.volumePriorCount !== null
          ? ` 거래량은 최근 구간 ${latest.volumeRecentCount.toLocaleString("ko-KR")}건, 직전 구간 ${latest.volumePriorCount.toLocaleString("ko-KR")}건으로 ${pct(latest.volumeDeltaPct, 0)} 변화했습니다.`
          : " 이 주에는 완결월 거래량이 충분하지 않아 지수 모멘텀만 반영했습니다."
      }`,
    },
    {
      q: "기록이 중간에 빠진 주가 있으면 어떻게 되나요?",
      a: "그 주의 행이 아예 없습니다. 앞뒤 값으로 보간하지 않습니다. 지나간 시점의 온도를 나중에 다시 계산해 채워 넣으면 그것은 관측이 아니라 재구성이므로, 빠진 주는 빠진 채로 둡니다.",
    },
  ];

  return (
    <PageShell
      breadcrumb={`홈 › AI 분석 › 시장 온도 주간 기록 › ${region.label}`}
      title={`${region.label} 시장 온도 주간 기록`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([crumbs, datasetJsonLd]) }}
      />

      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        {rangeLabel} · <strong className="text-ink">{history.length}주</strong> 기록 · 0~100
        눈금(50이 중립) · 매수·매도 권유가 아닙니다.
      </p>

      {/* 최신 주 요약 */}
      <section className="rise-in card mb-6 p-[var(--pad-card)]">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-[40px] font-extrabold leading-none text-ink">{latest.score}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-extrabold text-ink">{latest.headline}</div>
            <div className="mt-0.5 text-[12px] text-text-3">
              {formatWeekKorean(latest.weekStart)}이 속한 주
              {diff !== null && (
                <>
                  {" · "}
                  지난주 대비{" "}
                  <strong className={diff > 0 ? "text-danger" : diff < 0 ? "text-primary" : undefined}>
                    {diff === 0 ? "±0" : `${diff > 0 ? "+" : ""}${diff}`}점
                  </strong>
                </>
              )}
            </div>
          </div>
        </div>
        {flow && <p className="mt-3 text-[13px] leading-[1.7] text-text-1">{flow}</p>}
        <p className="mt-2 text-[11px] leading-[1.7] text-text-3">
          이 값은 <strong className="text-ink">그 주에 마지막으로 관측한 온도</strong>입니다.
          주간 평균이 아니며, 수집 작업이 같은 주 안에서는 값을 갱신하고 주가 넘어가면 그대로
          굳습니다. 공식 버전 v{latest.formulaVersion} 기준으로 계산됐습니다.
        </p>
      </section>

      {/* 주간 추이 */}
      <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
        <h2 className="flex items-baseline justify-between gap-3 text-[15px] font-extrabold text-ink">
          주간 추이
          <span className="shrink-0 text-[11px] font-medium text-text-3">
            최고 {maxScore} · 평균 {avgScore} · 최저 {minScore}
          </span>
        </h2>
        <div className="mt-3 flex h-[120px] items-end gap-[3px] border-b border-line pb-px">
          {history.map((h) => {
            const isLast = h.weekStart === latest.weekStart;
            return (
              <div
                key={h.weekStart}
                title={`${formatWeekLabel(h.weekStart)} · ${h.score}점 · ${h.headline}`}
                className="min-w-0 flex-1 rounded-t-[3px]"
                style={{
                  height: `${12 + Math.round((h.score / 100) * 100)}px`,
                  background: isLast ? "var(--primary)" : "var(--primary-soft)",
                }}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-text-3">
          <span>{formatWeekLabel(firstWeek)}</span>
          <span>중립선 50점</span>
          <span>{formatWeekLabel(latest.weekStart)}</span>
        </div>
        {history.length < 4 && (
          <p className="mt-3 text-[11px] leading-[1.7] text-text-3">
            아직 {history.length}주치 기록뿐이라 추세라고 부르기엔 이릅니다. 주가 쌓일수록 그래프가
            길어집니다.
          </p>
        )}
      </section>

      {/* 주별 기록 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          주별 기록{" "}
          <span className="text-[11px] font-medium text-text-3">최근 {recent.length}주</span>
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] text-text-3">
                <th className="py-2 font-medium">주(월요일)</th>
                <th className="py-2 text-right font-medium">온도</th>
                <th className="py-2 text-right font-medium">지수 최근 평균</th>
                <th className="py-2 text-right font-medium">거래량(최근/직전)</th>
                <th className="py-2 font-medium">요약</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((h, i) => {
                const before = recent[i + 1] ?? null;
                const d = before ? h.score - before.score : null;
                return (
                  <tr key={h.weekStart} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 text-text-2">{formatWeekLabel(h.weekStart)}</td>
                    <td className="py-2.5 text-right">
                      <span className="font-extrabold text-ink">{h.score}</span>
                      {d !== null && (
                        <span
                          className="ml-1 text-[11px]"
                          style={{
                            color: d > 0 ? "var(--danger)" : d < 0 ? "var(--primary)" : "var(--text-3)",
                          }}
                        >
                          {d === 0 ? "±0" : `${d > 0 ? "+" : ""}${d}`}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-text-2">{pct(h.momentumPct)}</td>
                    <td className="py-2.5 text-right text-text-2">
                      {h.volumeRecentCount !== null && h.volumePriorCount !== null
                        ? `${h.volumeRecentCount.toLocaleString("ko-KR")} / ${h.volumePriorCount.toLocaleString("ko-KR")}건`
                        : "미반영"}
                    </td>
                    <td className="py-2.5 text-[12px] text-text-2">{h.headline}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] leading-[1.7] text-text-3">
          &ldquo;미반영&rdquo;은 그 주에 완결월 거래량이 4개월치에 못 미쳐 거래량 항을 빼고 지수
          모멘텀만으로 계산했다는 뜻입니다. 없는 값을 0으로 채우지 않습니다.
        </p>
      </section>

      <CitationBlock
        sentence={`누구집(nuguzip.com) 집계에 따르면, ${region.label}의 시장 온도는 ${formatWeekKorean(
          latest.weekStart,
        )}이 속한 주 기준 ${latest.score}점이다 (0~100 눈금, 50이 중립. 한국부동산원 아파트 매매가격지수 모멘텀과 국토교통부 실거래 거래량 추이 기반, 그 주에 마지막으로 관측한 값).`}
      />

      <QaBlock title={`${region.label} 시장 온도 Q&A`} items={qa} />

      <section className="rise-in-3 mb-8 flex flex-wrap gap-2">
        <Link
          href={`/analysis/timing?region=${encodeURIComponent(region.id)}`}
          className="rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-[var(--shadow-cta)]"
        >
          {region.name} 지수·거래량 원본 보기
        </Link>
        <Link
          href={`/region/${region.id}`}
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          {region.name} 지역 허브
        </Link>
        <Link
          href="/analysis/temperature"
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          다른 지역 온도
        </Link>
        <Link
          href="/methodology"
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          데이터 방법론
        </Link>
      </section>
    </PageShell>
  );
}
