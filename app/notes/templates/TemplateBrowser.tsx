"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { CATEGORIES, type NoteTemplate } from "@/lib/note-templates/types";

/** 템플릿의 총 항목(체크 아이템) 수 */
function totalItems(t: NoteTemplate): number {
  return t.sections.reduce((sum, s) => sum + s.items.length, 0);
}

function TemplateCard({ t, delay }: { t: NoteTemplate; delay: string }) {
  const sectionCount = t.sections.length;
  const itemCount = totalItems(t);

  return (
    <Link
      href={`/notes/templates/${t.id}`}
      className={`card card-hover press ${delay} flex flex-col gap-3 rounded-[18px] p-5 no-underline`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {t.isOfficial && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Icon name="sparkles" size={12} />
            공식
          </span>
        )}
        <span className="rounded-full bg-[rgba(0,0,0,.05)] px-2 py-0.5 text-[11px] font-semibold text-text-2">
          {t.category}
        </span>
      </div>

      <h2 className="text-[16px] font-extrabold leading-[1.4] text-ink">
        {t.title}
      </h2>

      {t.description && (
        <p className="line-clamp-2 text-[13px] leading-[1.6] text-text-2">
          {t.description}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-3">
        <span className="inline-flex items-center gap-1">
          <Icon name="notebook-pen" size={13} />
          {sectionCount}개 섹션
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="check" size={13} />
          {itemCount}개 항목
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="file-text" size={13} />
          {t.useCount.toLocaleString()}회 사용
        </span>
      </div>

      <span className="text-[13px] font-semibold text-primary">
        자세히 보기 →
      </span>
    </Link>
  );
}

export function TemplateBrowser({ initial }: { initial: NoteTemplate[] }) {
  const [category, setCategory] = useState<string>("전체");

  const visible = useMemo(() => {
    if (category === "전체") return initial;
    return initial.filter((t) => t.category === category);
  }, [initial, category]);

  return (
    <div className="flex flex-col gap-4">
      {/* 카테고리 칩 필터 */}
      <div className="rise-in flex flex-wrap gap-2 text-[13px]">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`chip px-4 py-2 ${
              category === c
                ? "chip-active"
                : "border border-line bg-surface text-text-2"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rise-in-1 flex flex-col items-center gap-2 rounded-[16px] border border-line bg-surface px-4 py-12 text-center">
          <Icon name="search" size={22} className="text-text-3" />
          <p className="text-[14px] text-text-2">
            해당 카테고리의 템플릿이 아직 없어요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t, i) => (
            <TemplateCard
              key={t.id}
              t={t}
              delay={i === 0 ? "rise-in" : i === 1 ? "rise-in-1" : "rise-in-2"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
