import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { getImjangGuide, type ImjangGuide } from "@/lib/imjang/guide";
import { IMJANG_CHECKPOINTS } from "@/lib/imjang/checkpoints";
import { filterNotesByRegion } from "@/lib/imjang/notes-match";
import {
  inspectionAverageScore,
  listPublicNotes,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { formatKrwShort, formatYm, formatYmRange } from "@/lib/market/format";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { QaBlock } from "@/app/components/QaBlock";

/* ============================================================
   지역 임장 가이드 — /imjang/[slug] (전략 정본 §4-2 프로그래매틱 임장 랜딩)

   /tx/[region] 이 "시세를 보는" 페이지라면, 이 페이지는 "현장에 가는" 페이지다
   (브랜드 대립 구도 그대로). 지역·밀도 기준은 /tx 와 같은 원천(minTx=10)을
   재사용한다 — 얇은 페이지를 새로 정의하지 않기 위해서다. 페이지 고유 내용은
   ① 단지 단위 임장 우선순위(실거래 합산)와 ② 표준 체크포인트다.

   슬러그는 /tx/[region] 과 같은 공간(regionToSlug) — 두 페이지가 1:1 로
   서로를 링크한다. DB 에 없는 슬러그는 404 (임의 문자열 페이지 양산 금지).
   ============================================================ */

/* [B001 1단계] 1h → 24h. 이 페이지의 원천(국토부 실거래)은 하루 1번 적재라
   더 자주 재렌더할 이유가 없다 — 26k 페이지 크롤 재렌더가 DB 를 밀던 문제의 반쪽. */
export const revalidate = 86400;
/* 빈 배열 = ISR 분류용 (app/tx/[region]/page.tsx 의 같은 자리 주석 참고 —
   이 export 가 없으면 요청마다 서버 렌더 + no-store 로 돌아 함수 호출이 샌다). */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

/** null 은 "그런 지역이 없다"(→ 404)일 때만 — 조회 실패는 던진다 (soft-404 정책). */
async function load(slug: string): Promise<ImjangGuide | null> {
  return getImjangGuide(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = await load(slug);
  if (!guide) {
    return { title: "지역 임장 가이드 | 내집나우", robots: { index: false, follow: false } };
  }
  const { region, topComplexes } = guide;
  const range = formatYmRange(region.firstYm, region.latestYm);
  const title = `${region.name} 임장 가이드 — 단지 우선순위·현장 체크포인트 | 내집나우`;
  const description = `${region.name} 임장(현장 답사) 준비: 실거래 ${region.txCount.toLocaleString(
    "ko-KR",
  )}건 기준 거래 활발 단지 ${Math.min(topComplexes.length, 10)}곳과 현장에서만 확인되는 체크포인트 ${
    IMJANG_CHECKPOINTS.length
  }가지.${range ? ` 국토교통부 신고 ${range}.` : ""} 시세는 데이터로, 현장은 발로.`;
  const path = `/imjang/${encodeURIComponent(region.slug)}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://naezipnow.com${path}`, type: "website" },
  };
}

export default async function ImjangRegionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = await load(slug);
  if (!guide) notFound();
  const { region, topComplexes } = guide;
  const range = formatYmRange(region.firstYm, region.latestYm);

  /* U3 플라이휠 조인 — 이 지역의 공개 임장노트. 곁다리 강화라 실패해도
     페이지는 계속 그리되, 실패와 0건은 화면에서 구분한다(사실 규율). */
  let regionNotes: InspectionNote[] = [];
  let notesFailed = false;
  try {
    regionNotes = filterNotesByRegion(await listPublicNotes(200), region.name, 4);
  } catch {
    notesFailed = true;
  }

  /* 지역 특징 한 줄 — 전부 실데이터에서 계산 (수치 창작 금지) */
  const busiestArea = region.areaCells.slice().sort((a, b) => b.txCount - a.txCount)[0] ?? null;

  const faq: FaqItem[] = [];
  if (topComplexes.length > 0) {
    const top = topComplexes[0];
    faq.push({
      q: `${region.name}에서 임장을 어느 단지부터 시작하면 좋나요?`,
      a: `실거래가 가장 활발한 단지를 기준점으로 삼는 것을 권합니다. ${region.name}에서는 ${top.name}이(가) ${
        top.txCount.toLocaleString("ko-KR")
      }건으로 거래가 가장 많았고${top.latestYm ? ` (마지막 신고 ${formatYm(top.latestYm)})` : ""}, 거래가 많은 단지는 가격 비교의 근거가 풍부해 다른 단지를 판단하는 자(尺)가 됩니다.`,
    });
  }
  if (busiestArea) {
    faq.push({
      q: `${region.name}에서 가장 거래가 활발한 면적대는 어디인가요?`,
      a: `면적대 구간 기준으로는 ${busiestArea.bandLabel} 구간이 ${busiestArea.txCount.toLocaleString(
        "ko-KR",
      )}건으로 가장 많습니다${range ? ` (국토교통부 신고 ${range})` : ""}. 평균 ${formatKrwShort(
        busiestArea.avgKrw,
      )} 수준으로, 수요가 두꺼운 면적대일수록 나중에 팔기도 쉽습니다.`,
    });
  }
  faq.push({
    q: "임장노트는 왜 쓰나요?",
    a: "시세는 누구나 볼 수 있지만 소음·주차·관리 상태 같은 현장 정보는 가 본 사람만 압니다. 기록해 두면 여러 단지를 같은 기준으로 비교할 수 있고, 내집나우는 기록을 AI 로 정리해 실거래 데이터와 나란히 놓아 줍니다.",
  });

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "임장 가이드", url: "/imjang" },
    { name: region.name, url: `/imjang/${encodeURIComponent(region.slug)}` },
  ]);

  return (
    <PageShell
      breadcrumb={`홈 › 임장 가이드 › ${region.name}`}
      title={`${region.name} 임장 가이드`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      {/* 데이터 브리핑 — 가기 전에 아는 것 */}
      <p className="rise-in mb-4 text-[13px] leading-[1.65] text-text-2">
        답사 전 데이터 브리핑: 이 지역 실거래{" "}
        <strong className="text-ink">{region.txCount.toLocaleString("ko-KR")}건</strong>
        {range && ` (국토교통부 신고 ${range})`} · 단지{" "}
        <strong className="text-ink">{region.complexCount.toLocaleString("ko-KR")}곳</strong>
        {busiestArea &&
          ` · 최다 거래 면적대 ${busiestArea.bandLabel} (평균 ${formatKrwShort(busiestArea.avgKrw)})`}
        . 시세는 여기까지 — 아래부터는 현장의 몫입니다.
      </p>

      {/* 임장 우선순위 — 실거래 합산 상위 단지 */}
      <section className="mb-6">
        <h2 className="mb-1 text-[15px] font-extrabold text-ink">어느 단지부터 볼까 — 거래 활발 순</h2>
        <p className="mb-2.5 text-[12px] leading-[1.6] text-text-3">
          거래가 많은 단지는 가격 근거가 풍부해 비교의 기준점이 됩니다. 첫 임장은
          기준점부터 잡고, 관심 단지를 그 자로 재는 순서를 권합니다.
        </p>
        {topComplexes.length === 0 ? (
          <div className="card rounded-2xl px-4 py-4 text-[13px] text-text-2">
            면적대 구간에 정리된 단지가 아직 없습니다 — 아래 실거래 구간 페이지에서
            지역 전체 흐름을 먼저 확인하세요.
          </div>
        ) : (
          <ol className="card overflow-hidden rounded-2xl">
            {topComplexes.map((c, i) => (
              <li key={c.name} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                <span className="w-5 shrink-0 text-center text-[13px] font-extrabold text-primary">
                  {i + 1}
                </span>
                <Link
                  prefetch={false}
                  href={`/search?q=${encodeURIComponent(c.name)}`}
                  className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink no-underline hover:text-primary"
                >
                  {c.name}
                </Link>
                <span className="shrink-0 text-[12px] text-text-2">
                  {c.txCount.toLocaleString("ko-KR")}건
                </span>
                <span className="hidden shrink-0 text-[12px] text-text-3 sm:inline">
                  {c.avgKrw > 0 ? `평균 ${formatKrwShort(c.avgKrw)}` : "가격 확인 필요"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 표준 체크포인트 — 가야만 확인되는 것들 */}
      <section className="mb-6">
        <h2 className="mb-1 text-[15px] font-extrabold text-ink">
          현장 체크포인트 {IMJANG_CHECKPOINTS.length} — 데이터로는 알 수 없는 것
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {IMJANG_CHECKPOINTS.map((c, i) => (
            <div key={c.title} className="card rounded-2xl px-4 py-3">
              <div className="text-[13px] font-extrabold text-ink">
                <span className="mr-1.5 text-primary">{String(i + 1).padStart(2, "0")}</span>
                {c.title}
              </div>
              <p className="mt-1 text-[12px] leading-[1.6] text-text-2">{c.why}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 이 지역 공개 임장노트 — 가 본 사람의 기록 (U3 플라이휠) */}
      <section className="mb-6">
        <h2 className="mb-1 text-[15px] font-extrabold text-ink">이 지역을 다녀온 기록</h2>
        {notesFailed ? (
          <p className="text-[13px] text-text-2">
            공개 노트를 지금 불러오지 못했어요 — 없는 게 아니라 조회가 실패했다는 뜻이에요.
          </p>
        ) : regionNotes.length === 0 ? (
          <p className="text-[13px] leading-[1.65] text-text-2">
            아직 이 지역의 공개 임장노트가 없어요 —{" "}
            <Link href="/notes/new" className="font-bold text-primary underline">
              첫 기록의 주인공
            </Link>
            이 되어 보세요. 공개 노트는 이 페이지와 검색에 실려 다음 방문자를 돕습니다.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {regionNotes.map((n) => {
              const avg = inspectionAverageScore(n.scores);
              return (
                <Link
                  key={n.id}
                  prefetch={false}
                  href={`/notes/${encodeURIComponent(n.id)}`}
                  className="card tile flex items-center gap-3 rounded-2xl px-4 py-3 no-underline"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-extrabold text-ink">
                      {n.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-text-3">
                      {[n.aptName, n.region].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {avg > 0 && (
                    <span className="shrink-0 rounded-lg bg-primary-soft px-2 py-1 text-[12px] font-extrabold text-primary">
                      {avg.toFixed(1)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <QaBlock title={`${region.name} 임장 Q&A`} items={faq} />

      {/* 다음 행동 — 기록으로 잇는다 */}
      <section className="mb-4 flex flex-wrap items-center gap-2.5">
        <Link href="/notes/new" className="btn-primary press rounded-xl px-4 py-2.5 text-[13px] no-underline">
          임장노트 쓰기 ›
        </Link>
        <Link
          prefetch={false}
          href={`/map?q=${encodeURIComponent(region.name)}`}
          className="chip bg-surface px-3.5 py-2.5 text-[13px] font-bold text-text-2 shadow-sm no-underline"
        >
          지도에서 보기
        </Link>
        <Link
          prefetch={false}
          href={`/tx/${encodeURIComponent(region.slug)}`}
          className="chip bg-surface px-3.5 py-2.5 text-[13px] font-bold text-text-2 shadow-sm no-underline"
        >
          면적대·가격대 실거래 자세히
        </Link>
        <Link href="/notes/templates" className="chip bg-surface px-3.5 py-2.5 text-[13px] font-bold text-text-2 shadow-sm no-underline">
          노트 템플릿
        </Link>
        {/* 크루 회로(전략 §5) — 혼자 갈 것 없다, 모임으로 잇는다 */}
        <Link href="/town/groups" className="chip bg-surface px-3.5 py-2.5 text-[13px] font-bold text-text-2 shadow-sm no-underline">
          함께 갈 사람 찾기
        </Link>
      </section>
      <p className="text-[12px] leading-[1.6] text-text-3">
        실거래 수치는 국토교통부 신고 기준(해제분 제외)이며 매물 호가가 아닙니다.
        면적대 구간에 정리된 건수라 지역 전체 신고분과 다를 수 있습니다.
      </p>
    </PageShell>
  );
}
