import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { getQuestion } from "@/lib/qna/store";
import type { QnaAnswer } from "@/lib/qna/types";
import { AnswerForm } from "./AnswerForm";

export const dynamic = "force-dynamic";

/* 같은 요청 내에서 getQuestion(및 조회수 증가)이 한 번만 실행되도록 캐시
   → generateMetadata 와 페이지 렌더가 결과를 공유(중복 조회·중복 view +1 방지). */
const loadQuestion = cache((id: string) => getQuestion(id));

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
  const data = await loadQuestion(id);
  if (!data) {
    return { title: "질문을 찾을 수 없어요 | 누구집", robots: { index: false, follow: false } };
  }
  const { title, body } = data.question;
  return {
    title: `${title} | 단지 Q&A | 누구집`,
    description: (body || title).slice(0, 150),
    robots: { index: true, follow: true },
  };
}

function AnswerCard({ a }: { a: QnaAnswer }) {
  return (
    <article className={`card ${a.isAccepted ? "border border-primary" : ""}`}>
      <div className="flex items-center gap-2 text-[12px] text-text-3">
        <span className="inline-flex items-center gap-1">
          <Icon name="user" size={13} />
          {a.authorLabel}
        </span>
        {a.isAccepted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Icon name="check" size={12} />
            채택된 답변
          </span>
        )}
        <span className="ml-auto">{shortDate(a.createdAt)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-text-1">{a.body}</p>
    </article>
  );
}

export default async function QnaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadQuestion(id);

  if (!data) {
    return (
      <PageShell breadcrumb="홈 › 동네이야기 › 단지 Q&A" title="질문을 찾을 수 없어요">
        <div className="card rise-in flex flex-col items-start gap-3">
          <p className="text-[14px] text-text-2">
            요청하신 질문을 찾을 수 없어요. 이미 삭제되었거나 잘못된 주소일 수 있어요.
          </p>
          <Link href="/qna" className="btn-primary press">
            목록으로 돌아가기
          </Link>
        </div>
      </PageShell>
    );
  }

  const { question, answers } = data;

  const body = (
    <>
      <div className="mb-3">
        <Link href="/qna" className="inline-flex items-center gap-1 text-[13px] text-text-3">
          <Icon name="messages-square" size={14} />
          단지 Q&amp;A 목록
        </Link>
      </div>

      <article className="card rise-in">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {question.complexName && (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                {question.complexName}
              </span>
            )}
            {question.region && (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                {question.region}
              </span>
            )}
            {question.bountyPoints > 0 && (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                현상금 {question.bountyPoints.toLocaleString()}P
              </span>
            )}
          </div>
          {question.isSample && (
            <span className="shrink-0 rounded-full bg-[rgba(127,140,158,.12)] px-2 py-0.5 text-[11px] font-semibold text-text-3">
              예시
            </span>
          )}
        </div>

        {question.body && (
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-text-1">
            {question.body}
          </p>
        )}

        {question.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {question.tags.map((t) => (
              <span key={t} className="chip text-[11px]">
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[12px] text-text-3">
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
        <h2 className="mb-2.5 text-[15px] font-bold text-ink">답변 {answers.length}</h2>
        {answers.length === 0 ? (
          <div className="card text-[13px] text-text-3">
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

      <p className="mt-6 text-[11px] leading-relaxed text-text-3">
        ※ 답변은 이용자 개인의 의견이며 정확성이 보장되지 않습니다. 투자·계약 판단과 그 책임은
        본인에게 있습니다.
      </p>
    </>
  );

  return (
    <PageShell breadcrumb="홈 › 동네이야기 › 단지 Q&A" title={question.title}>
      {body}
    </PageShell>
  );
}
