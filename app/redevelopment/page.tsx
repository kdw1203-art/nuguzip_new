import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { readBoardPosts } from "@/lib/newui/board-posts";
import type { Post } from "@/lib/types/post";

/* ============================================================
   정비사업 추적 라이트 (재개발닷컴 벤치마크 D2 축소판)
   — 도시정비법 일반 절차 기준 단계 안내 다이어그램(정보성 콘텐츠)
   — board_posts 자동 수집 뉴스에서 재건축·재개발·정비사업 키워드
     매칭 최신 기사 리스트 (실데이터, 없으면 빈 상태)
   — 관심 등록 CTA → /notifications
   구역별 단계 데이터는 아직 없어 구역 목록은 표시하지 않는다.
   ============================================================ */

export const revalidate = 3600;

export const metadata = {
  title: "정비사업 추적 | 누구집",
  description:
    "재개발·재건축 사업 단계 안내와 최신 정비사업 뉴스를 한곳에서 확인하세요.",
};

/** 도시 및 주거환경정비법 기준 일반 절차 — 구역별 실제 단계·일정은 지자체 고시 기준 */
const STAGES: { name: string; desc: string }[] = [
  {
    name: "정비구역 지정",
    desc: "지자체가 정비계획을 수립하고 구역을 지정·고시하는 출발점이에요.",
  },
  {
    name: "조합설립인가",
    desc: "토지등소유자 동의를 모아 사업 주체인 조합이 만들어져요.",
  },
  {
    name: "사업시행인가",
    desc: "건축 계획 등 사업 내용이 확정돼요. 사업이 본궤도에 오르는 단계예요.",
  },
  {
    name: "관리처분인가",
    desc: "분담금·권리 배분이 확정돼요. 이후 이주·철거가 시작돼요.",
  },
  {
    name: "착공",
    desc: "이주·철거를 마치고 공사가 시작돼요. 일반분양도 이 무렵 진행돼요.",
  },
  {
    name: "준공·입주",
    desc: "준공 인가 후 입주하고, 이전 고시로 사업이 마무리돼요.",
  },
];

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

/** board_posts에서 정비사업 키워드 매칭 최신 기사 — 실패·빈 데이터 시 빈 배열 */
async function loadRedevelopmentNews(): Promise<Post[]> {
  const posts = await readBoardPosts();
  return posts
    .filter((p) => NEWS_KEYWORD_RE.test(p.title) || NEWS_KEYWORD_RE.test(p.body))
    .sort((a, b) => displayTime(b) - displayTime(a))
    .slice(0, NEWS_LIMIT);
}

export default async function RedevelopmentPage() {
  const news = await loadRedevelopmentNews();

  return (
    <PageShell breadcrumb="동네 › 정비사업" title="정비사업 추적">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        {/* ===== 단계 안내 다이어그램 ===== */}
        <section className="rise-in card rounded-2xl px-5 py-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-extrabold text-ink">
              재개발·재건축은 이렇게 진행돼요
            </h2>
            <span className="text-[10px] text-text-3">도시정비법 일반 절차 기준</span>
          </div>
          <ol className="mt-3 flex flex-col gap-0">
            {STAGES.map((s, i) => (
              <li key={s.name} className="flex gap-3">
                {/* 번호 + 연결선 */}
                <div className="flex flex-col items-center">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-extrabold text-primary">
                    {i + 1}
                  </span>
                  {i < STAGES.length - 1 && (
                    <span className="w-px flex-1 bg-[#dfe5ef]" aria-hidden="true" />
                  )}
                </div>
                <div className={i < STAGES.length - 1 ? "pb-4" : ""}>
                  <div className="text-[13px] font-extrabold text-ink">{s.name}</div>
                  <div className="mt-0.5 text-[11px] leading-[1.6] text-text-2">
                    {s.desc}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 rounded-[10px] bg-[rgba(29,79,216,.06)] px-3 py-2 text-[10px] leading-[1.6] text-[#5b74b8]">
            구역별 실제 단계·일정은 각 지자체 고시(정비사업 정보몽땅 등 공공 공개자료)
            기준으로 확인하세요. 단계 오인은 투자 판단에 영향을 줄 수 있어요.
          </p>
        </section>

        {/* ===== 관심 등록 CTA ===== */}
        <Link
          href="/notifications"
          className="rise-in-1 card-hover flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 no-underline"
        >
          <div>
            <div className="text-[13px] font-extrabold text-ink">
              관심 지역 정비사업 소식 받아보기
            </div>
            <div className="mt-0.5 text-[11px] text-text-2">
              알림 설정에서 관심 지역을 등록하면 새 소식을 놓치지 않아요.
            </div>
          </div>
          <span className="shrink-0 rounded-[10px] bg-primary-soft px-3.5 py-2 text-xs font-bold text-primary">
            알림 설정 ›
          </span>
        </Link>

        {/* ===== 정비사업 뉴스 (board_posts 실데이터) ===== */}
        <section className="rise-in-2 card flex flex-col gap-2.5 rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-ink">정비사업 뉴스</h2>
            <Link href="/town/news" className="text-[11px] font-extrabold text-primary">
              전체 뉴스 ›
            </Link>
          </div>
          {news.length === 0 && (
            <div className="py-3 text-center text-[11px] text-text-3">
              최근 수집된 재건축·재개발 관련 기사가 아직 없어요.
            </div>
          )}
          {news.map((n) => (
            <Link key={n.id} href={`/town/news/${n.id}`} className="group no-underline">
              <div className="text-[12px] font-bold leading-[1.5] text-ink group-hover:text-primary">
                {n.title}
              </div>
              <div className="mt-[2px] text-[10px] text-text-3">
                {[n.sourceName || n.authorLabel, shortDate(n.sourcePublishedAt || n.createdAt), n.city]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </Link>
          ))}
          {news.length > 0 && (
            <p className="text-[10px] text-[#adb5bd]">
              재건축·재개발·정비사업 키워드 매칭 자동 수집 기사 — 원문·출처는 각 기사에서
              확인하세요.
            </p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
