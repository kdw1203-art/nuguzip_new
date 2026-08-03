"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";

const INPUT =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink placeholder:text-text-3";

/** 질문 작성 폼 — 접힘/펼침. 제출 성공 시 router.refresh + 폼 초기화. localStorage 미사용. */
export function AskForm() {
  const router = useRouter();
  const { promptSignup } = useSoftSignup();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [complexName, setComplexName] = useState("");
  const [region, setRegion] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLFormElement>(null);

  /* 항목 18 — 단지 상세 "질문 남기기"에서 넘어온 프리필.
     ?ask=1&complex=…&region=… 이면 폼을 펼치고 단지·지역을 채운 뒤 폼으로
     스크롤한다. useSearchParams 대신 mount 1회 window 파싱 — 이 폼은 접힘
     상태가 로컬 상태라 URL 과 동기화할 필요가 없고, Suspense 경계도 아낀다. */
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("ask") !== "1") return;
      const cx = sp.get("complex")?.trim();
      const rg = sp.get("region")?.trim();
      if (cx) setComplexName((prev) => prev || cx);
      if (rg) setRegion((prev) => prev || rg);
      setOpen(true);
      // 펼침이 커밋된 다음 프레임에 스크롤 (이중 rAF — 커밋 전 실행 방지)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }),
      );
    } catch {
      // URL 파싱 실패 — 프리필 없이 기본 동작
    }
  }, []);

  function reset() {
    setTitle("");
    setBody("");
    setComplexName("");
    setRegion("");
    setTags("");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

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
          tags,
        }),
      });

      if (res.status === 401) {
        promptSignup({
          action: "qna_ask",
          title: "질문을 올리려면 로그인이 필요해요",
          benefit: "로그인하면 질문이 계정에 남아 답변 알림을 받을 수 있어요.",
        });
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
    <form ref={rootRef} onSubmit={submit} className="card flex flex-col gap-3">
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

      <input
        className={INPUT}
        placeholder="태그 (쉼표로 구분, 예: 재건축,학군)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        maxLength={120}
      />

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

    </form>
  );
}
