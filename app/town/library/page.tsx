import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { seedGradient, maskNoteAuthor } from "../shared";
import { Icon } from "@/app/components/Icon";
import { TownCategoryNav } from "../TownCategoryNav";
import { ErrorState } from "../../components/ui/EmptyState";
import type { Metadata } from "next";
import { seoAlternates } from "@/lib/seo/alternates";

/* 항목 46b — 루트 레이아웃 제목을 그대로 상속하던 페이지에 개별 메타데이터. */
export const metadata: Metadata = {
  title: "베스트 임장노트 라이브러리 | 누구집",
  description:
    "평점·조회 기준으로 고른 공개 임장노트 모음. 실제 다녀온 사람들의 현장 기록에서 단지의 실체를 확인하세요.",
  alternates: seoAlternates("/town/library"),
};

/* 자료(#8) — 리포트 + 공개 임장노트 공유.
   깔끔한 라벨 섹션(리포트 · 공개 임장노트)으로 정리한 자료 허브.
   주간 다이제스트는 뉴스로 이동(제거). 공개 임장노트(listPublicNotes)를 열람 카드로 노출. */

export const revalidate = 600;

export default async function TownLibraryPage() {
  /* 조회 실패를 빈 배열로 삼키면 아래 "공개된 임장노트가 아직 없어요" 가 뜬다 —
     노트가 있는데도 없다고 말하는 화면이다. 못 읽은 것은 못 읽었다고 말한다. */
  let notes: InspectionNote[] = [];
  let loadFailed = false;
  try {
    notes = await listPublicNotes(24);
  } catch {
    loadFailed = true;
  }

  return (
    <PageShell breadcrumb="동네이야기 › 자료">
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />
      {/* ---------- 페이지 헤더 ---------- */}
      <div className="rise-in mb-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[22px] font-extrabold text-ink">자료</h1>
          <Link
            href="/town/news"
            className="text-[13px] font-bold text-primary no-underline"
          >
            뉴스 ›
          </Link>
        </div>
        <p className="mt-1 text-[13px] leading-[1.6] text-text-2">
          리포트와 이웃들의 공개 임장노트를 한곳에서 열람하세요
        </p>
      </div>

      {/* ---------- 리포트 — 상품 선반 없이 빈 상태만 (가짜 카드 금지) ---------- */}
      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[15px] font-extrabold text-ink">리포트</h2>
          <span className="rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-extrabold text-text-2">
            오픈 전
          </span>
        </div>
        <div className="card rise-in-1 rounded-[16px] px-4 py-5">
          <p className="text-[13px] font-bold text-ink">유료·단지 리포트는 아직 없어요</p>
          <p className="mt-1 text-[12px] leading-[1.65] text-text-2">
            지금은 아래 공개 임장노트만 열람할 수 있어요. 리포트 상품이 열리면 이
            자리에 실제 목록이 올라갑니다.
          </p>
          <Link
            href="/notes"
            className="mt-3 inline-block text-[12px] font-extrabold text-primary no-underline"
          >
            공개 임장노트 보기 ›
          </Link>
        </div>
      </section>

      {/* ---------- 공개 임장노트 공유 — listPublicNotes 실데이터 ---------- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-extrabold text-ink">공개 임장노트</h2>
          <div className="flex items-center gap-3">
            {/* 노트를 읽다 생긴 궁금증의 다음 행동 — 단지 Q&A (키워드 필터 지원) */}
            <Link
              href="/qna"
              className="text-[12px] font-bold text-primary no-underline"
            >
              단지 Q&A ›
            </Link>
            <Link
              href="/notes"
              className="text-[12px] font-bold text-primary no-underline"
            >
              모두 보기 ›
            </Link>
          </div>
        </div>

        {loadFailed ? (
          <ErrorState
            title="공개 임장노트를 지금 불러오지 못했어요"
            desc="공개된 노트가 없다는 뜻이 아니라, 목록 조회 자체가 실패했다는 뜻이에요."
            cause="잠시 후 새로고침해 주세요."
          />
        ) : notes.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Icon name="folder" size={22} />
            </div>
            <div className="text-sm font-bold text-text-1">
              공개된 임장노트가 아직 없어요
            </div>
            <div className="max-w-xs text-xs leading-[1.6] text-text-3">
              노트를 공개하면 이웃들이 자료로 열람할 수 있어요
            </div>
            <Link
              href="/notes/new"
              className="btn-primary mt-1 rounded-[10px] px-4 py-2 text-xs no-underline"
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
                    <span className="absolute left-2 top-2 rounded-[5px] bg-white/90 px-2 py-[2px] text-[10px] font-extrabold text-success">
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
