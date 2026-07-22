import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { listQuestions } from "@/lib/qna/store";
import type { QnaQuestion } from "@/lib/qna/types";
import { AskForm } from "./AskForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "단지 Q&A | 누구집",
  description:
    "아파트 단지·동네에 대한 궁금증을 묻고 이웃·실거주자에게 답을 받아보세요. 재건축·학군·주차·교통까지 단지 Q&A에서 확인하세요.",
  robots: { index: true, follow: true },
};

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

function QuestionCard({ q }: { q: QnaQuestion }) {
  return (
    <Link href={`/qna/${q.id}`} className="card card-hover press block">
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">{q.title}</h3>
        {q.isSample && (
          <span className="shrink-0 rounded-full bg-[rgba(127,140,158,.12)] px-2 py-0.5 text-[11px] font-semibold text-text-3">
            예시
          </span>
        )}
      </div>

      {q.body && (
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-2">{q.body}</p>
      )}

      {(q.complexName || q.region || q.bountyPoints > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {q.complexName && (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
              {q.complexName}
            </span>
          )}
          {q.region && (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
              {q.region}
            </span>
          )}
          {q.bountyPoints > 0 && (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
              현상금 {q.bountyPoints.toLocaleString()}P
            </span>
          )}
        </div>
      )}

      {q.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {q.tags.map((t) => (
            <span key={t} className="chip text-[11px]">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[12px] text-text-3">
        <span className="inline-flex items-center gap-1">
          <Icon name="user" size={13} />
          {q.authorLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="messages-square" size={13} />
          답변 {q.answerCount}
        </span>
        <span className="ml-auto">{shortDate(q.createdAt)}</span>
      </div>
    </Link>
  );
}

export default async function QnaListPage() {
  const items = await listQuestions();

  const body = (
    <>
      <section className="rise-in glass rounded-2xl p-4 md:p-5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon name="messages-square" size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold text-ink">이웃에게 물어보는 단지 Q&amp;A</h2>
            <p className="text-[12px] text-text-3">
              궁금한 단지·동네를 질문하고 실거주자·이웃에게 답을 받아보세요.
            </p>
          </div>
        </div>
      </section>

      <div className="rise-in-1 mt-4">
        <AskForm />
      </div>

      <section className="rise-in-2 mt-5">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-ink">최근 질문</h2>
          <span className="text-[12px] text-text-3">{items.length}개</span>
        </div>
        <div className="flex flex-col gap-3">
          {items.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      </section>

      <p className="mt-6 text-[11px] leading-relaxed text-text-3">
        ※ Q&amp;A의 답변은 이용자 개개인의 의견으로 정확성이 보장되지 않습니다. 투자·매매·임대차 등
        계약 판단과 그 결과에 대한 책임은 본인에게 있으니, 참고 자료로만 활용해 주세요.
      </p>
    </>
  );

  return (
    <PageShell breadcrumb="홈 › 동네이야기 › 단지 Q&A" title="단지 Q&A">
      {body}
    </PageShell>
  );
}
