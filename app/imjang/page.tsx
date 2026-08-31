import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { listImjangRegions } from "@/lib/imjang/guide";
import { IMJANG_CHECKPOINTS } from "@/lib/imjang/checkpoints";
import type { TxRegionSummary } from "@/lib/market/tx-bands";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";

/* ============================================================
   임장 가이드 인덱스 — /imjang (전략 정본 §4-2)

   "임장" 키워드군의 허브. 지역 목록은 /tx 와 같은 원천(실거래 구간이 있는
   지역만)이라, 여기 실리는 지역 링크는 전부 실데이터가 있는 페이지다.
   조회 실패는 실패로 그린다 — 지역이 없는 것과 못 읽은 것은 다른 말이다.
   ============================================================ */

/* [B001 1단계] 1h → 24h. 이 페이지의 원천(국토부 실거래)은 하루 1번 적재라
   더 자주 재렌더할 이유가 없다 — 26k 페이지 크롤 재렌더가 DB 를 밀던 문제의 반쪽. */
export const revalidate = 86400;

const PATH = "/imjang";

type IndexData = { regions: TxRegionSummary[]; loadError: string | null };

async function loadIndex(): Promise<IndexData> {
  try {
    return { regions: await listImjangRegions(48), loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error("[/imjang] 지역 목록 조회 실패 — 지역이 없는 것이 아니라 조회가 실패했습니다:", message);
    return { regions: [], loadError: message };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { regions, loadError } = await loadIndex();
  const title = "임장 가이드 — 지역별 답사 준비와 현장 체크포인트 | 누구집";
  const description =
    regions.length > 0
      ? `${regions.length}개 지역의 임장(현장 답사) 가이드: 실거래 데이터로 단지 우선순위를 잡고, 현장에서만 확인되는 체크포인트 ${IMJANG_CHECKPOINTS.length}가지로 답사합니다. 시세는 누구나 봅니다 — 현장은 가 본 사람만 압니다.`
      : `임장(현장 답사) 준비 가이드: 실거래 데이터로 단지 우선순위를 잡고, 현장 체크포인트 ${IMJANG_CHECKPOINTS.length}가지로 답사합니다.`;
  return {
    title,
    description,
    alternates: seoAlternates(PATH),
    ...(loadError ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, url: `https://nuguzip.com${PATH}`, type: "website" },
  };
}

export default async function ImjangIndexPage() {
  const { regions, loadError } = await loadIndex();

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "임장 가이드", url: PATH },
  ]);

  return (
    <PageShell breadcrumb="홈 › 임장 가이드" title="임장 가이드">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }} />

      <p className="rise-in mb-5 max-w-[720px] text-[13.5px] leading-[1.7] text-text-2">
        임장(臨場)은 집을 데이터가 아니라 현장에서 확인하는 일입니다. 시세·거래량은
        가기 전에 여기서 보고, 소음·주차·관리 상태처럼{" "}
        <strong className="text-ink">가야만 알 수 있는 것</strong>은 체크포인트로
        확인해 기록으로 남기세요. 지역 가이드는 실거래 데이터가 정리된 지역만 엽니다.
      </p>

      {/* 지역 목록 — 실데이터 있는 지역만, 거래 많은 순 */}
      <section className="mb-7">
        <h2 className="mb-2 text-[15px] font-extrabold text-ink">
          지역별 가이드 <span className="text-[11px] font-medium text-text-3">거래 많은 순</span>
        </h2>
        {loadError ? (
          <div className="card rounded-2xl px-4 py-4">
            <p className="text-[13px] font-bold text-ink">지역 목록을 지금 불러오지 못했어요</p>
            <p className="mt-1 text-[12px] leading-[1.6] text-text-2">
              지역이 없다는 뜻이 아니라 조회가 실패했다는 뜻이에요. 잠시 후 새로고침해 주세요.
            </p>
          </div>
        ) : regions.length === 0 ? (
          <div className="card rounded-2xl px-4 py-4 text-[13px] text-text-2">
            아직 구간이 정리된 지역이 없습니다.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {regions.map((r) => (
              <Link
                key={r.slug}
                prefetch={false}
                href={`/imjang/${encodeURIComponent(r.slug)}`}
                className="chip bg-surface px-3.5 py-2 text-[12.5px] font-bold text-text-1 shadow-sm no-underline hover:text-primary"
              >
                {r.name}
                <span className="ml-1.5 text-[11px] font-medium text-text-3">
                  {r.txCount.toLocaleString("ko-KR")}건
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 표준 체크포인트 — 인덱스에도 전문 (지역과 무관한 공통 지식) */}
      <section className="mb-7">
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

      <section className="flex flex-wrap items-center gap-2.5">
        <Link href="/notes/new" className="btn-primary press rounded-xl px-4 py-2.5 text-[13px] no-underline">
          임장노트 쓰기 ›
        </Link>
        <Link href="/notes/templates" className="chip bg-surface px-3.5 py-2.5 text-[12.5px] font-bold text-text-2 shadow-sm no-underline">
          노트 템플릿 보기
        </Link>
        <Link href="/tx" className="chip bg-surface px-3.5 py-2.5 text-[12.5px] font-bold text-text-2 shadow-sm no-underline">
          지역별 실거래 구간
        </Link>
      </section>
    </PageShell>
  );
}
