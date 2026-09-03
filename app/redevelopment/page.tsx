import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState } from "@/app/components/ui";
import { Icon } from "@/app/components/Icon";
import { readBoardPosts } from "@/lib/newui/board-posts";
import type { Post } from "@/lib/types/post";
import { listProjects, countBySigunguFrom } from "@/lib/redevelopment/store";
import type { RedevelopmentProject } from "@/lib/redevelopment/types";
import { SEED_SOURCES } from "@/lib/redevelopment/seed";
import { logger } from "@/lib/log";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { RedevelopmentMap } from "./RedevelopmentMap";
import { STAGE_GUIDES, REDEV_GLOSSARY } from "@/lib/redevelopment/stage-guide";

/* ============================================================
   정비사업 추적 라이트 (재개발닷컴 벤치마크 D2 축소판)
   — 도시정비법 일반 절차 기준 7단계 진행 트래커(정보성 콘텐츠)
     · 각 단계 설명·유의점·"이 단계에서 확인할 것" 체크리스트
   — board_posts 자동 수집 뉴스에서 재건축·재개발·정비사업 키워드
     매칭 최신 기사 리스트 (실데이터, 없으면 빈 상태)
   — 관심 등록 CTA → /my/saved-searches (실제 존재하는 저장 검색 알림)
   지도 구역·단계는 공개자료 취합 시드/DB 기반 참고값 — asOf(취합 시점)를
   마커·목록·면책에 함께 표기해 최신 고시와 다를 수 있음을 고지한다.
   ============================================================ */

export const revalidate = 3600;

export const metadata = {
  title: "정비사업 지도 | 내집나우",
  description:
    "재개발·재건축·소규모 정비사업을 사업종류별 컬러 마커로 보는 정비사업 지도. 사업종류·진행단계로 필터링하고, 7단계 진행 절차와 최신 정비사업 뉴스를 한곳에서 확인하세요.",
};

const NEWS_KEYWORD_RE = /재건축|재개발|정비사업/;
const NEWS_LIMIT = 10;

function displayTime(p: Post): number {
  const t = Date.parse(p.sourcePublishedAt || p.createdAt);
  return Number.isFinite(t) ? t : 0;
}

function shortDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

type NewsData = {
  news: Post[];
  /** 조회 자체가 실패했는가. false 면 "읽었고 매칭이 이만큼"이라는 뜻이다. */
  failed: boolean;
};

/**
 * board_posts에서 정비사업 키워드 매칭 최신 기사.
 *
 * readBoardPosts 는 이제 못 읽으면 던진다 — 아래 loadProjects 와 같은 이유로
 * 여기서 잡는다(프리렌더 중 던지면 배포가 깨진다). 다만 빈 배열로 뭉개지 않고
 * failed 를 들고 간다: "관련 기사가 아직 없어요"와 "못 불러왔어요"는 다른 사실이다.
 */
async function loadRedevelopmentNews(): Promise<NewsData> {
  try {
    const posts = await readBoardPosts();
    return {
      news: posts
        .filter((p) => NEWS_KEYWORD_RE.test(p.title) || NEWS_KEYWORD_RE.test(p.body))
        .sort((a, b) => displayTime(b) - displayTime(a))
        .slice(0, NEWS_LIMIT),
      failed: false,
    };
  } catch (e) {
    logger.error("[/redevelopment] 정비사업 뉴스 조회 실패", e);
    return { news: [], failed: true };
  }
}

type ProjectsData = {
  projects: RedevelopmentProject[];
  /** 조회 자체가 실패한 사유. null 이면 "읽었고 결과가 이만큼"이라는 뜻이다. */
  loadError: string | null;
};

/* 이 페이지는 revalidate 가 있고 동적 파라미터가 없어 `next build` 가
   빌드 타임에 프리렌더한다. 여기서 던지면 DB 가 잠깐 흔들린 것만으로 배포
   전체가 깨진다(/complex/compare 와 같은 사정). 그래서 store 는 실패를
   던지고, 페이지는 그 실패를 **실패라고 그린다** — 조용히 빈 지도로
   바꿔 그리지 않는다. 빈 지도는 "이 지역에 정비사업이 없다"는 다른 사실이다.

   noindex 까지 걸지는 않는다. 이 페이지는 7단계 가이드·용어·뉴스가 본문의
   대부분이고 지도는 그중 한 섹션이라, 조회가 실패해도 색인할 값이 남는다. */
async function loadProjects(): Promise<ProjectsData> {
  try {
    return { projects: await listProjects({ limit: 3000 }), loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      "[/redevelopment] 정비사업 구역을 읽지 못했습니다 — 구역이 없는 것이 아니라 조회가 실패했습니다:",
      message,
    );
    return { projects: [], loadError: message };
  }
}

export default async function RedevelopmentPage() {
  const [{ news, failed: newsFailed }, { projects, loadError }] = await Promise.all([
    loadRedevelopmentNews(),
    loadProjects(),
  ]);
  const sigunguCounts = countBySigunguFrom(projects);

  return (
    <PageShell breadcrumb="홈 › 동네이야기 › 정비사업 지도" title="정비사업 지도">
      {/* 카테고리 줄 고정 — 형제 카테고리 페이지(청약·입주·공매)와 동일 패턴 */}
      <TownCategoryNav stick />
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
        {/* ===== 정비사업 지도 히어로 ===== */}
        <section className="rise-in flex flex-col gap-3">
          <p className="t-body text-text-2">
            재개발·재건축·소규모 정비사업을 사업종류별 컬러 마커로 한눈에 보고,
            사업종류·진행단계로 걸러 원하는 구역만 골라보세요. 마커·목록을 누르면 해당 구역으로
            지도가 이동해요.
          </p>
          {loadError ? (
            /* 실패를 "구역 없음"으로 바꿔 그리지 않는다 — 둘은 다른 사실이다.
               원인 원문(cause)도 감추지 않고 그대로 보여 준다. */
            <ErrorState
              title="정비사업 구역을 불러오지 못했습니다"
              desc="구역이 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻이에요. 잠시 후 다시 확인해 주세요."
              cause={loadError}
              className="rounded-2xl"
            />
          ) : (
            <RedevelopmentMap
              initialProjects={projects}
              sigunguCounts={sigunguCounts}
              sources={SEED_SOURCES}
            />
          )}
        </section>

        {/* ===== 아래: 진행단계 가이드 + 뉴스(기존 콘텐츠 보존) ===== */}
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
          {/* ===== 진행단계 개요 스트립 ===== */}
        <section className="rise-in card rounded-2xl px-5 py-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-extrabold text-ink">
              재개발·재건축은 이렇게 7단계로 진행돼요
            </h2>
            <span className="t-caption text-text-3">도시정비법 일반 절차 기준</span>
          </div>
          {/* 가로 스텝 오버뷰 — 좁은 화면은 가로 스크롤 */}
          <div className="mt-3 -mx-1 overflow-x-auto px-1 pb-1">
            <ol className="flex min-w-max items-center gap-1">
              {STAGE_GUIDES.map((s, i) => (
                <li key={s.key} className="flex items-center gap-1">
                  <span className="chip chip-soft flex items-center gap-1 px-2.5 py-1 t-sub">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary t-caption font-extrabold text-white">
                      {i + 1}
                    </span>
                    <Icon name={s.icon} size={13} />
                    {s.longLabel}
                  </span>
                  {i < STAGE_GUIDES.length - 1 && (
                    <span className="shrink-0 text-text-3" aria-hidden="true">
                      ›
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-2 t-sub text-text-2">
            각 단계의 뜻과 유의점, 그 단계에서 확인할 것을 아래에서 단계별로 정리했어요.
            단계 오인은 투자 판단에 영향을 줄 수 있으니 실제 진행 여부는 반드시 확인하세요.
          </p>
        </section>

        {/* ===== 단계별 상세 트래커(세로 스테퍼) ===== */}
        <section className="rise-in-1 card rounded-2xl px-5 py-4">
          <h2 className="text-[13px] font-extrabold text-ink">단계별 상세 · 이 단계에서 확인할 것</h2>
          <ol className="mt-3 flex flex-col gap-0">
            {STAGE_GUIDES.map((s, i) => (
              <li key={s.key} className="flex gap-3">
                {/* 아이콘 번호 + 연결선 */}
                <div className="flex flex-col items-center">
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Icon name={s.icon} size={18} />
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary t-caption font-extrabold text-white">
                      {i + 1}
                    </span>
                  </span>
                  {i < STAGE_GUIDES.length - 1 && (
                    <span className="w-px flex-1 bg-line" aria-hidden="true" />
                  )}
                </div>

                {/* 본문 */}
                <div className={i < STAGE_GUIDES.length - 1 ? "min-w-0 pb-6" : "min-w-0"}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="t-section text-ink">{s.longLabel}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(29,79,216,.06)] chip-pad t-caption font-semibold text-text-2">
                      <Icon name="clock" size={11} />
                      {s.period}
                    </span>
                  </div>

                  <p className="mt-1 t-sub text-text-1">{s.desc}</p>

                  {/* 유의점 */}
                  <div className="mt-2 flex gap-1.5 rounded-[10px] bg-warning-soft px-2.5 py-2">
                    <Icon
                      name="warning"
                      size={13}
                      className="mt-px shrink-0 text-warning"
                    />
                    <p className="t-sub text-warning">
                      <span className="font-bold">유의점 </span>
                      {s.caution}
                    </p>
                  </div>

                  {/* 이 단계에서 확인할 것 */}
                  <div className="mt-2">
                    <div className="t-sub font-bold text-text-2">
                      이 단계에서 확인할 것
                    </div>
                    <ul className="mt-1 flex flex-col gap-1">
                      {s.checklist.map((c) => (
                        <li key={c} className="flex gap-1.5">
                          <Icon
                            name="check"
                            size={13}
                            className="mt-px shrink-0 text-primary"
                          />
                          <span className="t-sub text-text-2">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {/* 면책 */}
          <p className="mt-3 flex gap-1.5 rounded-[10px] bg-[rgba(29,79,216,.06)] px-3 py-2 t-caption text-text-2">
            <Icon name="shield" size={13} className="mt-px shrink-0" />
            <span>
              개념 안내용 일반 절차예요. 실제 사업 단계·조합원 자격·분담금은 구역·조합마다
              다르므로 조합·구청·전문가 확인이 필요해요. 구역별 실제 단계·일정은 지자체
              고시(정비사업 정보몽땅 등 공공 공개자료) 기준으로 확인하세요.
            </span>
          </p>
        </section>

        {/* ===== 자주 나오는 용어 ===== */}
        <section className="rise-in-2 card rounded-2xl px-5 py-4">
          <h2 className="text-[13px] font-extrabold text-ink">자주 나오는 용어</h2>
          <dl className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {REDEV_GLOSSARY.map((g) => (
              <div
                key={g.term}
                className="rounded-[10px] border border-line bg-surface px-3 py-2"
              >
                <dt className="t-sub font-extrabold text-ink">{g.term}</dt>
                <dd className="mt-0.5 t-sub text-text-2">{g.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ===== 관심 등록 CTA — 실제 존재하는 기능(저장 검색 알림)으로만 연결.
             "정비사업 소식 알림"은 아직 없는 기능이라 약속하지 않는다. */}
        <Link
          href="/my/saved-searches"
          className="rise-in-3 tile flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 no-underline"
        >
          <div>
            <div className="t-body font-extrabold text-ink">
              관심 지역 검색조건 저장하기
            </div>
            <div className="mt-0.5 t-sub text-text-2">
              저장한 조건에 맞는 새 매물이 올라오면 알림으로 알려드려요. 정비사업 단계 변경
              알림은 아직 제공하지 않아요.
            </div>
          </div>
          <span className="shrink-0 rounded-[10px] bg-primary-soft px-3.5 py-2 text-xs font-bold text-primary">
            저장 검색 ›
          </span>
        </Link>

        {/* ===== 정비사업 뉴스 (board_posts 실데이터) ===== */}
        <section className="rise-in-4 card flex flex-col gap-2.5 rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold text-ink">정비사업 뉴스</h2>
            <Link href="/town/news" className="t-sub font-extrabold text-primary">
              전체 뉴스 ›
            </Link>
          </div>
          {news.length === 0 &&
            (newsFailed ? (
              /* 색은 배경이 지고, 문장은 text-ink 로 읽는다 — 11px 본문에서 가장 확실하다. */
              <div className="rounded-[10px] bg-danger-soft px-3 py-2 text-center t-sub text-ink">
                뉴스를 불러오지 못했어요 (조회 실패). 관련 기사가 없다는 뜻은 아니에요.
              </div>
            ) : (
              <div className="py-3 text-center t-sub text-text-3">
                최근 수집된 재건축·재개발 관련 기사가 아직 없어요.
              </div>
            ))}
          {news.map((n) => (
            <Link key={n.id} href={`/town/news/${n.id}`} className="group no-underline">
              <div className="t-sub font-bold text-ink group-hover:text-primary">
                {n.title}
              </div>
              <div className="mt-[2px] t-caption text-text-3">
                {[n.sourceName || n.authorLabel, shortDate(n.sourcePublishedAt || n.createdAt), n.city]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </Link>
          ))}
          {news.length > 0 && (
            <p className="t-caption text-text-3">
              재건축·재개발·정비사업 키워드 매칭 자동 수집 기사 — 원문·출처는 각 기사에서
              확인하세요.
            </p>
          )}
        </section>
        </div>
      </div>
    </PageShell>
  );
}
