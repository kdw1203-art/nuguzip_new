import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { EmptyState, ErrorState } from "@/app/components/ui/EmptyState";
import { AdSlot } from "@/app/components/ads/AdSlot";
import { getAdViewer } from "@/lib/ads/viewer";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { listQuestions } from "@/lib/qna/store";
import { complexHrefKey, resolveComplexHrefs } from "@/lib/newui/complex-link";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";
import type { QnaQuestion } from "@/lib/qna/types";
import {
  QNA_TOPICS,
  QNA_TOPIC_BY_KEY,
  countByTopic,
  filterByTopic,
  isQnaTopicKey,
} from "@/lib/qna/topics";
import { AskForm } from "./AskForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "단지 Q&A | 누구집",
  description:
    "아파트 단지·동네에 대한 궁금증을 묻고 이웃·실거주자에게 답을 받아보세요. 재건축·학군·주차·교통까지 단지 Q&A에서 확인하세요.",
  robots: { index: true, follow: true },
  alternates: seoAlternates("/qna"),
};

/** 테마 구분: 단지 Q&A = 청록 (대화·질문). subtree 안에서 text-primary·
 *  bg-primary-soft·chip-active·btn-primary 가 청록으로 재테마됨. */
const QNA_THEME = {
  "--primary": "#0d9488",
  "--primary-soft": "#e3f5f2",
  "--primary-strong": "#0a7a70",
} as CSSProperties;

/* ---------- 필터 축 ---------- */

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

function asStatus(v: string | undefined): StatusKey {
  return v === "open" || v === "answered" ? v : "all";
}

function asSort(v: string | undefined): SortKey {
  return v === "answers" || v === "views" ? v : "recent";
}

type Base = { status: StatusKey; sort: SortKey; topic: string | null; q: string | null };

/** 현재 필터를 유지한 채 한 축만 바꾼 URL — 필터가 서로를 리셋하지 않게 한다. */
function hrefWith(base: Base, patch: Partial<Base>): string {
  const next = { ...base, ...patch };
  const sp = new URLSearchParams();
  if (next.status !== "all") sp.set("status", next.status);
  if (next.sort !== "recent") sp.set("sort", next.sort);
  if (next.topic) sp.set("topic", next.topic);
  if (next.q) sp.set("q", next.q);
  const qs = sp.toString();
  return qs ? `/qna?${qs}` : "/qna";
}

/* 연동(2): 임장노트·단지 허브에서 "이 단지 Q&A" 로 올 때 쓰는 축.
   단지명을 그대로 넘겨받아 제목·본문·단지명·지역에서 찾는다. 검색은 서버 쿼리
   대신 이미 불러온 100건 안에서 하므로, 결과가 0이어도 "그 단지 질문이 아직
   없다"가 아니라 "최근 100건 중에는 없다"로 문구를 적는다 — 없는 것을 단정하지
   않는다. */
function filterByKeyword(list: QnaQuestion[], q: string | null): QnaQuestion[] {
  if (!q) return list;
  const needle = q.toLowerCase().replace(/\s+/g, "");
  if (!needle) return list;
  return list.filter((item) => {
    const hay = `${item.title} ${item.body ?? ""} ${item.complexName ?? ""} ${item.region ?? ""}`
      .toLowerCase()
      .replace(/\s+/g, "");
    return hay.includes(needle);
  });
}

/** 상대/짧은 날짜 — 하루 이내는 시간, 30일 이내는 N일 전, 이후는 YYYY.MM.DD. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) {
    const h = Math.floor(diff / (60 * 60 * 1000));
    return h < 1 ? "방금 전" : `${h}시간 전`;
  }
  if (diff < 30 * day) return `${Math.floor(diff / day)}일 전`;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/* ---------- 카드 ---------- */

/** 질문 + 그 질문이 가리키는 단지 허브 링크(있을 때만) */
type QuestionRow = { q: QnaQuestion; complexHref: string | null };

function QuestionCard({ row }: { row: QuestionRow }) {
  const { q, complexHref } = row;
  const answered = q.status === "answered";
  return (
    <article className="card card-hover flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span
          className={`rounded-[6px] px-2 py-[3px] text-[11px] font-extrabold ${
            answered ? "bg-primary-soft text-primary" : "bg-[rgba(127,140,158,.14)] text-text-2"
          }`}
        >
          {answered ? "답변 완료" : "답변 대기"}
        </span>
        {q.bountyPoints > 0 && (
          <span className="rounded-[6px] bg-[rgba(245,158,11,.14)] px-2 py-[3px] text-[11px] font-extrabold text-[#b45309]">
            현상금 {q.bountyPoints.toLocaleString()}P
          </span>
        )}
        {q.isSample && (
          <span className="rounded-full bg-[rgba(127,140,158,.12)] px-2 py-0.5 text-[11px] font-semibold text-text-3">
            예시
          </span>
        )}
        <span className="ml-auto text-[11px] text-text-3">{shortDate(q.createdAt)}</span>
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
            <span key={t} className="chip-tag px-2 py-0.5 text-[10px]">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* 연동 줄 — 단지 허브가 실제로 확인된 질문에만 링크를 건다.
          단지 허브에는 지도·실거래·임장노트·이 단지 Q&A 가 모두 붙어 있다. */}
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

/* ---------- 페이지 ---------- */

export default async function QnaListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const status = asStatus(one(sp.status));
  const sort = asSort(one(sp.sort));
  const topicRaw = one(sp.topic) ?? null;
  const topic = isQnaTopicKey(topicRaw) ? topicRaw : null;
  const keyword = (one(sp.q) ?? "").trim().slice(0, 80) || null;
  const base: Base = { status, sort, topic, q: keyword };

  /* 2026-07-26: store 가 실패 때 `[]` 를 돌려주던 걸 던지도록 고쳤다. 질문 등록
     폼(AskForm)은 그대로 두고 — 목록이 안 보인다고 질문까지 못 하게 할 이유는
     없다 — 목록 자리에만 "지금 불러오지 못했다"고 쓴다.

     상태 필터를 쿼리로 내리지 않고 한 번에 받아서 메모리에서 가른다. 그래야
     탭·주제 옆 개수가 전부 같은 스냅샷에서 나온 실제 값이 된다(개수만 따로
     세는 쿼리를 붙이면 그 사이에 값이 어긋난다). limit 은 100 이 상한이다. */
  const loaded = await listQuestions({ limit: 100 }).then(
    (items) => ({ ok: true as const, items }),
    (err: unknown) => {
      logger.error("[qna] 질문 목록 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );
  /* 키워드를 먼저 적용한다 — 그래야 탭·주제 옆 개수가 "지금 화면에 걸린 조건
     안에서의 실제 건수" 가 된다(전체 개수를 보여주면 눌렀을 때 안 맞는다). */
  const all = filterByKeyword(loaded.ok ? loaded.items : [], keyword);

  const statusCounts = {
    all: all.length,
    open: all.filter((q) => q.status !== "answered").length,
    answered: all.filter((q) => q.status === "answered").length,
  };
  const topicCounts = countByTopic(all);

  const byStatus =
    status === "all"
      ? all
      : all.filter((q) => (status === "answered") === (q.status === "answered"));
  const filtered = filterByTopic(byStatus, topic);
  const items = [...filtered].sort((a, b) => {
    if (sort === "answers") return b.answerCount - a.answerCount;
    if (sort === "views") return b.viewCount - a.viewCount;
    return 0; // 최신 — store 가 이미 created_at 내림차순으로 준다
  });

  /* 연동(1): 질문이 가리키는 단지의 허브 주소를 실제로 조회해서 붙인다.
     resolveComplexHref 는 요청당 cache() 라 같은 단지는 한 번만 찾는다.
     못 찾으면 링크를 안 걸 뿐 질문 자체는 그대로 보인다 — 없는 단지 페이지로
     보내는 죽은 링크를 만드는 것보다 낫다. (app/notes/[id] 와 같은 판단)

     2026-08-01: Promise.all 로 전부 동시에 쏘던 것을 고쳤다. 질문 100건의
     단지명이 서로 다르면 렌더 한 번에 DB 왕복이 최대 100회 — Auth 서버 연결
     10개짜리 프로젝트에 이 페이지 하나가 Cloudflare 525 와 57014(statement
     timeout)를 만들고 있었다. 이제 (단지명, 지역) 중복을 먼저 접고, 동시 4개
     제한 + 전체 3초 마감으로 돈다. 마감을 넘긴 나머지는 링크만 생략된다 —
     링크는 부가 정보라 "조회 실패"를 위장하는 것이 아니라 조회 자체를 하지
     않은 것이고, 질문 데이터는 온전히 보인다. */
  const resolved = await resolveComplexHrefs(
    items
      .filter((q) => !q.complexId && q.complexName)
      .map((q) => ({ name: q.complexName, region: q.region })),
  );
  const rows: QuestionRow[] = items.map((q) => {
    if (q.complexId) return { q, complexHref: `/complex/${encodeURIComponent(q.complexId)}` };
    if (!q.complexName) return { q, complexHref: null };
    return { q, complexHref: resolved.get(complexHrefKey(q.complexName, q.region)) ?? null };
  });

  const viewer = await getAdViewer();
  const activeTopic = topic ? QNA_TOPIC_BY_KEY[topic] : null;

  return (
    <PageShell breadcrumb="홈 › 동네이야기 › 단지 Q&A" title="단지 Q&A" wide>
      <TownCategoryNav stick />

      <div style={QNA_THEME}>
        {/* ── 상태 탭 + 정렬 ───────────────────────────── */}
        <div className="rise-in mt-3 flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((t) => {
            const on = t.key === status;
            return (
              <Link
                key={t.key}
                href={hrefWith(base, { status: t.key })}
                style={on ? { color: "#fff" } : undefined}
                className={
                  on
                    ? "press rounded-full bg-primary px-4 py-2 text-[13px] font-bold no-underline"
                    : "press glass rounded-full px-4 py-2 text-[13px] font-semibold text-text-2 no-underline"
                }
              >
                {t.label}
                <span className="ml-1 opacity-70">{statusCounts[t.key]}</span>
              </Link>
            );
          })}
          <div className="ml-auto flex items-center gap-1.5">
            {SORT_TABS.map((s) => (
              <Link
                key={s.key}
                href={hrefWith(base, { sort: s.key })}
                className={
                  s.key === sort
                    ? "chip-active px-3 py-1.5 text-xs no-underline"
                    : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline"
                }
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        {/* ── 세부 카테고리(주제) ──────────────────────── */}
        <div className="rise-in-1 mt-2.5 flex flex-wrap items-center gap-1.5">
          <Link
            href={hrefWith(base, { topic: null })}
            className={
              topic === null
                ? "chip-active px-3 py-1.5 text-xs no-underline"
                : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline"
            }
          >
            전체 주제
          </Link>
          {QNA_TOPICS.map((t) => (
            <Link
              key={t.key}
              href={hrefWith(base, { topic: topic === t.key ? null : t.key })}
              className={
                topic === t.key
                  ? "chip-active px-3 py-1.5 text-xs no-underline"
                  : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline"
              }
            >
              <span className="mr-1">{t.icon}</span>
              {t.label}
              <span className="ml-1 opacity-60">{topicCounts[t.key]}</span>
            </Link>
          ))}
        </div>

        {/* 임장노트·단지 허브에서 넘어온 키워드 — 무엇으로 좁혀졌는지 밝히고 해제 링크를 준다 */}
        {keyword && (
          <div className="rise-in-1 mt-2.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">
              ‘{keyword}’ 로 좁힘
            </span>
            <Link
              href={hrefWith(base, { q: null })}
              className="press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline"
            >
              전체 질문 보기
            </Link>
          </div>
        )}

        <p className="rise-in-1 mt-2.5 text-[12px] leading-[1.6] text-text-3">
          {loaded.ok ? (
            <>
              {activeTopic ? `‘${activeTopic.label}’ 주제 ` : ""}
              <b className="text-text-1">{items.length}</b>건
              {keyword && <> — 최근 질문 100건 안에서 ‘{keyword}’ 를 찾은 결과예요.</>}
              {activeTopic && (
                <> — 주제는 작성자가 붙인 태그와 제목·본문에서 추정해 좁힌 결과예요.</>
              )}
            </>
          ) : (
            "질문 수를 지금 확인할 수 없어요."
          )}
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
          {/* ── 본문 ───────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="rise-in-2">
              <AskForm />
            </div>

            {!loaded.ok ? (
              <ErrorState
                title="질문 목록을 지금 불러오지 못했어요"
                desc="등록된 질문이 0개인 게 아니라 조회 자체가 실패했습니다. 잠시 후 새로고침해 주세요. 질문 등록은 위에서 그대로 하실 수 있어요."
                cause={loaded.cause}
              />
            ) : items.length === 0 ? (
              <EmptyState
                icon="messages-square"
                /* keyword 가 걸린 상태에서 all 이 0인 건 "질문이 없다"가 아니라
                   "이 키워드로는 최근 100건 안에 없다"이다 — 구분해서 쓴다. */
                title={
                  keyword
                    ? `‘${keyword}’ 관련 질문이 아직 없어요`
                    : all.length === 0
                      ? "아직 등록된 질문이 없어요"
                      : "이 조건에 맞는 질문이 없어요"
                }
                desc={
                  keyword
                    ? "최근 질문 100건 안에서는 찾지 못했어요. 위에서 첫 질문을 남기면 이 단지를 보는 다른 사람에게도 함께 보여요."
                    : all.length === 0
                      ? "이 단지·지역에 대해 궁금한 점을 위에서 첫 질문으로 남겨보세요."
                      : "상태나 주제 필터를 바꿔 보시거나, 위에서 새 질문을 남겨보세요."
                }
                action={
                  keyword || all.length > 0 ? { href: "/qna", label: "전체 질문 보기" } : undefined
                }
              />
            ) : (
              <div className="rise-in-3 flex flex-col gap-3">
                {rows.map((row) => (
                  <QuestionCard key={row.q.id} row={row} />
                ))}
              </div>
            )}
          </div>

          {/* ── 사이드 ─────────────────────────────── */}
          <aside className="flex flex-col gap-3.5">
            {/* 연동(1): 임장노트 · 지도 · 단지 허브로 가는 실제 경로 */}
            <section className="rise-in-2 card flex flex-col gap-2 rounded-[18px] p-[18px]">
              <h2 className="text-[14px] font-bold text-ink">질문 전에 여기부터</h2>
              <p className="text-[12px] leading-[1.6] text-text-3">
                이미 남아 있는 기록에 답이 있을 수 있어요. 단지 허브에는 실거래·지도·
                임장노트·이 단지 Q&amp;A 가 한 곳에 모여 있습니다.
              </p>
              <div className="mt-1 flex flex-col gap-2">
                {[
                  {
                    href: "/map",
                    icon: "map",
                    label: "지도에서 단지 찾기",
                    desc: "지도를 눌러 단지 허브로 이동",
                  },
                  {
                    href: "/notes",
                    icon: "clipboard",
                    label: "공개 임장노트 보기",
                    desc: "다녀온 사람이 남긴 현장 기록",
                  },
                  {
                    href: "/notes/new",
                    icon: "notebook-pen",
                    label: "임장노트 쓰기",
                    desc: "본 것을 적어두면 질문이 구체해져요",
                  },
                ].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 no-underline"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Icon name={l.icon} size={16} />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[13px] font-bold text-ink">{l.label}</span>
                      <span className="text-[11px] text-text-3">{l.desc}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* 주제별 안내 — 무엇을 물어야 할지 막막한 사람용 예시 질문 */}
            <section className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
              <h2 className="text-[14px] font-bold text-ink">이런 걸 물어보세요</h2>
              <ul className="flex flex-col gap-1.5">
                {QNA_TOPICS.slice(0, 6).map((t) => (
                  <li key={t.key} className="flex items-start gap-2">
                    <span className="mt-[1px] shrink-0 text-[13px]">{t.icon}</span>
                    <span className="text-[12px] leading-[1.55] text-text-2">{t.hint}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] leading-[1.55] text-text-3">
                단지명과 지역을 함께 적으면 그 단지를 아는 이웃에게 더 잘 닿아요.
              </p>
            </section>

            <section className="rise-in-4 card flex flex-col gap-1.5 rounded-[18px] p-[18px]">
              <h2 className="text-[14px] font-bold text-ink">답변은 이웃의 경험이에요</h2>
              <p className="text-[12px] leading-[1.6] text-text-3">
                Q&amp;A의 답변은 이용자 개개인의 의견으로 정확성이 보장되지 않습니다. 투자·매매·
                임대차 등 계약 판단과 그 결과에 대한 책임은 본인에게 있으니, 참고 자료로만
                활용해 주세요.
              </p>
            </section>

            <AdSlot
              placement="community_feed"
              seed={0}
              adFree={viewer.adFree}
              signedIn={viewer.signedIn}
              plan={viewer.plan}
            />
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
