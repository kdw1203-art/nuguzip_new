"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/* 자료실 인터랙션(2026-08-22) — 하부 카테고리 7종 중 자료만 클라이언트 상호작용이
   0개였다(필터·정렬·검색 전무, 전부 정적 링크). 이미 서버가 읽어 오던 컬럼
   (price·published_at·rating·tags·subtitle·visitDate·score)을 화면에서 거르고
   정렬할 수 있게 한다 — 새 데이터 없음, 있던 것을 여는 것뿐. 카드 치수는 필터
   전후가 같아 레이아웃 시프트가 없다(CLS 0 원칙). */

export type ReportCardDto = {
  id: string;
  title: string;
  subtitle: string | null;
  meta: string; // 작성자 · 분류 · 지역 (서버에서 합쳐 내려줌)
  price: number;
  isPremium: boolean;
  pages: number;
  rating: number;
  tags: string[];
  publishedAt: number; // ms (정렬용)
};

export type NoteCardDto = {
  id: string;
  title: string;
  region: string;
  author: string;
  score: number; // 0~100
  cover: string | null;
  gradient: string; // 커버 없는 카드의 시드 그라디언트 (서버 계산)
  visited: boolean;
  createdAt: number; // ms
};

const chip = (on: boolean) =>
  on
    ? "press chip-active shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold"
    : "press chip shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold";

/* ── 리포트 선반 — 무료/유료 필터 + 최신·가격 정렬 ── */

type ReportFilter = "all" | "free" | "paid";
type ReportSort = "latest" | "priceAsc" | "priceDesc";

export function ReportsBrowser({ reports }: { reports: ReportCardDto[] }) {
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [sort, setSort] = useState<ReportSort>("latest");

  const visible = useMemo(() => {
    const paid = (r: ReportCardDto) => r.isPremium && r.price > 0;
    let list = reports;
    if (filter === "free") list = reports.filter((r) => !paid(r));
    else if (filter === "paid") list = reports.filter(paid);
    const arr = [...list];
    if (sort === "priceAsc") arr.sort((a, b) => a.price - b.price);
    else if (sort === "priceDesc") arr.sort((a, b) => b.price - a.price);
    else arr.sort((a, b) => b.publishedAt - a.publishedAt);
    return arr;
  }, [reports, filter, sort]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setFilter("all")} className={chip(filter === "all")}>
          전체 {reports.length}
        </button>
        <button type="button" onClick={() => setFilter("free")} className={chip(filter === "free")}>
          무료
        </button>
        <button type="button" onClick={() => setFilter("paid")} className={chip(filter === "paid")}>
          유료
        </button>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <button type="button" onClick={() => setSort("latest")} className={chip(sort === "latest")}>
          최신순
        </button>
        <button
          type="button"
          onClick={() => setSort("priceAsc")}
          className={chip(sort === "priceAsc")}
        >
          가격 낮은순
        </button>
        <button
          type="button"
          onClick={() => setSort("priceDesc")}
          className={chip(sort === "priceDesc")}
        >
          가격 높은순
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="card rounded-[16px] px-4 py-6 text-center text-[12px] text-text-3">
          이 조건의 리포트가 없어요 — 필터를 바꿔 보세요.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((r) => {
            const paid = r.isPremium && r.price > 0;
            return (
              <li key={r.id} className="card card-hover rounded-[16px]">
                <Link href={`/town/library/${r.id}`} className="block px-4 py-3.5 no-underline">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-[13px] font-extrabold leading-[1.45] text-ink">
                        {r.title}
                      </div>
                      {r.subtitle && (
                        <div className="mt-0.5 line-clamp-1 text-[11.5px] text-text-2">
                          {r.subtitle}
                        </div>
                      )}
                      <div className="mt-0.5 truncate text-[11px] text-text-3">{r.meta}</div>
                    </div>
                    <span className="shrink-0 text-[12px] font-extrabold text-primary">
                      {paid ? `${r.price.toLocaleString("ko-KR")}P` : "무료"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-3">
                    {r.pages > 0 && <span>{r.pages}쪽</span>}
                    {r.rating > 0 && <span>★ {r.rating.toFixed(1)}</span>}
                    {r.tags.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-full bg-[#f2f4f8] px-2 py-0.5 text-[10px]">
                        #{t}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── 공개 임장노트 — 직접 방문 필터 + 최신·평점 정렬 ── */

type NoteSort = "latest" | "score";

export function NotesBrowser({ notes }: { notes: NoteCardDto[] }) {
  const [visitedOnly, setVisitedOnly] = useState(false);
  const [sort, setSort] = useState<NoteSort>("latest");

  const visible = useMemo(() => {
    const list = visitedOnly ? notes.filter((n) => n.visited) : notes;
    const arr = [...list];
    if (sort === "score") arr.sort((a, b) => b.score - a.score);
    else arr.sort((a, b) => b.createdAt - a.createdAt);
    return arr;
  }, [notes, visitedOnly, sort]);

  const visitedCount = notes.filter((n) => n.visited).length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setVisitedOnly(false)} className={chip(!visitedOnly)}>
          전체 {notes.length}
        </button>
        <button
          type="button"
          onClick={() => setVisitedOnly(true)}
          className={chip(visitedOnly)}
          disabled={visitedCount === 0}
        >
          ✓ 직접 방문 {visitedCount}
        </button>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <button type="button" onClick={() => setSort("latest")} className={chip(sort === "latest")}>
          최신순
        </button>
        <button type="button" onClick={() => setSort("score")} className={chip(sort === "score")}>
          평점순
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="card rounded-[16px] px-4 py-6 text-center text-[12px] text-text-3">
          이 조건의 노트가 없어요 — 필터를 바꿔 보세요.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((n) => (
            <Link
              key={n.id}
              href={`/notes/${n.id}`}
              className="card card-hover flex flex-col overflow-hidden rounded-[16px]"
            >
              <div
                className="relative h-[112px] w-full overflow-hidden"
                style={{ background: n.gradient }}
              >
                {n.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
                <span className="absolute left-2 top-2 rounded-[5px] bg-white/90 chip-pad text-[10px] font-extrabold text-success">
                  {n.visited ? "✓ 직접 방문" : "임장노트"}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <div className="line-clamp-2 text-[13px] font-extrabold leading-[1.4] text-ink">
                  {n.title}
                </div>
                <div className="text-[11px] text-text-3">{n.region}</div>
                <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-text-3">
                  <span className="min-w-0 truncate">{n.author}</span>
                  <span className="shrink-0 font-bold text-primary">{n.score}점</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
