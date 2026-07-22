"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const INPUT =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink placeholder:text-text-3";

/** 답변 작성 폼. 예시 질문이면 안내 문구만 노출. 성공 시 router.refresh + 초기화. localStorage 미사용. */
export function AnswerForm({
  questionId,
  isSample,
}: {
  questionId: string;
  isSample: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedLogin(false);

    if (body.trim().length < 5) {
      setError("답변은 5글자 이상 입력해 주세요.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/qna/${questionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });

      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "답변 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }

      setBody("");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (isSample) {
    return (
      <div className="card text-[13px] text-text-3">
        예시 질문에는 답변할 수 없어요. 실제 질문에 답변을 남겨보세요.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <h2 className="text-[15px] font-bold text-ink">답변 작성</h2>
      <textarea
        className={`${INPUT} min-h-[120px] resize-y`}
        placeholder="이웃에게 도움이 될 답변을 남겨주세요. (5자 이상)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
      />

      {needLogin && (
        <div className="rounded-xl bg-primary-soft px-3.5 py-2.5 text-[13px] text-primary">
          로그인 후 답변할 수 있어요.{" "}
          <Link href="/login" className="font-bold underline underline-offset-2">
            로그인하기
          </Link>
        </div>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}

      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="btn-primary press disabled:opacity-60">
          {busy ? "등록 중…" : "답변 등록"}
        </button>
      </div>
    </form>
  );
}
