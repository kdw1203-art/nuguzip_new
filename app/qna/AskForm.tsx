"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";

const INPUT =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink placeholder:text-text-3";

/** 질문 작성 폼 — 접힘/펼침. 제출 성공 시 router.refresh + 폼 초기화. localStorage 미사용. */
export function AskForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [complexName, setComplexName] = useState("");
  const [region, setRegion] = useState("");
  const [bounty, setBounty] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  function reset() {
    setTitle("");
    setBody("");
    setComplexName("");
    setRegion("");
    setBounty("");
    setTags("");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedLogin(false);

    if (title.trim().length < 4) {
      setError("제목은 4글자 이상 입력해 주세요.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/qna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          complexName: complexName.trim() || undefined,
          region: region.trim() || undefined,
          bountyPoints: bounty.trim() ? Number(bounty) : undefined,
          tags,
        }),
      });

      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "질문 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }

      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card card-hover press flex w-full items-center gap-2.5 text-left"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Icon name="plus" size={18} />
        </span>
        <span className="flex flex-col">
          <span className="text-[14px] font-bold text-ink">궁금한 단지·동네, 질문해 보세요</span>
          <span className="text-[12px] text-text-3">재건축·학군·주차·교통 등 무엇이든 물어보세요.</span>
        </span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">질문 작성</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="press text-text-3"
          aria-label="닫기"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      <input
        className={INPUT}
        placeholder="질문 제목 (예: 은마아파트 재건축 진행 상황이 궁금해요)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
      />
      <textarea
        className={`${INPUT} min-h-[120px] resize-y`}
        placeholder="궁금한 내용을 자세히 적어주세요. (선택)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          className={INPUT}
          placeholder="단지명 (선택)"
          value={complexName}
          onChange={(e) => setComplexName(e.target.value)}
          maxLength={80}
        />
        <input
          className={INPUT}
          placeholder="지역 (선택, 예: 서울 강남구)"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          maxLength={80}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className={INPUT}
          placeholder="현상금 포인트 (선택)"
          value={bounty}
          onChange={(e) => setBounty(e.target.value)}
        />
        <input
          className={INPUT}
          placeholder="태그 (쉼표로 구분, 예: 재건축,학군)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          maxLength={120}
        />
      </div>

      {needLogin && (
        <div className="rounded-xl bg-primary-soft px-3.5 py-2.5 text-[13px] text-primary">
          로그인 후 질문할 수 있어요.{" "}
          <Link href="/login" className="font-bold underline underline-offset-2">
            로그인하기
          </Link>
        </div>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="press text-[13px] text-text-3"
        >
          취소
        </button>
        <button type="submit" disabled={busy} className="btn-primary press disabled:opacity-60">
          {busy ? "등록 중…" : "질문 등록"}
        </button>
      </div>

      <p className="text-[11px] text-text-3">
        현상금 포인트는 현재 버전에서 표시용이며, 실제 포인트가 차감·지급되지 않아요.
      </p>
    </form>
  );
}
