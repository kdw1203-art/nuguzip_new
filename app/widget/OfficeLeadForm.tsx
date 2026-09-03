"use client";

import { useState } from "react";

/* [#144] 중개사 사무소 B2B 리드 폼 — 첫 B2B 퍼널.
   전용 백엔드를 만들지 않고 기존 /api/support(관리자 인박스 + 메일 알림)를
   재사용한다 — 리드 볼륨이 실측되기 전에는 파이프를 늘리지 않는다.
   제목 접두사 [중개사 위젯] 으로 관리자 인박스에서 구분된다. */

const TOPICS = ["사무소 홈페이지에 위젯 넣기", "블로그·카페 활용 방법", "여러 단지 위젯 일괄 발급", "기타 문의"] as const;

export function OfficeLeadForm() {
  const [office, setOffice] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>(TOPICS[0]);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async () => {
    if (state === "sending") return;
    if (office.trim().length < 2) {
      setErrorMsg("사무소명을 입력해 주세요.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg("답변 받으실 이메일을 확인해 주세요.");
      return;
    }
    setErrorMsg("");
    setState("sending");
    try {
      const message = [
        `사무소명: ${office.trim()}`,
        phone.trim() ? `연락처: ${phone.trim()}` : null,
        `문의 유형: ${topic}`,
        "",
        note.trim() || "(추가 내용 없음)",
      ]
        .filter((v): v is string => v !== null)
        .join("\n");
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "일반 문의",
          subject: `[중개사 위젯] ${office.trim()}`,
          message,
          email: email.trim(),
        }),
      });
      if (!res.ok) {
        const j: { error?: string } = await res.json().catch(() => ({}));
        setErrorMsg(j.error ?? "접수에 실패했어요 — 잠시 후 다시 시도해 주세요.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setErrorMsg("접수에 실패했어요 — 잠시 후 다시 시도해 주세요.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="rounded-[14px] border border-line bg-success-soft px-5 py-6 text-center">
        <p className="text-[14px] font-extrabold text-success">문의가 접수됐어요</p>
        <p className="mt-1 text-[12.5px] leading-[1.7] text-text-2">
          {email.trim()} 로 영업일 기준 24~72시간 안에 답변드립니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-text-2">사무소명 *</span>
          <input
            value={office}
            onChange={(e) => setOffice(e.target.value)}
            maxLength={60}
            placeholder="예: ○○공인중개사사무소"
            className="rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-text-2">이메일 *</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            maxLength={120}
            placeholder="답변 받으실 주소"
            className="rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-text-2">연락처 (선택)</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
            placeholder="예: 010-0000-0000"
            className="rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-text-2">문의 유형</span>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value as (typeof TOPICS)[number])}
            className="rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-primary"
          >
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-bold text-text-2">궁금한 점 (선택)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="어떤 단지·지역 위젯이 필요한지, 어디에 쓰실 계획인지 적어 주시면 더 정확히 답변드려요."
          className="resize-y rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[13px] leading-[1.6] text-ink outline-none focus:border-primary"
        />
      </label>
      {errorMsg && <p className="text-[12px] font-bold text-danger">{errorMsg}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={state === "sending"}
        className="rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-extrabold text-white disabled:opacity-60"
      >
        {state === "sending" ? "접수 중…" : "문의 보내기"}
      </button>
      <p className="text-[11px] leading-[1.6] text-text-3">
        입력하신 정보는 문의 답변에만 사용됩니다. 위젯 자체는 지금도 무료·무신청으로
        위 생성기에서 바로 발급됩니다.
      </p>
    </div>
  );
}
