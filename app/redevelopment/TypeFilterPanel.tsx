"use client";

import { Icon } from "@/app/components/Icon";
import {
  PROJECT_GROUPS,
  typesInGroup,
  type ProjectTypeKey,
} from "@/lib/redevelopment/types";

/**
 * 사업종류 필터 패널 — jaegebal 벤치마크의 그룹형 컬러 필터.
 * 전체 체크 + 그룹(민간주도/공공주도/소규모/기타)별 컬러 알약 다중선택.
 * 선택 없음(전체) = 모든 사업종류 표시.
 */
export function TypeFilterPanel({
  selected,
  onToggle,
  onSelectAll,
}: {
  selected: Set<ProjectTypeKey>;
  onToggle: (key: ProjectTypeKey) => void;
  onSelectAll: () => void;
}) {
  const allActive = selected.size === 0;

  return (
    <div className="card rounded-2xl p-4">
      {/* 전체 */}
      <button
        type="button"
        onClick={onSelectAll}
        aria-pressed={allActive}
        className="press flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left"
      >
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-[5px] border ${
            allActive
              ? "border-primary bg-primary text-white"
              : "border-border bg-surface text-transparent"
          }`}
        >
          <Icon name="check" size={11} />
        </span>
        <span className="text-[13px] font-bold text-ink">전체</span>
        <span className="text-[11px] text-text-3">모든 사업종류 표시</span>
      </button>

      {/* 그룹별 컬러 알약 */}
      <div className="mt-3 flex flex-col gap-3">
        {PROJECT_GROUPS.map((g) => {
          const items = typesInGroup(g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key}>
              <div className="mb-1.5 text-[11px] font-bold text-text-2">{g.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((t) => {
                  const active = selected.has(t.key);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => onToggle(t.key)}
                      aria-pressed={active}
                      className={`press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                        active ? "border-transparent" : "border-line bg-surface text-text-2"
                      }`}
                      style={active ? { background: `${t.color}1a`, color: t.color } : undefined}
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: t.color }}
                      />
                      {t.label}
                      {active ? <Icon name="check" size={12} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
