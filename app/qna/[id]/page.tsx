import { cache } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { getQuestion } from "@/lib/qna/store";
import { resolveComplexHref } from "@/lib/newui/complex-link";
import { logger } from "@/lib/log";
import type { QnaAnswer } from "@/lib/qna/types";
import { topicsOf, QNA_TOPIC_BY_KEY } from "@/lib/qna/topics";
import { AnswerForm } from "./AnswerForm";

/* 비용 실측(2026-08-10): force-dynamic 이라 크롤 1회 = 함수 호출 1회였다.
   렌더에 auth·cookies·searchParams·쓰기 부작용 0건(check-cache-policy 감시).
   유일한 변이(답변 등록 API)가 revalidatePath 로 즉시 재생성한다. */
export const revalidate = 600;
// 동적 세그먼트는 이게 없으면 "요청마다 서버 렌더"로 분류된다
export function generateStaticParams() {
  return [];
}

/** 목록(/qna)과 같은 청록 테마 — 카테고리를 오가도 색이 바뀌지 않게. */
const QNA_THEME = {
  "--primary": "#0d9488",
  "--primary-soft": "#e3f5f2",
  "--primary-strong": "#0a7a70",
} as CSSProperties;

/* 같은 요청 내에서 getQuestion(및 조회수 증가)이 한 번만 실행되도록 캐시
   → generateMetadata 와 페이지 렌더가 결과를 공유(중복 조회·중복 view +1 방지).
 *
 * 2026-07-27: getQuestion 은 이제 "조회 실패" 를 던진다(예전에는 실패도 null 로
 * 뭉개서 살아 있는 질문이 삭제된 것처럼 보였다). 그 예외를 여기서 안 잡으면
 * DB 가 잠깐 흔들릴 때 화면이 통째로 5xx 가 된다. 그래서 {ok} 유니온으로 받아
 * "없음(null)" 과 "못 읽음(error)" 을 끝까지 따로 들고 간다 — /qna, /auctions 와
 * 같은 방식이다. */
type Loaded =
  | { ok: true; data: Awaited<ReturnType<typeof getQuestion>> }
  | { ok: false; cause: string };

const loadQuestion = cache(
  async (id: string): Promise<Loaded> =>
    getQuestion(id).then(
      (data) => ({ ok: true as const, data }),
      (err: unknown) => {
        logger.error(`[qna] 질문 상세 조회 실패 (${id})`, err);
        return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
      },
    ),
);

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const loaded = await loadQuestion(id);
  /* 못 읽은 것은 없는 것이 아니다 — 색인만 막고 제목은 실패라고 정확히 쓴다. */
  if (!loaded.ok) {
    return { title: "질문을 불러오지 못했어요 | 내집나우", robots: { index: false, follow: false } };
  }
  if (!loaded.data) {
    return { title: "질문을 찾을 수 없어요 | 내집나우", robots: { index: false, follow: false } };
  }
  const { title, body } = loaded.data.question;
  return {
    title: `${title} | 단지 Q&A | 내집나우`,
    description: (body || title).slice(0, 150),
    robots: { index: true, follow: true },
  };
}

function AnswerCard({ a }: { a: QnaAnswer }) {
  return (
    <article className={`card ${a.isAccepted ? "border border-primary" : ""}`}>
      <div className="flex items-center gap-2 t-sub text-text-3">
        <span className="inline-flex items-center gap-1">
          <Icon name="user" size={13} />
          {a.authorLabel}
        </span>
        {a.isAccepted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft chip-pad t-sub font-semibold text-primary">
            <Icon name="check" size={12} />
            채택된 답변
          </span>
        )}
        <span className="ml-auto">{shortDate(a.createdAt)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap t-body text-text-1">{a.body}</p>
    </article>
  );
}

export default async function QnaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const loaded = await loadQuestion(id);

  /* 조회 자체가 실패한 경우 — "없는 질문" 이라고 말하지 않는다. 답변을 기다리던
     질문자에게 자기 글이 지워졌다고 알리는 셈이기 때문이다. */
  if (!loaded.ok) {
    return (
      <PageShell breadcrumb="홈 › 동네이야기 › 단지 Q&A" title="단지 Q&A" wide>
        <TownCategoryNav stick />
        <div style={QNA_THEME}>
          <ErrorState
            title="질문을 지금 불러오지 못했어요"
            desc="질문이 없는 게 아니라 조회 자체가 실패했습니다. 잠시 후 새로고침해 주세요."
            cause={loaded.cause}
            action={{ href: "/qna", label: "목록으로 돌아가기" }}
          />
        </div>
      </PageShell>
    );
  }

  if (!loaded.data) {
    return (
      <PageShell breadcrumb="홈 › 동네이야기 › 단지 Q&A" title="질문을 찾을 수 없어요" wide>
        <TownCategoryNav stick />
        <div style={QNA_THEME} className="card rise-in flex flex-col items-start gap-3">
          <p className="t-body text-text-2">
            요청하신 질문을 찾을 수 없어요. 이미 삭제되었거나 잘못된 주소일 수 있어요.
          </p>
          <Link href="/qna" className="btn-primary press">
            목록으로 돌아가기
          </Link>
        </div>
      </PageShell>
    );
  }

  const { question, answers } = loaded.data;

  /* 연동(1): 이 질문이 가리키는 단지의 실제 허브 주소. 못 찾으면 링크를 걸지
     않을 뿐 질문은 그대로 보인다 — 없는 페이지로 보내는 죽은 링크보다 낫다. */
  let complexHref: string | null = null;
  if (question.complexId) {
    complexHref = `/complex/${encodeURIComponent(question.complexId)}`;
  } else if (question.complexName) {
    try {
      complexHref = await resolveComplexHref(question.complexName, question.region);
    } catch {
      complexHref = null;
    }
  }
  const topics = topicsOf(question);

  const body = (
    <>
      <div className="mb-3">
        <Link href="/qna" className="inline-flex items-center gap-1 t-body text-text-3">
          <Icon name="messages-square" size={14} />
          단지 Q&amp;A 목록
        </Link>
      </div>

      <article className="card rise-in">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {question.complexName && (
              <span className="rounded-full bg-primary-soft chip-pad t-sub font-semibold text-primary">
                {question.complexName}
              </span>
            )}
            {question.region && (
              <span className="rounded-full bg-primary-soft chip-pad t-sub font-semibold text-primary">
                {question.region}
              </span>
            )}
            {question.bountyPoints > 0 && (
              <span className="rounded-full bg-primary-soft chip-pad t-sub font-semibold text-primary">
                현상금 {question.bountyPoints.toLocaleString()}P
              </span>
            )}
          </div>
          {question.isSample && (
            <span className="shrink-0 rounded-full bg-[rgba(127,140,158,.12)] chip-pad t-sub font-semibold text-text-3">
              예시
            </span>
          )}
        </div>

        {question.body && (
          <p className="mt-3 whitespace-pre-wrap t-body text-text-1">
            {question.body}
          </p>
        )}

        {question.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {question.tags.map((t) => (
              <span key={t} className="chip t-sub">
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 t-sub text-text-3">
          <span className="inline-flex items-center gap-1">
            <Icon name="user" size={13} />
            {question.authorLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="messages-square" size={13} />
            답변 {question.answerCount}
          </span>
          <span>조회 {question.viewCount.toLocaleString()}</span>
          <span className="ml-auto">{shortDate(question.createdAt)}</span>
        </div>
      </article>

      <section className="mt-5">
        <h2 className="mb-2.5 t-body font-bold text-ink">답변 {answers.length}</h2>
        {answers.length === 0 ? (
          <div className="card t-body text-text-3">
            아직 답변이 없어요. 첫 번째 답변을 남겨보세요.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {answers.map((a) => (
              <AnswerCard key={a.id} a={a} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-5">
        <AnswerForm questionId={id} isSample={question.isSample} />
      </div>

      <p className="mt-6 t-sub text-text-3">
        ※ 답변은 이용자 개인의 의견이며 정확성이 보장되지 않습니다. 투자·계약 판단과 그 책임은
        본인에게 있습니다.
      </p>
    </>
  );

  /* 연동(2): 이 질문에서 곧장 갈 수 있는 곳. 전부 실제로 존재하는 경로만 넣고,
     단지 허브는 위에서 조회에 성공했을 때만 넣는다. */
  const linkedName = question.complexName ?? question.region ?? null;
  const related: { href: string; icon: string; label: string; desc: string }[] = [];
  if (complexHref && linkedName) {
    related.push({
      href: complexHref,
      icon: "building",
      label: `${linkedName} 단지 허브`,
      desc: "실거래·지도·임장노트가 한 곳에",
    });
  }
  related.push({
    href: "/map",
    icon: "map",
    label: "지도에서 위치 보기",
    desc: "주변 단지·시세를 지도로 확인",
  });
  related.push({
    href: "/notes",
    icon: "clipboard",
    label: "공개 임장노트",
    desc: "다녀온 사람이 남긴 현장 기록",
  });
  related.push({
    href: "/notes/new",
    icon: "notebook-pen",
    label: "임장노트 쓰기",
    desc: "직접 보고 온 것을 적어두기",
  });

  const aside = (
    <div className="flex flex-col gap-3">
      <section className="card flex flex-col gap-2 rounded-[18px] p-[18px]">
        <h2 className="t-body font-bold text-ink">이어서 확인하기</h2>
        <p className="t-sub text-text-3">
          답변을 기다리는 동안, 이미 남아 있는 자료에서 먼저 확인할 수 있어요.
        </p>
        <div className="mt-1 flex flex-col gap-2">
          {related.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 no-underline"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon name={l.icon} size={16} />
              </span>
              <span className="flex flex-col">
                <span className="t-body font-bold text-ink">{l.label}</span>
                <span className="t-sub text-text-3">{l.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {topics.length > 0 && (
        <section className="card flex flex-col gap-2 rounded-[18px] p-[18px]">
          <h2 className="t-body font-bold text-ink">비슷한 주제 더 보기</h2>
          {/* 주제는 태그·본문에서 추정한 값이라 단정하지 않고 "검색 링크" 로만 쓴다 */}
          <div className="flex flex-wrap gap-1.5">
            {topics.map((k) => {
              const t = QNA_TOPIC_BY_KEY[k];
              if (!t) return null;
              return (
                <Link
                  key={k}
                  href={`/qna?topic=${k}`}
                  className="press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline"
                >
                  {t.icon} {t.label}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <PageShell breadcrumb="홈 › 동네이야기 › 단지 Q&A" title={question.title} wide>
      <TownCategoryNav stick />
      <div style={QNA_THEME} className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>{body}</div>
        {aside}
      </div>
    </PageShell>
  );
}
