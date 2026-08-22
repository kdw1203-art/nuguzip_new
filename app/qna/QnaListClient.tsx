"use client";

/* 단지 Q&A 목록 + 필터 (2026-08-10 ISR 전환)
   서버는 원래도 100건을 한 번 받아 메모리에서 걸렀다(개수 일관성 주석 참조).
   그 거르는 자리만 브라우저로 옮긴다 — 필터 의미·개수 계산은 서버 판과 동일
   코드다. useSearchParams 금지(프리렌더 HTML 카드 소실 — /town/news 실측),
   SSR 은 전체를 그리고 마운트 후 location.search + popstate 로 적용.
   시각 라벨은 서버가 계산해 row 에 실어 준다(하이드레이션 불일치 방지,
   ISR 주기만큼 낡을 수 있음). AskForm·사이드바는 서버 조각(children)으로
   받아 레이아웃 안에 그대로 끼운다. */

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/app/components/Icon";
import { EmptyState } from "@/app/components/ui/EmptyState";
import type { QnaQuestion } from "@/lib/qna/types";
import {
  QNA_TOPICS,
  QNA_TOPIC_BY_KEY,
  countByTopic,
  filterByTopic,
  isQnaTopicKey,
} from "@/lib/qna/topics";

type StatusKey = "all" | "open" | "answered";
type SortKey = "recent" | "answers" | "views";

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "open", label: "답변 대기" },
  { key: "answered", label: "답변 완료" },
];
const SORT_TABS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "최신" },
  { key: "answers", label: "답변 많은" },
  { key: "views", label: "조회 많은" },
];

export type QnaRow = { q: QnaQuestion; complexHref: string | null; timeLabel: string };

type Filter = { status: StatusKey; sort: SortKey; topic: string | null; q: string | null };

function filterByKeyword(list: QnaRow[], q: string | null): QnaRow[] {
  if (!q) return list;
  const needle = q.toLowerCase().replace(/\s+/g, "");
  if (!needle) return list;
  return list.filter(({ q: item }) => {
    const hay = `${item.title} ${item.body ?? ""} ${item.complexName ?? ""} ${item.region ?? ""}`
      .toLowerCase()
      .replace(/\s+/g, "");
    return hay.includes(needle);
  });
}

function pushFilterUrl(f: Filter) {
  const url = new URL(window.location.href);
  const sp = url.searchParams;
  if (f.status !== "all") sp.set("status", f.status);
  else sp.delete("status");
  if (f.sort !== "recent") sp.set("sort", f.sort);
  else sp.delete("sort");
  if (f.topic) sp.set("topic", f.topic);
  else sp.delete("topic");
  if (f.q) sp.set("q", f.q);
  else sp.delete("q");
  window.history.pushState(null, "", url);
}

function QuestionCard({ row }: { row: QnaRow }) {
  const { q, complexHref } = row;
  const answered = q.status === "answered";
  return (
    <article className="card card-hover flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span
          className={`rounded-[6px] chip-pad text-[11px] font-extrabold ${
            answered ? "bg-primary-soft text-primary" : "bg-[rgba(127,140,158,.14)] text-text-2"
          }`}
        >
          {answered ? "답변 완료" : "답변 대기"}
        </span>
        {q.bountyPoints > 0 && (
          <span className="rounded-[6px] bg-[rgba(245,158,11,.14)] chip-pad text-[11px] font-extrabold text-[#b45309]">
            현상금 {q.bountyPoints.toLocaleString()}P
          </span>
        )}
        {q.isSample && (
          <span className="rounded-full bg-[rgba(127,140,158,.12)] chip-pad text-[11px] font-semibold text-text-3">
            예시
          </span>
        )}
        <span className="ml-auto text-[11px] text-text-3">{row.timeLabel}</span>
      </div>

      <Link href={`/qna/${q.id}`} className="no-underline">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">{q.title}</h3>
        {q.body && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-2">{q.body}</p>
        )}
      </Link>

      {q.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {q.tags.slice(0, 5).map((t) => (
            <span key={t} className="chip-tag chip-pad text-[10px]">
              #{t}
            </span>
          ))}
        </div>
      )}

      {(complexHref || q.complexName || q.region) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {complexHref ? (
            <Link
              href={complexHref}
              className="press inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary no-underline"
            >
              <Icon name="building" size={12} />
              {q.complexName ?? "단지 정보"}
              <span aria-hidden>→</span>
            </Link>
          ) : (
            q.complexName && (
              <span className="rounded-full bg-[rgba(127,140,158,.1)] px-2.5 py-1 text-[11px] font-semibold text-text-3">
                {q.complexName}
              </span>
            )
          )}
          {q.region && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(127,140,158,.1)] px-2.5 py-1 text-[11px] font-semibold text-text-3">
              <Icon name="pin" size={12} />
              {q.region}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-2.5 text-[12px] text-text-3">
        <span className="inline-flex items-center gap-1">
          <Icon name="user" size={13} />
          {q.authorLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="messages-square" size={13} />
          답변 {q.answerCount}
        </span>
        <span className="ml-auto">조회 {q.viewCount.toLocaleString()}</span>
      </div>
    </article>
  );
}

export function QnaListClient({
  rows,
  askForm,
  sidebar,
}: {
  rows: QnaRow[];
  /** 서버 조각 — 질문 등록 폼. 클라이언트 셸 안에 그대로 끼운다. */
  askForm: ReactNode;
  /** 서버 조각 — 우측 사이드바(안내·광고). */
  sidebar: ReactNode;
}) {
  const [f, setF] = useState<Filter>({ status: "all", sort: "recent", topic: null, q: null });
  /* 검색 입력값 — 제출 전까지는 필터에 반영하지 않는다(타이핑마다 URL 이 바뀌면
     뒤로가기 히스토리가 글자 수만큼 쌓인다). 딥링크·뒤로가기로 f.q 가 바뀌면 동기화. */
  const [qInput, setQInput] = useState("");
  useEffect(() => {
    setQInput(f.q ?? "");
  }, [f.q]);
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      const s = p.get("status");
      const so = p.get("sort");
      const t = p.get("topic");
      setF({
        status: s === "open" || s === "answered" ? s : "all",
        sort: so === "answers" || so === "views" ? so : "recent",
        topic: t && isQnaTopicKey(t) ? t : null,
        q: (p.get("q") ?? "").trim().slice(0, 80) || null,
      });
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const set = (patch: Partial<Filter>) => {
    const next = { ...f, ...patch };
    setF(next);
    pushFilterUrl(next);
  };

  /* 서버 판과 동일한 순서: 키워드 먼저 → 개수 → 상태 → 주제 → 정렬 */
  const all = filterByKeyword(rows, f.q);
  const statusCounts = {
    all: all.length,
    open: all.filter((r) => r.q.status !== "answered").length,
    answered: all.filter((r) => r.q.status === "answered").length,
  };
  const topicCounts = countByTopic(all.map((r) => r.q));

  const byStatus =
    f.status === "all"
      ? all
      : all.filter((r) => (f.status === "answered") === (r.q.status === "answered"));
  const topicSet = new Set(filterByTopic(byStatus.map((r) => r.q), f.topic).map((q) => q.id));
  const filtered = byStatus.filter((r) => topicSet.has(r.q.id));
  const items = [...filtered].sort((a, b) => {
    if (f.sort === "answers") return b.q.answerCount - a.q.answerCount;
    if (f.sort === "views") return b.q.viewCount - a.q.viewCount;
    return 0; // 최신 — 서버가 created_at 내림차순으로 준다
  });

  const activeTopic = f.topic ? QNA_TOPIC_BY_KEY[f.topic] : null;

  const tabPill = (on: boolean) =>
    on
      ? "press rounded-full bg-primary px-4 py-2 text-[13px] font-bold"
      : "press glass rounded-full px-4 py-2 text-[13px] font-semibold text-text-2";
  const chip = (on: boolean) =>
    on
      ? "chip-active px-3 py-1.5 text-xs"
      : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2";

  return (
    <>
      {/* ── 상태 탭 + 정렬 ───────────────────────────── */}
      <div className="rise-in mt-3 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => {
          const on = t.key === f.status;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => set({ status: t.key })}
              style={on ? { color: "#fff" } : undefined}
              className={tabPill(on)}
            >
              {t.label}
              <span className="ml-1 opacity-70">{statusCounts[t.key]}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1.5">
          {SORT_TABS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => set({ sort: s.key })}
              className={chip(s.key === f.sort)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 검색(2026-08-22) — 키워드 필터(filterByKeyword)는 처음부터 있었는데
          입력창이 없어 ?q= 딥링크로만 닿을 수 있었다. 보이는 검색창을 단다 —
          제출 시 기존 set({ q }) 경로 그대로라 개수·빈 상태 문구도 같이 움직인다. */}
      <form
        className="rise-in-1 mt-2.5 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: qInput.trim().slice(0, 80) || null });
        }}
      >
        <input
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          maxLength={80}
          placeholder="단지명·지역·키워드로 질문 검색"
          aria-label="질문 검색"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-ink placeholder:text-text-3"
        />
        <button type="submit" className="btn-primary press rounded-xl px-4 py-2 text-[13px]">
          검색
        </button>
      </form>

      {/* ── 세부 카테고리(주제) ──────────────────────── */}
      <div className="rise-in-1 mt-2.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => set({ topic: null })} className={chip(f.topic === null)}>
          전체 주제
        </button>
        {QNA_TOPICS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => set({ topic: f.topic === t.key ? null : t.key })}
            className={chip(f.topic === t.key)}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
            <span className="ml-1 opacity-60">{topicCounts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* 딥링크 키워드 — 무엇으로 좁혀졌는지 밝히고 해제 버튼을 준다 */}
      {f.q && (
        <div className="rise-in-1 mt-2.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">
            ‘{f.q}’ 로 좁힘
          </span>
          <button type="button" onClick={() => set({ q: null })} className={chip(false)}>
            전체 질문 보기
          </button>
        </div>
      )}

      <p className="rise-in-1 mt-2.5 text-[12px] leading-[1.6] text-text-3">
        {activeTopic ? `‘${activeTopic.label}’ 주제 ` : ""}
        <b className="text-text-1">{items.length}</b>건
        {f.q && <> — 최근 질문 100건 안에서 ‘{f.q}’ 를 찾은 결과예요.</>}
        {activeTopic && <> — 주제는 작성자가 붙인 태그와 제목·본문에서 추정해 좁힌 결과예요.</>}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── 본문 ───────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="rise-in-2">{askForm}</div>

          {items.length === 0 ? (
            <EmptyState
              icon="messages-square"
              title={
                f.q
                  ? `‘${f.q}’ 관련 질문이 아직 없어요`
                  : all.length === 0
                    ? "아직 등록된 질문이 없어요"
                    : "이 조건에 맞는 질문이 없어요"
              }
              desc={
                f.q
                  ? "최근 질문 100건 안에서는 찾지 못했어요. 위에서 첫 질문을 남기면 이 단지를 보는 다른 사람에게도 함께 보여요."
                  : all.length === 0
                    ? "이 단지·지역에 대해 궁금한 점을 위에서 첫 질문으로 남겨보세요."
                    : "상태나 주제 필터를 바꿔 보시거나, 위에서 새 질문을 남겨보세요."
              }
              action={
                f.q || all.length > 0 ? { href: "/qna", label: "전체 질문 보기" } : undefined
              }
            />
          ) : (
            <div className="rise-in-3 flex flex-col gap-3">
              {items.map((row) => (
                <QuestionCard key={row.q.id} row={row} />
              ))}
            </div>
          )}
        </div>

        {/* ── 사이드 (서버 조각) ─────────────────── */}
        <aside className="flex flex-col gap-3.5">{sidebar}</aside>
      </div>
    </>
  );
}

export default QnaListClient;
