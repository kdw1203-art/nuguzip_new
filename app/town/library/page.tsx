import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { listReports, type UserReport } from "@/lib/reports/store-db";
import { seedGradient, maskNoteAuthor } from "../shared";
import { Icon } from "@/app/components/Icon";
import { TownCategoryNav } from "../TownCategoryNav";
import { ErrorState } from "../../components/ui/EmptyState";
import type { Metadata } from "next";
import { seoAlternates } from "@/lib/seo/alternates";
import {
  NotesBrowser,
  ReportsBrowser,
  type NoteCardDto,
  type ReportCardDto,
} from "./LibraryBrowser";

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

  /* 리포트 선반은 예전에 "유료·단지 리포트는 아직 없어요"를 **하드코딩**으로
     적어 두었다. 지금은 실제로 0건이라 우연히 맞는 말이지만, 아무도 표를
     들여다보지 않는 문장이라 한 건이라도 올라오는 순간 틀린 말이 된다.
     같은 표(reports)를 홈 사이드바는 이미 읽고 있어서(app/page.tsx), 리포트가
     생기면 홈은 제목·가격을 띄우고 이 페이지는 "아직 없어요"라고 말하는,
     한 표를 두고 두 화면이 반대로 말하는 상태가 된다. 읽어서 말한다. */
  let reports: UserReport[] = [];
  let reportsFailed = false;
  try {
    reports = (await listReports()).slice(0, 12);
  } catch {
    reportsFailed = true;
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

      {/* ---------- 리포트 — reports 표 실조회 (가짜 카드 금지) ----------
           id 는 있지만 리포트 1건을 여는 페이지는 아직 없다(app/reports/[ym] 은
           월간 시황이라 다른 것이고, reports 행에는 본문·파일 컬럼 자체가 없어
           preview_content 말고는 띄울 내용이 없다). 그래서 카드를 링크로 만들지
           않는다 — 눌러도 갈 데가 없는 링크를 만드는 쪽이, 안 눌리는 카드보다
           나쁘다. 상세·구매 화면이 생기면 그때 링크를 건다. */}
      <section id="reports" className="mb-8 scroll-mt-20">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[15px] font-extrabold text-ink">리포트</h2>
          {!reportsFailed && reports.length === 0 && (
            <span className="rounded-[6px] bg-bg chip-pad text-[11px] font-extrabold text-text-2">
              오픈 전
            </span>
          )}
          {/* 판매자 모집 — 구매 쪽 발견 경로만 있고 파는 쪽 초대가 없었다.
              /creators 는 입점 피치 랜딩(성장 U4) — 절차·요율·정직 고지를 담는다 */}
          <Link
            href="/creators"
            className="ml-auto text-[12px] font-bold text-primary no-underline"
          >
            크리에이터 입점 안내 ›
          </Link>
          <Link
            href="/my/creator"
            className="text-[12px] font-bold text-primary no-underline"
          >
            내 노트 판매하기 ›
          </Link>
        </div>

        {reportsFailed ? (
          <ErrorState
            title="리포트 목록을 지금 불러오지 못했어요"
            desc="리포트가 없다는 뜻이 아니라, 목록 조회 자체가 실패했다는 뜻이에요."
            cause="잠시 후 새로고침해 주세요."
          />
        ) : reports.length === 0 ? (
          <div className="card rise-in-1 rounded-[16px] px-4 py-5">
            <p className="text-[13px] font-bold text-ink">유료·단지 리포트는 아직 없어요</p>
            <p className="mt-1 text-[12px] leading-[1.65] text-text-2">
              지금은 아래 공개 임장노트만 열람할 수 있어요. 리포트가 올라오면 이
              자리에 실제 목록이 채워집니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <Link
                href="/notes"
                className="text-[12px] font-extrabold text-primary no-underline"
              >
                공개 임장노트 보기 ›
              </Link>
              <Link
                href="/my/creator"
                className="text-[12px] font-extrabold text-primary no-underline"
              >
                내 노트를 리포트로 판매하기 ›
              </Link>
            </div>
          </div>
        ) : (
          /* 상세·구매 화면이 생겼으므로 링크를 건다(예전 주석의 약속). 가격 단위는
             판매·정산이 포인트라 "P". 필터·정렬은 LibraryBrowser(클라이언트)가 맡고,
             여기서는 이미 읽은 컬럼만 직렬화해 내려준다. */
          <ReportsBrowser
            reports={reports.map(
              (r): ReportCardDto => ({
                id: r.id,
                title: r.title,
                subtitle: r.subtitle?.trim() || null,
                meta: [r.authorLabel?.trim(), r.category?.trim(), r.region?.trim()]
                  .filter(Boolean)
                  .join(" · "),
                price: r.price,
                isPremium: r.isPremium,
                pages: r.pages,
                rating: r.rating,
                tags: r.tags ?? [],
                publishedAt: Date.parse(r.publishedAt) || 0,
              }),
            )}
          />
        )}
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
          <NotesBrowser
            notes={notes.map(
              (n): NoteCardDto => ({
                id: n.id,
                title: n.aptName?.trim() || n.title,
                region: n.region,
                author: maskNoteAuthor(n.authorLabel, n.authorEmail),
                score: Math.round(inspectionAverageScore(n.scores) * 20),
                cover: n.photos.find(Boolean) ?? null,
                gradient: seedGradient(n.region || n.id),
                visited: Boolean(n.visitDate),
                createdAt: Date.parse(n.createdAt) || 0,
              }),
            )}
          />
        )}
      </section>
    </PageShell>
  );
}
