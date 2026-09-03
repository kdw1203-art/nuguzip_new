import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { getReport } from "@/lib/reports/store-db";
import { hasPurchased } from "@/lib/report-purchases/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";
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
  /* 조회 실패(throw)와 없는 글(null)을 구분한다 — 실패는 404 로 위장하지 않고
     기본 메타로 폴백, 진짜 없는 글만 notFound. */
  const read = await getReport(id).then(
    (r) => ({ ok: true as const, r }),
    () => ({ ok: false as const }),
  );
  if (!read.ok) return { title: "리포트 | 내집나우", robots: { index: false, follow: false } };
  const r = read.r;
  if (!r) notFound();
  const title = `${r.title} — 유료 임장 리포트 | 내집나우`;
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
  /* [2026-08-22] 못 읽은 것 ≠ 없는 것. 예전엔 조회 실패도 notFound() 로 흘러
     멀쩡한 리포트가 "존재하지 않는" 404 로 나갔다. 실패는 실패라고 말한다. */
  const read = await getReport(id).then(
    (r) => ({ ok: true as const, r }),
    (err: unknown) => {
      logger.error("[library/[id]] 리포트 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );
  if (!read.ok) {
    return (
      <PageShell breadcrumb="동네이야기 › 자료실">
        <div className="mx-auto w-full max-w-[680px]">
          <ErrorState
            title="리포트를 지금 불러올 수 없어요"
            desc="리포트가 없는 게 아니라 조회 자체가 실패했습니다. 잠시 후 다시 시도해 주세요."
            cause={read.cause}
            action={{ label: "자료실로 이동", href: "/town/library" }}
          />
        </div>
      </PageShell>
    );
  }
  const r = read.r;
  if (!r) notFound();

  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  const isOwner = Boolean(email && r.authorEmail && r.authorEmail.toLowerCase() === email);
  /* 구매 이력: 실패를 false("안 샀다")로 바꾸지 않는다 — 이미 산 사람에게 결제
     버튼을 다시 보여주게 된다(store-db 머리말의 금지 사항 그대로). 실패는
     "확인 불가"라는 제3의 상태로 들고 가서 화면에서 다르게 말한다. */
  const purchasedRead: { ok: boolean; value: boolean } =
    email && !isOwner
      ? await hasPurchased(r.id, email).then(
          (value) => ({ ok: true, value }),
          (err: unknown) => {
            logger.error("[library/[id]] 구매 이력 조회 실패", err);
            return { ok: false, value: false };
          },
        )
      : { ok: true, value: false };
  const purchased = purchasedRead.ok && purchasedRead.value;
  const canRead = isOwner || purchased;
  const noteHref = r.sourceNoteId ? `/notes/${r.sourceNoteId}` : null;
  /* 판매 게이트를 구매 API(/api/creator/reports/[id]/buy)와 **같은 식**으로 맞춘다.
     예전엔 화면이 price>0 만 봤는데 API 는 isPremium && price>0 을 본다 — 어긋난
     행(price>0, isPremium=false)에서 "구매 버튼 → API 는 무료라며 기록 없이 OK →
     새로고침 → 다시 구매 버튼"의 무한 루프가 났다. 무료(가격 0 또는 비프리미엄)는
     노트가 연결돼 있으면 누구나 바로 열람한다. */
  const isPaid = r.isPremium && r.price > 0;
  const freeToRead = Boolean(noteHref) && !isPaid;

  return (
    <PageShell breadcrumb={`동네이야기 › 자료실 › ${r.title}`}>
      <div className="mx-auto w-full max-w-[680px]">
        <div className="mb-3">
          <Link href="/town/library" className="text-[12px] font-bold text-text-3 no-underline">
            ← 자료실
          </Link>
        </div>

        <div className="rise-in card flex flex-col gap-4 rounded-[18px] p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-extrabold text-primary">
              {r.category}
            </span>
            {r.region && (
              <span className="rounded-md bg-bg px-2 py-0.5 text-[10px] font-bold text-text-2">
                {r.region}
              </span>
            )}
            <span className="ml-auto text-[12px] text-text-3">
              {r.authorLabel?.trim() || "내집나우 크리에이터"}
            </span>
          </div>

          <h1 className="text-[19px] font-extrabold leading-[1.4] text-ink">{r.title}</h1>
          {r.subtitle && (
            <p className="text-[13px] leading-[1.7] text-text-2">{r.subtitle}</p>
          )}

          {r.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.tags.map((t) => (
                <span key={t} className="rounded-full bg-bg px-2.5 py-1 text-[12px] text-text-2">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {r.tableOfContents.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-2xl bg-bg p-4">
              <div className="text-[12px] font-extrabold text-ink">목차</div>
              {r.tableOfContents.map((t, i) => (
                <div key={i} className="text-[13px] text-text-1">
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
                <Link href={noteHref} className="btn-primary rounded-xl p-3.5 text-center text-[13px] no-underline">
                  {isOwner ? "내 노트 열람 (판매 중)" : "구매 완료 — 노트 전문 열람"}
                </Link>
                {!isOwner && (
                  <p className="text-center text-[10px] text-text-3">
                    구매 이력은 계정에 남아 언제든 다시 열람할 수 있어요.
                  </p>
                )}
              </div>
            ) : freeToRead && noteHref ? (
              /* 무료 리포트 — 목록이 '무료' 배지를 달아 보내는 바로 그 행이다.
                 예전엔 price>0 게이트에 걸려 "열람 준비 중"이 나갔다(있는 무료
                 자료를 못 여는 화면). 바로 열람으로 잇는다. */
              <div className="flex flex-col gap-2">
                <Link href={noteHref} className="btn-primary rounded-xl p-3.5 text-center text-[13px] no-underline">
                  무료 열람 — 노트 전문 보기
                </Link>
                <p className="text-center text-[10px] text-text-3">
                  이 리포트는 무료로 공개돼 있어요.
                </p>
              </div>
            ) : !purchasedRead.ok ? (
              /* 구매 이력 확인 실패 — 결제 버튼을 그리면 이미 산 사람이 또 사게
                 될 수 있다. "모르겠다"는 상태 그대로 보여주고 재시도를 권한다. */
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-center text-[12px] leading-[1.7] text-ink">
                구매 이력을 지금 확인하지 못했어요. 이미 구매하셨다면 잠시 후
                새로고침해 주세요 — 확인 없이 결제 버튼을 보여드리지 않아요.
              </p>
            ) : noteHref && isPaid ? (
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
