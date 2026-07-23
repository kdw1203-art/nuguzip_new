"use client";

import { useState } from "react";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";
import {
  SCOPE_LABELS,
  type SavedSearch,
  type SavedSearchScope,
} from "@/lib/saved-search/types";

const SCOPES: SavedSearchScope[] = ["map", "listings", "complex", "auctions"];

function riseClass(index: number): string {
  if (index <= 0) return "rise-in";
  if (index === 1) return "rise-in-1";
  return "rise-in-2";
}

export function SavedSearchClient({ initial }: { initial: SavedSearch[] }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<SavedSearch[]>(initial);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<SavedSearchScope>("map");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** GET 으로 목록을 다시 읽어 상태를 동기화한다. */
  async function refresh(): Promise<void> {
    try {
      const res = await fetch("/api/saved-searches", { cache: "no-store" });
      if (!res.ok) throw new Error("목록을 불러오지 못했어요.");
      const data = (await res.json()) as { items?: SavedSearch[] };
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("목록을 새로고침하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) {
      setError("검색 이름을 입력해 주세요.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: trimmed,
          query: query.trim(),
          scope,
          filters: {},
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "저장에 실패했어요.");
      }
      setLabel("");
      setQuery("");
      setScope("map");
      await refresh();
      showToast("검색을 저장했어요");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했어요.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(item: SavedSearch): Promise<void> {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/saved-searches/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertEnabled: !item.alertEnabled }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "변경에 실패했어요.");
      }
      await refresh();
      showToast(item.alertEnabled ? "알림을 껐어요" : "알림을 켰어요");
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: SavedSearch): Promise<void> {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/saved-searches/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "삭제에 실패했어요.");
      }
      await refresh();
      showToast("검색을 삭제했어요");
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
      {/* 생성 폼 */}
      <form onSubmit={handleCreate} className="card rise-in flex flex-col gap-3">
        <div className="flex items-center gap-1.5 text-[14px] font-extrabold text-ink">
          <Icon name="plus" size={16} />새 검색 저장
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-text-2">검색 이름</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="예) 강남 30평대 전세"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink placeholder:text-text-3"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-text-2">탐색 범위</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as SavedSearchScope)}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink"
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-text-2">
            검색어 <span className="text-text-3">(선택)</span>
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={200}
            placeholder="예) 래미안, 역세권"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink placeholder:text-text-3"
          />
        </label>

        <button
          type="submit"
          disabled={creating}
          className="btn-primary press inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          <Icon name="check" size={16} />
          {creating ? "저장 중…" : "검색 저장"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rise-in flex items-start gap-1.5 rounded-xl border border-line bg-primary-soft px-3.5 py-2.5 text-[12px] leading-[1.6] text-primary-strong"
        >
          <Icon name="x" size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* 목록 */}
      {items.length === 0 ? (
        <div className="card rise-in flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="search" size={20} />
          </span>
          <p className="text-[14px] font-bold text-ink">아직 저장한 검색이 없어요.</p>
          <p className="text-[12px] leading-[1.6] text-text-3">
            위에서 관심 조건을 저장하면 여기에 모아 볼 수 있어요.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={`card card-hover ${riseClass(i)} flex flex-col gap-2.5`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[15px] font-extrabold text-ink">
                      {item.label}
                    </span>
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {SCOPE_LABELS[item.scope]}
                    </span>
                  </div>
                  {item.query ? (
                    <p className="flex items-center gap-1 text-[12px] text-text-2">
                      <Icon name="search" size={13} />
                      <span className="truncate">{item.query}</span>
                    </p>
                  ) : (
                    <p className="text-[12px] text-text-3">검색어 없음</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                <button
                  type="button"
                  onClick={() => handleToggle(item)}
                  disabled={busyId === item.id}
                  aria-pressed={item.alertEnabled}
                  className={`press inline-flex items-center gap-1.5 ${
                    item.alertEnabled ? "chip-active" : "chip"
                  } disabled:opacity-60`}
                >
                  <Icon name="bell" size={14} />
                  {item.alertEnabled ? "알림 켜짐" : "알림 꺼짐"}
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={busyId === item.id}
                  className="press inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-text-3 disabled:opacity-60"
                  aria-label={`${item.label} 삭제`}
                >
                  <Icon name="x" size={14} />
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
