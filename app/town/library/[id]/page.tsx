import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { getReport } from "@/lib/reports/store-db";
import { hasPurchased } from "@/lib/report-purchases/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { seoAlternates } from "@/lib/seo/alternates";
import { BuyReportButton } from "./BuyReportButton";

/* 리포트 상세·구매 — 자료실이 일부러 링크를 걸지 않던 "상세·구매 화면"이 이것이다.
   전달물 = 연결된 임장노트(source_note_id): 구매 기록이 있으면 그 노트를 열람한다.
   미리보기(제목·목차·프리뷰)는 공개, 전문은 구매 후. 소유자는 항상 열람. */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const r = await getReport(id).catch(() => null);
  if (!r) notFound();
  const title = `${r.title} — 유료 임장 리포트 | 누구집`;
  const description = (r.subtitle ?? r.previewContent ?? "임장러가 직접 쓴 유료 리포트").slice(0, 150);
  return {
    title,
    description,
    alternates: seoAlternates(`/town/library/${r.id}`),
    robots: { index: true, follow: true },
  };
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await getReport(id).catch(() => null);
  if (!r) notFound();

  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  const isOwner = Boolean(email && r.authorEmail && r.authorEmail.toLowerCase() === email);
  const purchased = Boolean(
    email && !isOwner && (await hasPurchased(r.id, email).catch(() => false)),
  );
  const canRead = isOwner || purchased;
  const noteHref = r.sourceNoteId ? `/notes/${r.sourceNoteId}` : null;

  return (
    <PageShell breadcrumb={`동네이야기 › 자료실 › ${r.title}`}>
      <div className="mx-auto w-full max-w-[680px]">
        <div className="mb-3">
          <Link href="/town/library" className="text-[12px] font-bold text-text-3 no-underline">
            ← 자료실
          </Link>
        </div>

        <div className="rise-in card flex flex-col gap-4 rounded-[20px] p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-extrabold text-primary">
              {r.category}
            </span>
            {r.region && (
              <span className="rounded-md bg-[#f2f4f8] px-2 py-0.5 text-[10px] font-bold text-text-2">
                {r.region}
              </span>
            )}
            <span className="ml-auto text-[11px] text-text-3">
              {r.authorLabel?.trim() || "누구집 크리에이터"}
            </span>
          </div>

          <h1 className="text-[20px] font-extrabold leading-[1.4] text-ink">{r.title}</h1>
          {r.subtitle && (
            <p className="text-[13.5px] leading-[1.7] text-text-2">{r.subtitle}</p>
          )}

          {r.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.tags.map((t) => (
                <span key={t} className="rounded-full bg-[#f2f4f8] px-2.5 py-1 text-[11px] text-text-2">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {r.tableOfContents.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-2xl bg-bg p-4">
              <div className="text-[12px] font-extrabold text-ink">목차</div>
              {r.tableOfContents.map((t, i) => (
                <div key={i} className="text-[12.5px] text-text-1">
                  {i + 1}. {t}
                </div>
              ))}
            </div>
          )}

          {r.previewContent && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[12px] font-extrabold text-ink">미리보기</div>
              <p className="whitespace-pre-wrap rounded-2xl bg-bg p-4 text-[13px] leading-[1.75] text-text-1">
                {r.previewContent}
              </p>
            </div>
          )}

          {/* 구매/열람 — 전달물이 연결된 리포트만 판매 CTA 를 그린다.
              전달물 없는 구형 행은 정직하게 '열람 준비 중'으로 막는다. */}
          <div className="border-t border-line pt-4">
            {canRead && noteHref ? (
              <div className="flex flex-col gap-2">
                <Link href={noteHref} className="btn-primary rounded-xl p-3.5 text-center text-[14px] no-underline">
                  {isOwner ? "내 노트 열람 (판매 중)" : "구매 완료 — 노트 전문 열람"}
                </Link>
                {!isOwner && (
                  <p className="text-center text-[10px] text-text-3">
                    구매 이력은 계정에 남아 언제든 다시 열람할 수 있어요.
                  </p>
                )}
              </div>
            ) : noteHref && r.price > 0 ? (
              <BuyReportButton reportId={r.id} price={r.price} title={r.title} />
            ) : (
              <p className="rounded-xl bg-bg px-4 py-3 text-center text-[12px] text-text-3">
                이 리포트는 아직 열람 연결이 준비되지 않았어요.
              </p>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] leading-[1.6] text-text-3">
          리포트는 작성자 개인의 기록·의견이며 투자 판단의 책임은 이용자에게 있어요 ·
          판매 대금은 포인트로 정산됩니다
        </p>
      </div>
    </PageShell>
  );
}
