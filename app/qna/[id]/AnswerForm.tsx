"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CharCount } from "@/app/components/ui/CharCount";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";

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
  const { promptSignup } = useSoftSignup();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

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
        promptSignup({
          action: "qna_answer",
          title: "답변하려면 로그인이 필요해요",
          benefit: "로그인하면 답변이 계정에 남아 신뢰·신고 대응이 가능해요.",
        });
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
      <div className="card t-body text-text-3">
        예시 질문에는 답변할 수 없어요. 실제 질문에 답변을 남겨보세요.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <h2 className="t-body font-bold text-ink">답변 작성</h2>
      <textarea
        className={`${INPUT} min-h-[120px] resize-y`}
        placeholder="이웃에게 도움이 될 답변을 남겨주세요. (5자 이상)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
      />
      {/* [966] 글자 수 — maxLength 와 같은 상한 */}
      <div className="-mt-1.5 flex justify-end">
        <CharCount value={body} max={4000} />
      </div>

      {error && <p className="t-sub text-danger">{error}</p>}

      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="btn-primary press disabled:opacity-60">
          {busy ? "등록 중…" : "답변 등록"}
        </button>
      </div>
    </form>
  );
}
