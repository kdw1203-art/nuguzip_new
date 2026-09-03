"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/* 제안 웹6(2026-08-03) — 용어사전 내부 검색. 56개 용어를 스크롤로만 찾던
   화면에 클라이언트 필터를 얹는다. 데이터는 서버가 넘긴 그대로(단일 출처)라
   목록·검색이 어긋날 수 없다. 빈 결과는 "일치 없음"이라고 말한다 —
   여기서의 빈 결과는 순수 문자열 매칭 결과라 정직한 단정이 맞다. */

export type GlossaryGroupData = {
  category: string;
  terms: { slug: string; term: string; short: string }[];
};

export function GlossarySearch({ groups }: { groups: GlossaryGroupData[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return groups;
    return groups
      .map((g) => ({
        ...g,
        terms: g.terms.filter(
          (t) =>
            t.term.toLowerCase().includes(k) || t.short.toLowerCase().includes(k),
        ),
      }))
      .filter((g) => g.terms.length > 0);
  }, [groups, q]);

  const searching = q.trim().length > 0;
  const total = filtered.reduce((s, g) => s + g.terms.length, 0);

  return (
    <>
      {/* 검색 입력 — 16px 미만은 iOS 포커스 줌 유발(모바일 실측 7과 동일 규칙) */}
      <div className="rise-in-1 mt-4 flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2.5">
        <span aria-hidden className="text-text-3">⌕</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="용어 검색 (예: 전용면적, 갭투자)"
          aria-label="용어 검색"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-text-3 md:text-[13px]"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="검색어 지우기"
            className="shrink-0 text-[13px] text-text-3"
          >
            ✕
          </button>
        )}
      </div>

      {/* 분류 바로가기 — 검색 중에는 앵커가 무의미하므로 숨긴다 */}
      {!searching && (
        <nav className="rise-in-1 mt-3 flex flex-wrap gap-2">
          {groups.map((g) => (
            <a
              key={g.category}
              href={`#${encodeURIComponent(g.category)}`}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-bold text-text-1"
            >
              {g.category} {g.terms.length}
            </a>
          ))}
        </nav>
      )}

      {searching && (
        <p className="mt-3 text-[12px] text-text-3">
          ‘{q.trim()}’ 일치 {total}개
        </p>
      )}

      <div className="mt-5 flex flex-col gap-6">
        {filtered.length === 0 ? (
          <div className="card rounded-2xl px-4 py-8 text-center text-[13px] text-text-3">
            이름·요약에 일치하는 용어가 없어요. 다른 표현으로 검색해 보세요.
          </div>
        ) : (
          filtered.map((g, gi) => (
            <section
              key={g.category}
              id={encodeURIComponent(g.category)}
              className={`rise-in-${Math.min(gi + 2, 6)} scroll-mt-24`}
            >
              <h2 className="text-[15px] font-extrabold text-ink">{g.category}</h2>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {g.terms.map((t) => (
                  <Link
                    prefetch={false}
                    key={t.slug}
                    href={`/glossary/${t.slug}`}
                    className="card rounded-[14px] p-4"
                  >
                    <div className="text-[13px] font-extrabold text-ink">{t.term}</div>
                    <div className="mt-1 text-[12px] leading-[1.65] text-text-2">
                      {t.short}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
