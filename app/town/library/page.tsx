import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { ExampleBadge } from "../../components/ExampleBadge";
import { getWeeklyDigest } from "@/lib/newui/digest";
import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { seedGradient, maskNoteAuthor } from "../shared";
import { Icon } from "@/app/components/Icon";

/* 자료(#8) — 리포트 + 공개 임장노트 공유 + 주간 다이제스트(피처드).
   시안 8l(마켓)을 자료 중심으로 개편: 다이제스트를 자료와 합치고(#6),
   공개 임장노트(listPublicNotes)를 열람 가능한 카드로 노출한다. */

export const revalidate = 600;

/* 더미데이터 정책: 리포트 상품은 오픈 준비 중 — 예시 배지로 정직 표기 */
const EXAMPLE_REPORTS = [
  {
    badge: "단지 리포트",
    title: "관양동 재건축 흐름 분석 (2026 상반기판)",
    meta: "PDF 34p · 김OO 중개사",
  },
  {
    badge: "지역 리포트",
    title: "1기 신도시 특별법 적용 시나리오 정리",
    meta: "PDF 22p · 편집팀",
  },
];

function digestPreview(
  d: Awaited<ReturnType<typeof getWeeklyDigest>> | null,
): string {
  if (!d) return "이번 주 요약을 준비 중이에요";
  const parts: string[] = [];
  if (d.news.length > 0) parts.push(`뉴스 ${d.news.length}건`);
  if (d.market.length > 0) parts.push(`주요 지역 시세 ${d.market.length}곳`);
  if (d.community.count > 0) parts.push(`이웃 글 ${d.community.count}건`);
  return parts.length > 0 ? `이번 주 ${parts.join(" · ")}` : "이번 주 요약을 준비 중이에요";
}

export default async function TownLibraryPage() {
  const [digest, notes] = await Promise.all([
    getWeeklyDigest().catch(() => null),
    listPublicNotes(24).catch((): InspectionNote[] => []),
  ]);

  return (
    <PageShell breadcrumb="동네이야기 › 자료">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">자료</h1>
        <Link href="/town/news" className="text-[13px] font-bold text-primary">
          뉴스 ›
        </Link>
      </div>

      {/* 피처드 — 주간 다이제스트 (#6: 다이제스트를 자료와 합침) */}
      <Link
        href="/digest"
        className="rise-in ai-panel mb-6 flex items-center justify-between gap-3 rounded-[20px] p-6 no-underline"
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#7ea2ff]">
            <Icon name="🗞" size={14} />주간 다이제스트
            <span className="rounded bg-white/10 px-1.5 py-px text-[10px] text-ai-text">
              {digest?.weekLabel ?? "최근 7일"}
            </span>
          </div>
          <div className="text-[15px] font-extrabold text-white">
            {digestPreview(digest)}
          </div>
          <div className="text-xs text-ai-text">뉴스·시세·커뮤니티를 한눈에 요약</div>
        </div>
        <span className="shrink-0 rounded-[10px] bg-white/15 px-3.5 py-2 text-xs font-bold text-white">
          전체 보기 ›
        </span>
      </Link>

      {/* 리포트 (단지·지역 리포트 등) — 오픈 준비 중 예시 */}
      <section className="mb-6">
        <div className="mb-2.5 flex items-center gap-2">
          <h2 className="text-[15px] font-extrabold text-ink">리포트</h2>
          <span className="rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-extrabold text-text-2">
            오픈 준비 중
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {EXAMPLE_REPORTS.map((r, i) => (
            <div
              key={r.title}
              className={`card rise-in-${i + 1} flex flex-col gap-2 rounded-[16px] p-[18px]`}
            >
              <div className="flex items-center gap-1.5">
                <span className="rounded-[5px] bg-[#fdf3e7] px-2 py-[3px] text-[11px] font-extrabold text-[#c07a3a]">
                  {r.badge}
                </span>
                <ExampleBadge />
              </div>
              <div className="text-[15px] font-extrabold leading-[1.4] text-ink">
                {r.title}
              </div>
              <div className="text-xs text-text-3">{r.meta}</div>
              <span className="mt-1 cursor-default rounded-[10px] border border-line bg-bg px-3 py-2 text-center text-xs font-bold text-text-3">
                열람 오픈 준비 중
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] leading-[1.6] text-text-3">
          리포트는 오픈 준비 중인 예시예요 — 준비되면 실제 자료로 교체됩니다.
        </p>
      </section>

      {/* 공개 임장노트 공유 — listPublicNotes 실데이터 */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold text-ink">공개 임장노트</h2>
          <Link href="/notes" className="text-xs font-bold text-primary">
            모두 보기 ›
          </Link>
        </div>

        {notes.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
            <div className="text-[26px]"><Icon name="🗂" size={26} /></div>
            <div className="text-sm font-bold text-text-1">
              공개된 임장노트가 아직 없어요
            </div>
            <div className="text-xs text-text-3">
              노트를 공개하면 이웃들이 자료로 열람할 수 있어요
            </div>
            <Link
              href="/notes/new"
              className="btn-primary mt-1 rounded-[10px] px-4 py-2 text-xs"
            >
              첫 노트 쓰기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {notes.map((n, i) => {
              const cover = n.photos.find(Boolean) ?? null;
              const score = Math.round(inspectionAverageScore(n.scores) * 20);
              return (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className={`card card-hover rise-in-${Math.min(i + 1, 6)} flex flex-col overflow-hidden rounded-[16px]`}
                >
                  <div
                    className="relative h-[112px] w-full overflow-hidden"
                    style={{ background: seedGradient(n.region || n.id) }}
                  >
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                    <span className="absolute left-2 top-2 rounded-[5px] bg-white/90 px-2 py-[2px] text-[10px] font-extrabold text-[#1a7f4e]">
                      {n.visitDate ? "✓ 직접 방문" : "임장노트"}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <div className="line-clamp-2 text-[13px] font-extrabold leading-[1.4] text-ink">
                      {n.aptName?.trim() || n.title}
                    </div>
                    <div className="text-[11px] text-text-3">{n.region}</div>
                    <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-text-3">
                      <span className="min-w-0 truncate">
                        {maskNoteAuthor(n.authorLabel, n.authorEmail)}
                      </span>
                      <span className="shrink-0 font-bold text-primary">{score}점</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}
