import Link from "next/link";
import { loadComplexQuestions } from "./section-loaders";
import { logger } from "@/lib/log";

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

export async function ComplexQna({
  complexName,
  region,
  noteCount,
}: {
  complexName: string;
  /** 질문 폼 프리필용 지역 문자열 (예: "서울 송파구") */
  region?: string;
  /**
   * 이 단지의 임장노트 수 — 첫 질문 유도에 실데이터 근거로 쓴다(항목 18).
   * 조회 실패 시 null 을 넘겨라: "0개"라고 지어내지 않기 위한 구분값이다.
   */
  noteCount?: number | null;
}) {
  const name = complexName.trim();
  if (!name) return null;

  /* 2026-07-26: `.catch(() => [])` 였다. 조회가 실패하면 아래 빈 상태 CTA
     ("첫 질문을 남겨 보세요")가 뜨는데, 이미 남아 있는 질문을 없는 것처럼
     보이게 만든다. 실패는 실패라고 쓴다 — 질문 남기기 링크는 그대로 둔다. */
  const loaded = await loadComplexQuestions(name).then(
    (items) => ({ ok: true as const, items }),
    (err: unknown) => {
      logger.error("[complex] 단지 Q&A 조회 실패", err);
      return { ok: false as const };
    },
  );
  const questions = loaded.ok ? loaded.items : [];

  /* 연동(#224): "전체 보기" 를 /qna 전체가 아니라 이 단지로 좁힌 목록으로 보낸다.
     /qna 는 결과가 0이어도 "질문이 없다"가 아니라 "최근 100건 안에서 못 찾았다"
     고 쓰므로, 여기서 좁혀 보내도 없는 것을 단정하지 않는다. */
  const listHref = `/qna?q=${encodeURIComponent(name)}`;

  if (!loaded.ok) {
    return (
      <section className="rise-in-5 mt-6">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h2 className="t-section text-ink">이 단지 Q&amp;A</h2>
          <Link href={listHref} className="t-sub font-bold text-primary">
            전체 보기 →
          </Link>
        </div>
        <div className="card flex flex-col items-center gap-1.5 rounded-2xl px-4 py-8 text-center">
          <div className="t-section text-ink">
            질문을 지금 불러오지 못했어요
          </div>
          <p className="t-sub text-text-3">
            질문이 없는 게 아니라 조회 자체가 실패했습니다. 잠시 후 새로고침해 주세요.
          </p>
          <Link href={listHref} className="btn-primary btn-sm mt-1 no-underline">
            Q&amp;A 전체 보기
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rise-in-5 mt-6">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="t-section text-ink">이 단지 Q&amp;A</h2>
        <Link href={listHref} className="t-sub font-bold text-primary">
          전체 보기 →
        </Link>
      </div>

      {questions.length === 0 ? (
        /* 항목 18 — 첫 질문 유도. 목록 필터가 아니라 작성 폼(프리필)으로 바로
           보낸다. 근거 문장은 실측 노트 수가 있을 때만(0·미확인은 지어내지 않음). */
        <Link
          href={`/qna?ask=1&complex=${encodeURIComponent(name)}${
            region?.trim() ? `&region=${encodeURIComponent(region.trim())}` : ""
          }`}
          className="card tile flex flex-col items-center gap-1.5 rounded-2xl px-4 py-8 text-center no-underline"
        >
          <div className="t-section text-ink">
            이 단지에 대해 궁금한 점이 있나요?
          </div>
          <p className="t-sub text-text-3">
            {typeof noteCount === "number" && noteCount > 0
              ? `이 단지를 직접 다녀온 임장노트가 ${noteCount.toLocaleString("ko-KR")}개 기록돼 있어요 — 채광·주차·소음 같은 궁금증을 경험자에게 물어보세요.`
              : "채광·주차·소음·학군 등 실제 거주·방문 경험이 있는 이웃에게 물어보세요."}
          </p>
          <span className="btn-primary btn-sm mt-1">{name} 질문 남기기</span>
        </Link>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 웹20 — 답변 유도. 답변대기 배지는 이미 있지만 "당신이 답할 수
              있다"는 문장이 없었다. 대기 질문이 실재할 때만, 실측 수로 말한다. */}
          {(() => {
            const waiting = questions.filter((q) => q.status !== "answered");
            if (waiting.length === 0) return null;
            return (
              <Link
                href={`/qna/${waiting[0].id}`}
                className="rounded-[10px] border border-[rgba(29,79,216,.18)] bg-[rgba(29,79,216,.05)] px-4 py-2.5 t-sub font-bold text-primary no-underline"
              >
                답변을 기다리는 질문 {waiting.length}개 — 이 단지를 다녀오셨다면
                경험을 나눠 주세요 ›
              </Link>
            );
          })()}
          {questions.map((q) => (
            <Link
              key={q.id}
              href={`/qna/${q.id}`}
              className="card tile flex flex-col gap-1.5 rounded-2xl px-4 py-3.5 no-underline"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-md chip-pad text-[11px] font-extrabold ${
                    q.status === "answered"
                      ? "bg-success-soft text-success"
                      : "bg-primary-soft text-primary"
                  }`}
                >
                  {q.status === "answered" ? "답변완료" : "답변대기"}
                </span>
                {q.bountyPoints > 0 && (
                  <span className="rounded-md bg-[rgba(245,158,11,.14)] chip-pad t-sub font-extrabold text-warning">
                    {q.bountyPoints}P
                  </span>
                )}
                <span className="ml-auto t-sub text-text-3">답변 {q.answerCount}</span>
              </div>
              <div className="t-section text-ink">{q.title}</div>
              <div className="t-sub text-text-3">
                {q.authorLabel} · {timeAgo(q.createdAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
