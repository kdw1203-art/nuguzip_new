"use client";

import { useState, type FormEvent } from "react";

/* P2-2: 1:1 문의 폼 — POST /api/support 실연동.
   계약(app/api/support/route.ts): { category, subject(2~200자), message(10~3000자), email }
   → 200 { ok: true } / 400 { error }. 로그인 세션 이메일이 있으면 서버가 우선 사용. */

const CATEGORIES = ["일반 문의", "결제·환불", "버그 신고", "개인정보", "악성 콘텐츠 신고", "기타"] as const;

export function SupportContactForm() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("일반 문의");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (subject.trim().length < 2) {
      setError("제목을 2자 이상 입력해 주세요.");
      return;
    }
    if (message.trim().length < 10) {
      setError("내용을 10자 이상 입력해 주세요.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("답변 받을 이메일 주소를 정확히 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          message: message.trim(),
          email: email.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setDone(true);
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <div className="text-[26px]">✅</div>
        <div className="text-[15px] font-extrabold text-ink">문의가 접수되었습니다</div>
        <div className="text-xs leading-[1.6] text-text-2">
          영업일 기준 24~72시간 이내에 입력하신 이메일로 답변 드립니다.
        </div>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setSubject("");
            setMessage("");
          }}
          className="mt-1 rounded-full bg-[#f2f4f8] px-4 py-[7px] text-xs font-bold text-text-1"
        >
          새 문의 작성
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2.5" noValidate>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1.5 text-xs ${
              category === c
                ? "border-[1.5px] border-primary bg-primary-soft font-bold text-primary"
                : "border border-[#e2e7ee] bg-surface text-text-2"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="제목 (2~200자)"
        maxLength={200}
        aria-label="문의 제목"
        className="rounded-[12px] border border-line bg-surface px-3.5 py-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="문의 내용을 자세히 적어 주세요 (10~3000자)"
        maxLength={3000}
        rows={5}
        aria-label="문의 내용"
        className="resize-y rounded-[12px] border border-line bg-surface px-3.5 py-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-text-3 focus:border-primary"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="답변 받을 이메일"
        aria-label="답변 받을 이메일"
        className="rounded-[12px] border border-line bg-surface px-3.5 py-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
      />
      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full rounded-[12px] p-3 text-center text-[13px] disabled:opacity-60 md:w-auto md:px-6"
        >
          {busy ? "접수 중…" : "문의 접수하기"}
        </button>
        <a href="mailto:nuguzip@naver.com" className="text-xs font-semibold text-text-3 underline underline-offset-2">
          또는 메일로 문의: nuguzip@naver.com
        </a>
      </div>
    </form>
  );
}
