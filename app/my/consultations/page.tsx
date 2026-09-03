import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { Icon } from "@/app/components/Icon";
import { ConsultReply } from "./ConsultReply";
import { ReviewForm } from "./ReviewForm";
import { CloseConsult } from "./CloseConsult";
import { ProposeQuote } from "./ProposeQuote";
import { safeAuth } from "@/lib/safe-auth";
import { getExpertByOwnerEmail } from "@/lib/experts/store-db";
import { reviewedConsultationIds } from "@/lib/experts/reviews-store";
import { responseStats, responseTimeLabel } from "@/lib/experts/review-rules";
import { listMarketRequests, listMyMarketRequests } from "@/lib/market/store-db";
import {
  countProposalsByRequest,
  listProposalsForRequests,
  proposedRequestIds,
  type MarketRequestProposal,
} from "@/lib/market/proposals-store";
import {
  listConsultationsForExpert,
  listMyConsultations,
  type ExpertConsultation,
  type ConsultStatus,
} from "@/lib/expert-consultations/store-db";

/* ============================================================
   상담함 · /my/consultations (953 재설계)
   ┌ 보낸 상담(#sent)      의뢰자 — 답변 열람 · 후기 · 마감
   ├ 내 견적 요청(#requests) 의뢰자 — 요청별 받은 제안 → 전문가 프로필
   └ 받은 상담(#received)  전문가 — 답변 · 견적 보드(제안)
   953 전에는 전문가 전용이었고, 의뢰자는 답변을 알림 본문 160자로만 볼 수 있었다.
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "상담함 · 내집나우",
  robots: { index: false, follow: false },
};

const STATUS_META: Record<ConsultStatus, { label: string; cls: string }> = {
  pending: { label: "답변 대기", cls: "bg-primary-soft text-primary" },
  replied: { label: "답변 도착", cls: "bg-success-soft text-success" },
  closed: { label: "마감", cls: "bg-bg text-text-3" },
};

const TYPE_LABEL: Record<ExpertConsultation["type"], string> = {
  text: "글 답변",
  call: "전화 상담",
  visit: "방문 상담",
};

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "방금 전";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function SectionHead({
  id,
  title,
  count,
  hint,
}: {
  id: string;
  title: string;
  count?: number;
  hint?: string;
}) {
  return (
    <div id={id} className="mb-3 flex items-baseline justify-between gap-2 scroll-mt-24">
      <h2 className="t-section text-ink">
        {title}
        {count !== undefined && <span className="ml-1.5 t-sub font-semibold text-text-3">{count}</span>}
      </h2>
      {hint && <span className="t-sub text-text-3">{hint}</span>}
    </div>
  );
}

function EmptyCard({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <div className="card flex flex-col items-center gap-2 rounded-2xl px-5 py-9 text-center">
      <div className="t-body font-extrabold text-ink">{title}</div>
      <p className="max-w-[420px] t-sub text-text-3">{body}</p>
      {cta && (
        <Link href={cta.href} className="btn-soft btn-md mt-1 no-underline">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export default async function MyConsultationsPage() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    redirect("/login?callbackUrl=/my/consultations");
  }

  const [expert, sent, myRequests, reviewedIds] = await Promise.all([
    getExpertByOwnerEmail(email).catch(() => null),
    listMyConsultations(email),
    listMyMarketRequests(email),
    reviewedConsultationIds(email),
  ]);
  const proposalsByRequest = await listProposalsForRequests(myRequests.map((r) => r.id));

  /* ── 전문가 쪽 데이터 (프로필이 있을 때만) ── */
  let received: ExpertConsultation[] = [];
  let board: Awaited<ReturnType<typeof listMarketRequests>> = [];
  let boardFailed = false;
  let boardProposalCounts = new Map<string, number>();
  let myProposed = new Set<string>();
  if (expert) {
    received = await listConsultationsForExpert(expert.id);
    try {
      board = (await listMarketRequests()).filter((r) => r.status === "open").slice(0, 12);
      [boardProposalCounts, myProposed] = await Promise.all([
        countProposalsByRequest(board.map((r) => r.id)),
        proposedRequestIds(email),
      ]);
    } catch {
      boardFailed = true;
    }
  }

  const pendingSent = sent.filter((c) => c.status === "pending").length;
  const repliedUnreviewed = sent.filter((c) => c.status === "replied" && !reviewedIds.has(c.id)).length;
  const proposalTotal = [...proposalsByRequest.values()].reduce((n, l) => n + l.length, 0);

  const isExpertView = Boolean(expert);
  const stats = expert ? responseStats(received) : null;
  const counts = received.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const monthStart = startOfMonthIso();
  const thisMonth = received.filter((c) => c.createdAt >= monthStart).length;

  return (
    <PageShell breadcrumb="마이 › 상담함" title="상담함">
      {/* ── 요약 줄: 무엇을 해야 하는지 한눈에 ── */}
      <div className="rise-in mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <a href="#sent" className="card card-pad-sm flex flex-col gap-0.5 no-underline">
          <span className="t-sub text-text-3">보낸 상담</span>
          <span className="t-title text-ink">{sent.length}</span>
          <span className="t-caption text-text-3">{pendingSent > 0 ? `답변 대기 ${pendingSent}` : "대기 중 없음"}</span>
        </a>
        <a href="#sent" className="card card-pad-sm flex flex-col gap-0.5 no-underline">
          <span className="t-sub text-text-3">후기 남길 상담</span>
          <span className={`t-title ${repliedUnreviewed > 0 ? "text-brand-red" : "text-ink"}`}>{repliedUnreviewed}</span>
          <span className="t-caption text-text-3">답변 도착 · 후기 전</span>
        </a>
        <a href="#requests" className="card card-pad-sm flex flex-col gap-0.5 no-underline">
          <span className="t-sub text-text-3">내 견적 요청</span>
          <span className="t-title text-ink">{myRequests.length}</span>
          <span className="t-caption text-text-3">{proposalTotal > 0 ? `받은 제안 ${proposalTotal}` : "받은 제안 없음"}</span>
        </a>
        {isExpertView ? (
          <a href="#received" className="card card-pad-sm flex flex-col gap-0.5 no-underline">
            <span className="t-sub text-text-3">받은 상담</span>
            <span className={`t-title ${(counts.pending ?? 0) > 0 ? "text-brand-red" : "text-ink"}`}>{received.length}</span>
            <span className="t-caption text-text-3">{(counts.pending ?? 0) > 0 ? `답변 대기 ${counts.pending}` : "대기 중 없음"}</span>
          </a>
        ) : (
          <Link href="/town/experts" className="card card-pad-sm flex flex-col justify-between gap-0.5 no-underline">
            <span className="t-sub text-text-3">전문가 찾기</span>
            <span className="t-body font-extrabold text-primary">분야·지역으로 보기 ›</span>
          </Link>
        )}
      </div>

      {/* ══════════ 보낸 상담 (의뢰자) ══════════ */}
      <section className="mb-9">
        <SectionHead id="sent" title="보낸 상담" count={sent.length} hint="답변이 오면 알림과 여기에 함께 도착해요" />
        {sent.length === 0 ? (
          <EmptyCard
            title="아직 보낸 상담이 없어요"
            body="전문가 프로필에서 '상담 신청'을 누르면 여기에 쌓여요. 임장노트 링크를 함께 붙이면 더 정확한 답을 받을 수 있어요."
            cta={{ href: "/town/experts", label: "전문가 찾아보기" }}
          />
        ) : (
          <div className="rise-in flex flex-col gap-3">
            {sent.map((c) => {
              const meta = STATUS_META[c.status];
              const canReview = c.status === "replied" && !reviewedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  className={`card card-pad-sm flex flex-col gap-2.5 ${
                    c.status === "replied" && canReview ? "border-l-[3px] border-l-brand-red" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-md chip-pad t-caption font-extrabold ${meta.cls}`}>{meta.label}</span>
                    <span className="rounded-md bg-bg chip-pad t-sub font-bold text-text-2">{TYPE_LABEL[c.type]}</span>
                    <Link href={`/town/experts/${c.expertId}`} className="t-body font-bold text-ink no-underline hover:text-primary">
                      {c.expertLabel ?? "전문가"} 님께
                    </Link>
                    <span className="ml-auto t-sub text-text-3">{timeAgo(c.createdAt)}</span>
                  </div>

                  <p className="whitespace-pre-wrap rounded-xl bg-bg px-3.5 py-2.5 t-body text-text-2">{c.message}</p>

                  {c.reply ? (
                    <div className="rounded-xl border border-success-border bg-success-soft px-3.5 py-2.5">
                      <div className="mb-1 flex items-center justify-between t-sub font-bold text-success">
                        <span>{c.expertLabel ?? "전문가"} 님의 답변</span>
                        {c.repliedAt && <span className="font-medium">{timeAgo(c.repliedAt)}</span>}
                      </div>
                      <p className="whitespace-pre-wrap t-body text-text-1">{c.reply}</p>
                    </div>
                  ) : c.status === "pending" ? (
                    <p className="t-sub text-text-3">
                      전문가가 확인하면 답변이 여기에 도착해요. 보통 1~2일 안에 답이 와요 — 3일이 지나도 없으면 다른 전문가에게 다시 물어보세요.
                    </p>
                  ) : null}

                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    {canReview && (
                      <ReviewForm expertId={c.expertId} expertName={c.expertLabel ?? "전문가"} consultationId={c.id} />
                    )}
                    {c.status === "replied" && reviewedIds.has(c.id) && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-success-soft chip-pad t-sub font-extrabold text-success">
                        <Icon name="check" size={12} /> 후기 남김
                      </span>
                    )}
                    {c.status === "pending" && <CloseConsult expertId={c.expertId} consultationId={c.id} />}
                    <Link href={`/town/experts/${c.expertId}`} className="btn-ghost btn-sm no-underline">
                      프로필 보기 ›
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ══════════ 내 견적 요청 + 받은 제안 (의뢰자) ══════════ */}
      <section className="mb-9">
        <SectionHead id="requests" title="내 견적 요청" count={myRequests.length} hint="전문가 제안은 요청 아래에 모여요" />
        {myRequests.length === 0 ? (
          <EmptyCard
            title="보낸 견적 요청이 없어요"
            body="어떤 전문가가 필요한지 모르겠다면 전문가 목록의 '견적 요청'에 필요한 내용을 남겨 보세요. 인증 전문가가 제안을 보내면 여기서 비교할 수 있어요."
            cta={{ href: "/town/experts", label: "견적 요청하러 가기" }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {myRequests.map((r) => {
              const proposals: MarketRequestProposal[] = proposalsByRequest.get(r.id) ?? [];
              return (
                <div key={r.id} className="card flex flex-col gap-2.5 rounded-2xl p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-primary-soft chip-pad t-caption font-extrabold text-primary">{r.requestType}</span>
                    <span className="t-body font-extrabold text-ink">{r.title}</span>
                    <span
                      className={`rounded-md chip-pad t-caption font-extrabold ${
                        r.status === "open" ? "bg-success-soft text-success" : "bg-bg text-text-3"
                      }`}
                    >
                      {r.status === "open" ? "접수 중" : "마감"}
                    </span>
                    <span className="ml-auto t-caption text-text-3">{timeAgo(r.createdAt)}</span>
                  </div>
                  {r.description && <p className="t-sub text-text-2">{r.description.slice(0, 200)}</p>}
                  <div className="t-sub text-text-3">{[r.city, r.district].filter(Boolean).join(" ") || "지역 무관"}</div>

                  {proposals.length === 0 ? (
                    <p className="rounded-xl bg-bg px-3.5 py-2.5 t-sub text-text-3">
                      아직 제안이 없어요. 인증 전문가가 요청을 보고 제안을 보내면 여기에 표시되고 알림도 함께 가요.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="t-sub font-extrabold text-ink">받은 제안 {proposals.length}건</div>
                      {proposals.map((p) => (
                        <div key={p.id} className="flex flex-col gap-1.5 rounded-xl border border-line bg-bg px-3.5 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {p.expertId ? (
                              <Link href={`/town/experts/${p.expertId}`} className="t-body font-bold text-ink no-underline hover:text-primary">
                                {p.expertLabel}
                              </Link>
                            ) : (
                              <span className="t-body font-bold text-ink">{p.expertLabel}</span>
                            )}
                            <span className="rounded-md bg-primary-soft chip-pad t-caption font-extrabold text-primary">인증</span>
                            <span className="ml-auto t-caption text-text-3">{timeAgo(p.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap t-sub text-text-2">{p.message}</p>
                          {p.expertId && (
                            <Link href={`/town/experts/${p.expertId}`} className="self-start t-sub font-bold text-primary no-underline">
                              프로필 보고 상담 신청하기 →
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ══════════ 받은 상담 (전문가) ══════════ */}
      {expert && (
        <section className="mb-9">
          <SectionHead id="received" title="받은 상담" count={received.length} hint="전문가 콘솔" />

          {/* 전문가 요약 */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-body font-extrabold text-ink">{expert.name}</span>
              <span className="rounded-md bg-bg chip-pad t-sub font-bold text-text-2">{expert.category}</span>
              {expert.isVerified ? (
                <span className="rounded-md bg-success-soft chip-pad t-sub font-extrabold text-success">인증 완료</span>
              ) : (
                <span className="rounded-md border border-warning-border bg-warning-soft chip-pad t-sub font-extrabold text-warning">인증 검토 중</span>
              )}
            </div>
            <div className="flex gap-2">
              <Link href="/my/expert-profile" className="btn-soft btn-sm no-underline">
                프로필 수정
              </Link>
              <Link href={`/town/experts/${expert.id}`} className="btn-outline btn-sm no-underline">
                내 공개 프로필
              </Link>
            </div>
          </div>

          {/* 실적 — 실측만 */}
          <div className="rise-in mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {[
              { label: "답변 대기", value: String(counts.pending ?? 0), accent: (counts.pending ?? 0) > 0 },
              { label: "이번 달 상담", value: String(thisMonth), accent: false },
              {
                label: "응답률 (90일)",
                value: stats?.responseRate === null || stats?.responseRate === undefined ? "—" : `${stats.responseRate}%`,
                accent: false,
              },
              { label: "응답 시간", value: responseTimeLabel(stats?.medianHours ?? null, expert.responseTime) ?? "—", accent: false },
            ].map((s) => (
              <div key={s.label} className="card card-pad-sm flex flex-col gap-0.5">
                <span className="t-sub text-text-3">{s.label}</span>
                <span className={`t-section ${s.accent ? "text-brand-red" : "text-ink"}`}>{s.value}</span>
              </div>
            ))}
          </div>

          {!expert.isVerified && (
            <div className="rise-in mb-4 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 t-sub text-warning">
              아직 인증 검토 중이에요. 인증이 완료되면 전문가 목록에 노출되고 상담 신청을 받을 수 있어요.
            </div>
          )}

          {received.length === 0 ? (
            <EmptyCard
              title="아직 받은 상담이 없어요"
              body="이용자가 상담을 신청하면 여기로 도착해요. 소개·전문 분야·활동 지역을 채우고 응답 시간을 적어 두면 신청이 늘어요."
              cta={{ href: "/my/expert-profile", label: "프로필 채우기" }}
            />
          ) : (
            <div className="rise-in flex flex-col gap-3">
              {received.map((c) => {
                const meta = STATUS_META[c.status];
                return (
                  <div
                    key={c.id}
                    className={`card card-pad-sm flex flex-col gap-2.5 ${c.status === "pending" ? "border-l-[3px] border-l-brand-red" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-md chip-pad t-caption font-extrabold ${meta.cls}`}>
                        {c.status === "replied" ? "답변함" : meta.label}
                      </span>
                      <span className="rounded-md bg-bg chip-pad t-sub font-bold text-text-2">{TYPE_LABEL[c.type]}</span>
                      <span className="t-body font-bold text-ink">{c.userName ?? "이용자"}</span>
                      <span className="ml-auto t-sub text-text-3">{timeAgo(c.createdAt)}</span>
                    </div>

                    <p className="whitespace-pre-wrap rounded-xl bg-bg px-3.5 py-2.5 t-body text-text-2">{c.message}</p>

                    {(c.contactInfo || c.preferredTime) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 t-sub text-text-3">
                        {c.contactInfo && (
                          <span>
                            연락처 · <b className="break-all text-ink">{c.contactInfo}</b>
                          </span>
                        )}
                        {c.preferredTime && (
                          <span>
                            희망 시간 · <b className="text-text-2">{c.preferredTime}</b>
                          </span>
                        )}
                      </div>
                    )}

                    {c.reply && (
                      <div className="rounded-xl border border-success-border bg-success-soft px-3.5 py-2.5">
                        <div className="mb-1 t-sub font-bold text-success">내 답변</div>
                        <p className="whitespace-pre-wrap t-body text-text-2">{c.reply}</p>
                      </div>
                    )}

                    {c.status !== "closed" && (
                      <div className="mt-0.5">
                        <ConsultReply expertId={expert.id} consultationId={c.id} existingReply={c.reply} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 견적 요청 보드 ── */}
          <div className="mt-8 mb-3 flex items-baseline justify-between">
            <h3 className="t-body font-extrabold text-ink">견적 요청 보드</h3>
            <span className="t-sub text-text-3">이용자들이 올린 열린 요청 · 제안은 요청당 1건</span>
          </div>
          {boardFailed ? (
            <div className="card rounded-2xl px-4 py-6 text-center t-sub text-text-3">
              견적 요청을 지금 불러오지 못했어요 — 요청이 없는 게 아니라 조회가 실패했습니다.
            </div>
          ) : board.length === 0 ? (
            <div className="card rounded-2xl px-4 py-6 text-center t-sub text-text-3">
              아직 열린 견적 요청이 없어요. 새 요청이 올라오면 여기에 표시됩니다.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {board.map((r) => (
                <div key={r.id} className="card flex flex-col gap-2 rounded-2xl p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-primary-soft chip-pad t-caption font-extrabold text-primary">{r.requestType}</span>
                    <span className="t-body font-extrabold text-ink">{r.title}</span>
                    {(boardProposalCounts.get(r.id) ?? 0) > 0 && (
                      <span className="rounded-md bg-bg chip-pad t-caption font-bold text-text-2">제안 {boardProposalCounts.get(r.id)}건</span>
                    )}
                    <span className="ml-auto t-caption text-text-3">{timeAgo(r.createdAt)}</span>
                  </div>
                  {r.description && <p className="t-sub text-text-2">{r.description.slice(0, 160)}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 t-sub text-text-3">
                    <span>{[r.city, r.district].filter(Boolean).join(" ") || "지역 무관"}</span>
                    {r.dueDate && <span>희망 기한 {r.dueDate}</span>}
                    <span>{r.requesterLabel}</span>
                  </div>
                  {expert.isVerified ? (
                    <ProposeQuote requestId={r.id} alreadyProposed={myProposed.has(r.id)} />
                  ) : (
                    <span className="t-sub text-text-3">제안 보내기는 인증 완료 후 열려요.</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!expert && (
        <div className="mb-9 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-brand-hanji px-5 py-6 text-center">
          <div className="t-body font-extrabold text-brand-hanji-ink">전문가이신가요?</div>
          <p className="t-sub text-brand-hanji-ink">
            자격 인증을 마치면 이 화면에서 상담 신청을 받고 답변하며, 견적 요청 보드에 제안을 보낼 수 있어요.
          </p>
          <Link href="/town/experts#apply" className="btn-primary btn-md mt-1 no-underline">
            전문가 인증 신청
          </Link>
        </div>
      )}

      {/* 법적 고지 */}
      <div className="rounded-xl bg-bg px-4 py-3 t-sub text-text-3">
        상담 답변은 전문가 개인의 의견이며, 내집나우는 상담 당사자가 아니에요. 투자·세무 판단의 최종
        책임은 이용자 본인에게 있습니다. 개인정보(전화번호·계좌)는 남기지 마시고, 플랫폼 밖 결제 유도는 신고해 주세요.
      </div>
    </PageShell>
  );
}
