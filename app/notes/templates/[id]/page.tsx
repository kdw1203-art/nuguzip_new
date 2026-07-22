import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { getTemplate } from "@/lib/note-templates/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tpl = await getTemplate(id);
  if (!tpl) {
    return { title: "템플릿을 찾을 수 없어요 | 누구집" };
  }
  return {
    title: `${tpl.title} | 임장 노트 템플릿 | 누구집`,
    description:
      tpl.description ||
      `${tpl.category} 임장 체크리스트 — ${tpl.sections.length}개 섹션의 점검 항목으로 임장 노트를 작성하세요.`,
    robots: { index: !tpl.isSample, follow: true },
  };
}

export default async function NoteTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tpl = await getTemplate(id);

  if (!tpl) {
    return (
      <PageShell breadcrumb="홈 › 임장노트 › 템플릿" title="템플릿을 찾을 수 없어요">
        <div className="card rise-in flex flex-col items-center gap-4 rounded-[18px] p-8 text-center">
          <Icon name="file-text" size={28} className="text-text-3" />
          <p className="text-[14px] leading-[1.6] text-text-2">
            요청하신 템플릿이 없거나 비공개로 전환되었어요.
          </p>
          <Link
            href="/notes/templates"
            className="btn-primary press rounded-[12px] px-5 py-2.5 text-[14px] font-bold no-underline"
          >
            템플릿 목록으로
          </Link>
        </div>
      </PageShell>
    );
  }

  const totalItems = tpl.sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <PageShell breadcrumb="홈 › 임장노트 › 템플릿" title={tpl.title}>
      {/* 상단 배지 */}
      <div className="rise-in mb-3 flex flex-wrap items-center gap-1.5">
        {tpl.isOfficial && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[12px] font-semibold text-primary">
            <Icon name="sparkles" size={13} />
            공식
          </span>
        )}
        <span className="rounded-full bg-[rgba(0,0,0,.05)] px-2.5 py-1 text-[12px] font-semibold text-text-2">
          {tpl.category}
        </span>
        <span className="rounded-full bg-[rgba(0,0,0,.05)] px-2.5 py-1 text-[11px] font-semibold text-text-3">
          {tpl.sections.length}개 섹션 · {totalItems}개 항목
        </span>
      </div>

      {tpl.description && (
        <p className="rise-in mb-5 text-[14px] leading-[1.7] text-text-2">
          {tpl.description}
        </p>
      )}

      {/* 섹션 목록 */}
      <div className="flex flex-col gap-4">
        {tpl.sections.map((section, i) => (
          <section
            key={`${section.title}-${i}`}
            className="card rise-in-1 flex flex-col gap-3 rounded-[18px] p-5"
          >
            <h2 className="flex items-center gap-2 text-[16px] font-extrabold text-ink">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-bold text-primary">
                {i + 1}
              </span>
              {section.title}
            </h2>
            <ul className="flex flex-col gap-2">
              {section.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-[14px] leading-[1.6] text-text-1">
                  <Icon
                    name="check"
                    size={15}
                    className="mt-0.5 shrink-0 text-primary"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* 태그 */}
      {tpl.tags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {tpl.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface px-2.5 py-1 text-[12px] text-text-3 border border-line"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={`/notes/new?tpl=${tpl.id}`}
          className="btn-primary press inline-flex items-center justify-center gap-2 rounded-[14px] px-6 py-3.5 text-[15px] font-bold no-underline"
        >
          <Icon name="notebook-pen" size={17} />이 템플릿으로 노트 쓰기
        </Link>
        <Link
          href="/notes/templates"
          className="press inline-flex items-center justify-center rounded-[14px] border border-line bg-surface px-6 py-3.5 text-[14px] font-semibold text-text-2 no-underline"
        >
          다른 템플릿 보기
        </Link>
      </div>
    </PageShell>
  );
}
