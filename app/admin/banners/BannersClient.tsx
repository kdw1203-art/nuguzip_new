"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Banner, BannerLifecycle, BannerPlacement } from "@/lib/admin/banners";

/**
 * H4 배너 CMS 편집 UI.
 *
 * 삭제는 window.confirm 을 쓰지 않는다 — 브라우저 모달은 자동화·스크린리더 흐름을
 * 통째로 막는다. 대신 같은 자리에서 "삭제" → "정말 삭제" 2단계로 받는다.
 *
 * "링크 확인" 은 실제로 같은 오리진에 요청을 보내 상태코드를 보여준다.
 * 서버는 링크 형식만 검사할 수 있어서(런타임에 라우트 목록이 없다),
 * 404 짜리 배너가 실제로 나갔던 사고를 막으려면 여기서 눌러 확인하는 수밖에 없다.
 */

type Row = Banner & { lifecycle: BannerLifecycle };

const PLACEMENTS: { value: BannerPlacement; label: string }[] = [
  { value: "home", label: "홈" },
  { value: "community", label: "동네이야기" },
  { value: "market", label: "마켓" },
  { value: "inspection", label: "임장" },
  { value: "global", label: "전체 공용" },
];

const LIFECYCLE_LABEL: Record<BannerLifecycle, { text: string; cls: string }> = {
  live: { text: "노출 중", cls: "bg-[#173a2a] text-[#5fd39a]" },
  scheduled: { text: "예정", cls: "bg-[#1b2b47] text-ai-accent" },
  expired: { text: "기간 종료", cls: "bg-[#3a2a17] text-[#e0a458]" },
  paused: { text: "중지", cls: "bg-[#2a2f3a] text-[#9aa6b8]" },
};

const input =
  "w-full rounded-lg border border-[#2b3750] bg-[#0f1522] px-3 py-2 text-[12.5px] text-[#e8edf6] outline-none focus:border-[#4f7dff]";
const label = "text-[11px] font-bold text-[#8d99ab]";

/** datetime-local 값 ↔ ISO 변환. 빈 문자열은 null(무기한). */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Draft = {
  id?: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaUrl: string;
  placement: BannerPlacement;
  priority: number;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
  bgFrom: string;
  bgTo: string;
  textColor: string;
  targetPlan: string;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  subtitle: "",
  ctaLabel: "",
  ctaUrl: "",
  placement: "home",
  priority: 0,
  isActive: true,
  startsAt: "",
  endsAt: "",
  bgFrom: "#3182f6",
  bgTo: "#1d4ed8",
  textColor: "white",
  targetPlan: "",
};

function draftFrom(b: Row): Draft {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle ?? "",
    ctaLabel: b.ctaLabel ?? "",
    ctaUrl: b.ctaUrl ?? "",
    placement: b.placement,
    priority: b.priority,
    isActive: b.isActive,
    startsAt: toLocalInput(b.startsAt),
    endsAt: toLocalInput(b.endsAt),
    bgFrom: b.bgFrom,
    bgTo: b.bgTo,
    textColor: b.textColor,
    targetPlan: b.targetPlan ?? "",
  };
}

export function BannersClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<Record<string, string>>({});

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    if (draft.startsAt && draft.endsAt && draft.startsAt >= draft.endsAt) {
      setError("종료 시각이 시작 시각보다 빠릅니다.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      ...(draft.id ? { id: draft.id } : {}),
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || null,
      ctaLabel: draft.ctaLabel.trim() || null,
      ctaUrl: draft.ctaUrl.trim() || null,
      placement: draft.placement,
      priority: Number(draft.priority) || 0,
      isActive: draft.isActive,
      startsAt: fromLocalInput(draft.startsAt),
      endsAt: fromLocalInput(draft.endsAt),
      bgFrom: draft.bgFrom,
      bgTo: draft.bgTo,
      textColor: draft.textColor,
      targetPlan: draft.targetPlan.trim() || null,
    };
    try {
      const res = await fetch("/api/admin/banners", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        setBusy(false);
        return;
      }
      setDraft(null);
      router.refresh();
    } catch {
      setError("저장에 실패했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (b: Row) => {
    setBusy(true);
    try {
      await fetch("/api/admin/banners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, isActive: !b.isActive }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/banners?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setConfirmId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  /** 내부 경로는 같은 오리진으로 실제 요청해 도달 여부를 확인한다. */
  const checkLink = async (b: Row) => {
    const url = (b.ctaUrl ?? "").trim();
    if (!url) return;
    if (!url.startsWith("/")) {
      setLinkState((m) => ({ ...m, [b.id]: "외부 링크 — 새 탭에서 직접 확인" }));
      return;
    }
    setLinkState((m) => ({ ...m, [b.id]: "확인 중…" }));
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "manual" });
      const ok = res.status < 400 || res.status === 0;
      setLinkState((m) => ({
        ...m,
        [b.id]: ok ? `도달 확인 (${res.status || "OK"})` : `연결 안 됨 (${res.status})`,
      }));
    } catch {
      setLinkState((m) => ({ ...m, [b.id]: "확인 실패" }));
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-extrabold text-[#e8edf6]">등록된 배너</h2>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setDraft(EMPTY_DRAFT);
          }}
          className="rounded-lg bg-[#2f5bd7] px-3.5 py-2 text-[12px] font-bold text-white"
        >
          새 배너
        </button>
      </div>

      {draft && (
        <div className="flex flex-col gap-3 rounded-[18px] border border-[#2b3750] bg-[#141b2b] p-4">
          <div className="text-[13px] font-extrabold text-[#e8edf6]">
            {draft.id ? "배너 수정" : "새 배너"}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className={label}>제목</span>
              <input
                className={input}
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="사용자에게 보이는 한 줄"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className={label}>부제</span>
              <input
                className={input}
                value={draft.subtitle}
                onChange={(e) => set("subtitle", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>CTA 문구</span>
              <input
                className={input}
                value={draft.ctaLabel}
                onChange={(e) => set("ctaLabel", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>CTA 링크 (/내부경로 또는 https://)</span>
              <input
                className={input}
                value={draft.ctaUrl}
                onChange={(e) => set("ctaUrl", e.target.value)}
                placeholder="/subscription"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>노출 위치</span>
              <select
                className={input}
                value={draft.placement}
                onChange={(e) => set("placement", e.target.value as BannerPlacement)}
              >
                {PLACEMENTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>우선순위 (클수록 먼저)</span>
              <input
                type="number"
                className={input}
                value={draft.priority}
                onChange={(e) => set("priority", Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>노출 시작 (비우면 즉시)</span>
              <input
                type="datetime-local"
                className={input}
                value={draft.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>노출 종료 (비우면 무기한)</span>
              <input
                type="datetime-local"
                className={input}
                value={draft.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>배경 시작색</span>
              <input
                className={input}
                value={draft.bgFrom}
                onChange={(e) => set("bgFrom", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>배경 끝색</span>
              <input
                className={input}
                value={draft.bgTo}
                onChange={(e) => set("bgTo", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>글자색</span>
              <input
                className={input}
                value={draft.textColor}
                onChange={(e) => set("textColor", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>타겟 플랜 (비우면 전체)</span>
              <input
                className={input}
                value={draft.targetPlan}
                onChange={(e) => set("targetPlan", e.target.value)}
                placeholder="free / plus / expert"
              />
            </div>
          </div>

          {/* 미리보기 — 실제 슬롯과 같은 배경/글자색으로 그린다 */}
          <div
            className="flex flex-col gap-1 rounded-2xl px-5 py-4"
            style={{
              background: `linear-gradient(135deg, ${draft.bgFrom}, ${draft.bgTo})`,
              color: draft.textColor || "white",
            }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">광고</span>
            <span className="text-[15px] font-extrabold leading-snug">
              {draft.title || "제목이 여기 보입니다"}
            </span>
            {draft.subtitle ? (
              <span className="text-[12px] leading-relaxed opacity-90">{draft.subtitle}</span>
            ) : null}
            {draft.ctaLabel ? (
              <span className="mt-1.5 text-[12px] font-bold underline underline-offset-2">
                {draft.ctaLabel}
              </span>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-[12px] font-semibold text-[#c9d2e0]">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            활성화 (노출기간 안이면 바로 나갑니다)
          </label>

          {error && <p className="text-[12px] font-semibold text-[#ff8b8b]">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-[#2f5bd7] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
            >
              {busy ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className="rounded-lg border border-[#2b3750] px-4 py-2 text-[12px] font-bold text-[#c9d2e0]"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {initial.length === 0 ? (
        <p className="rounded-[18px] border border-[#243049] bg-[#141b2b] px-5 py-6 text-[12.5px] text-[#8d99ab]">
          등록된 배너가 없습니다. 광고 슬롯에는 아래 하우스 광고가 나갑니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {initial.map((b) => {
            const badge = LIFECYCLE_LABEL[b.lifecycle];
            return (
              <li
                key={b.id}
                className="flex flex-col gap-2 rounded-[18px] border border-[#243049] bg-[#141b2b] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10.5px] font-bold ${badge.cls}`}>
                    {badge.text}
                  </span>
                  <span className="text-[13px] font-extrabold text-[#e8edf6]">{b.title}</span>
                  <span className="text-[11px] text-[#8d99ab]">
                    {PLACEMENTS.find((p) => p.value === b.placement)?.label ?? b.placement} · 우선순위{" "}
                    {b.priority}
                  </span>
                </div>
                {b.subtitle && <p className="text-[11.5px] text-[#9aa6b8]">{b.subtitle}</p>}
                <p className="text-[11px] text-[#8d99ab]">
                  {b.startsAt ? new Date(b.startsAt).toLocaleString("ko-KR") : "즉시"} ~{" "}
                  {b.endsAt ? new Date(b.endsAt).toLocaleString("ko-KR") : "무기한"}
                  {b.targetPlan ? ` · 타겟 ${b.targetPlan}` : ""}
                </p>
                {b.ctaUrl && (
                  <p className="flex flex-wrap items-center gap-2 text-[11px] text-ai-accent">
                    <span>{b.ctaUrl}</span>
                    <button
                      type="button"
                      onClick={() => checkLink(b)}
                      className="rounded border border-[#2b3750] px-2 py-0.5 text-[10.5px] font-bold text-[#c9d2e0]"
                    >
                      링크 확인
                    </button>
                    {linkState[b.id] && (
                      <span className="text-[10.5px] text-[#9aa6b8]">{linkState[b.id]}</span>
                    )}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setError(null);
                      setDraft(draftFrom(b));
                    }}
                    className="rounded-lg border border-[#2b3750] px-3 py-1.5 text-[11.5px] font-bold text-[#c9d2e0]"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleActive(b)}
                    className="rounded-lg border border-[#2b3750] px-3 py-1.5 text-[11.5px] font-bold text-[#c9d2e0]"
                  >
                    {b.isActive ? "중지" : "노출"}
                  </button>
                  {confirmId === b.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(b.id)}
                        className="rounded-lg bg-[#8b2b2b] px-3 py-1.5 text-[11.5px] font-bold text-white"
                      >
                        정말 삭제
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="rounded-lg border border-[#2b3750] px-3 py-1.5 text-[11.5px] font-bold text-[#c9d2e0]"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmId(b.id)}
                      className="rounded-lg border border-[#4a2b2b] px-3 py-1.5 text-[11.5px] font-bold text-[#e08a8a]"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
