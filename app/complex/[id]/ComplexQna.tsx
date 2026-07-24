import Link from "next/link";
import { listQuestionsForComplex } from "@/lib/qna/store";

/* D2 — 단지 Q&A 임베드. 이 단지(complex_name 일치)의 실 질문만.
   질문이 없으면 첫 질문 유도 CTA(참여 유도) — 조작 데이터 아님. */

/** ISO → "N일 전 / YYYY.MM.DD" */
function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export async function ComplexQna({ complexName }: { complexName: string }) {
  const name = complexName.trim();
  if (!name) return null;

  const questions = await listQuestionsForComplex(name, 5).catch(() => []);

  return (
    <section className="rise-in-5 mt-6">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="text-[15px] font-extrabold text-ink">이 단지 Q&amp;A</h2>
        <Link href="/qna" className="text-[12px] font-bold text-primary">
          전체 보기 →
        </Link>
      </div>

      {questions.length === 0 ? (
        <Link
          href="/qna"
          className="card card-hover flex flex-col items-center gap-1.5 rounded-2xl px-4 py-8 text-center no-underline"
        >
          <div className="text-[14px] font-extrabold text-ink">
            이 단지에 대해 궁금한 점이 있나요?
          </div>
          <p className="text-[12px] leading-[1.6] text-text-3">
            채광·주차·소음·학군 등 실제 거주·방문 경험이 있는 이웃에게 물어보세요.
          </p>
          <span className="btn-primary btn-sm mt-1">질문 남기기</span>
        </Link>
      ) : (
        <div className="flex flex-col gap-2">
          {questions.map((q) => (
            <Link
              key={q.id}
              href={`/qna/${q.id}`}
              className="card card-hover flex flex-col gap-1.5 rounded-2xl px-4 py-3.5 no-underline"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-[6px] px-2 py-[3px] text-[11px] font-extrabold ${
                    q.status === "answered"
                      ? "bg-[rgba(26,127,78,.1)] text-[#1a7f4e]"
                      : "bg-primary-soft text-primary"
                  }`}
                >
                  {q.status === "answered" ? "답변완료" : "답변대기"}
                </span>
                {q.bountyPoints > 0 && (
                  <span className="rounded-[6px] bg-[rgba(245,158,11,.14)] px-2 py-[3px] text-[11px] font-extrabold text-[#b45309]">
                    {q.bountyPoints}P
                  </span>
                )}
                <span className="ml-auto text-[11px] text-text-3">답변 {q.answerCount}</span>
              </div>
              <div className="text-[14px] font-extrabold leading-[1.4] text-ink">{q.title}</div>
              <div className="text-[11px] text-text-3">
                {q.authorLabel} · {timeAgo(q.createdAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
