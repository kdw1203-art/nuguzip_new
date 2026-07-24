import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { Icon } from "@/app/components/Icon";
import { ConsultReply } from "./ConsultReply";
import { safeAuth } from "@/lib/safe-auth";
import { getExpertByOwnerEmail } from "@/lib/experts/store-db";
import {
  listConsultationsForExpert,
  type ExpertConsultation,
  type ConsultStatus,
} from "@/lib/expert-consultations/store-db";

/* ============================================================
   전문가 운영 — 받은 상담 관리 · /my/consultations (전문가 전용)
   전문가 본인이 받은 상담을 확인·답변한다. 실데이터(expert_consultations).
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "상담 관리 · 누구집",
  robots: { index: false, follow: false },
};

const STATUS_META: Record<ConsultStatus, { label: string; cls: string }> = {
  pending: { label: "답변 대기", cls: "bg-[rgba(29,79,216,.1)] text-primary" },
  replied: { label: "답변함", cls: "bg-[rgba(26,127,78,.1)] text-[#1a7f4e]" },
  closed: { label: "마감", cls: "bg-[rgba(0,0,0,.06)] text-text-3" },
};

const TYPE_LABEL: Record<ExpertConsultation["type"], string> = {
  text: "텍스트 상담",
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

export default async function MyConsultationsPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/my/consultations");
  }

  const expert = await getExpertByOwnerEmail(session.user.email);
  if (!expert) {
    return (
      <PageShell breadcrumb="마이 › 상담 관리" title="상담 관리">
        <div className="mx-auto max-w-[520px]">
          <div className="rise-in card flex flex-col items-center gap-3 px-5 py-12 text-center">
            <div className="text-[26px]">
              <Icon name="💬" size={26} />
            </div>
            <div className="text-[15px] font-extrabold text-ink">
              전문가 등록 후 상담을 받을 수 있어요
            </div>
            <p className="max-w-[420px] text-[13px] leading-[1.7] text-text-3">
              전문가로 등록·인증되면 이용자가 남긴 상담 신청을 이 화면에서 받아 답변할 수
              있어요. 답변률·응답 속도는 프로필에 반영돼요.
            </p>
            <Link href="/town/experts" className="btn-primary btn-md mt-1 no-underline">
              전문가 등록 신청
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const items = await listConsultationsForExpert(expert.id);
  const counts = items.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const monthStart = startOfMonthIso();
  const thisMonth = items.filter((c) => c.createdAt >= monthStart).length;

  const stats = [
    { label: "답변 대기", value: counts.pending ?? 0, accent: (counts.pending ?? 0) > 0 },
    { label: "답변함", value: counts.replied ?? 0, accent: false },
    { label: "이번 달 상담", value: thisMonth, accent: false },
  ];

  return (
    <PageShell breadcrumb="마이 › 상담 관리" title="상담 관리">
      {/* 전문가 요약 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-extrabold text-ink">{expert.name}</span>
          <span className="rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-bold text-text-2">
            {expert.category}
          </span>
          {expert.isVerified ? (
            <span className="rounded-[6px] bg-[rgba(26,127,78,.1)] px-2 py-[3px] text-[11px] font-extrabold text-[#1a7f4e]">
              인증 완료
            </span>
          ) : (
            <span className="rounded-[6px] bg-[rgba(245,158,11,.14)] px-2 py-[3px] text-[11px] font-extrabold text-[#b45309]">
              인증 검토 중
            </span>
          )}
        </div>
        <Link href="/town/experts" className="btn-outline btn-md no-underline">
          전문가 목록 보기
        </Link>
      </div>

      {/* 실적 요약 */}
      <div className="rise-in mb-4 grid grid-cols-3 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className="card card-pad-sm flex flex-col gap-0.5">
            <span className="text-[11px] text-text-3">{s.label}</span>
            <span
              className={`text-[20px] font-extrabold ${s.accent ? "text-primary" : "text-ink"}`}
            >
              {s.value.toLocaleString("ko-KR")}
            </span>
          </div>
        ))}
      </div>

      {!expert.isVerified && (
        <div className="rise-in mb-4 rounded-xl bg-[rgba(245,158,11,.08)] px-4 py-3 text-[12px] leading-[1.7] text-[#b45309]">
          아직 인증 검토 중이에요. 인증이 완료되면 전문가 목록에 노출되고 상담 신청을 받을 수
          있어요.
        </div>
      )}

      {items.length === 0 ? (
        <div className="rise-in card card-pad-sm flex flex-col items-center gap-3 py-14 text-center">
          <div className="text-[15px] font-extrabold text-ink">아직 받은 상담이 없어요</div>
          <p className="max-w-[440px] text-[13px] leading-[1.7] text-text-3">
            이용자가 상담을 신청하면 여기로 도착해요. 프로필의 소개·전문 분야를 충실히
            채우면 상담 신청이 늘어나요.
          </p>
        </div>
      ) : (
        <div className="rise-in flex flex-col gap-3">
          {items.map((c) => {
            const meta = STATUS_META[c.status];
            return (
              <div
                key={c.id}
                className={`card card-pad-sm flex flex-col gap-2.5 ${
                  c.status === "pending" ? "border-l-[3px] border-l-primary" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-[6px] px-2 py-[3px] text-[11px] font-extrabold ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                  <span className="rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-bold text-text-2">
                    {TYPE_LABEL[c.type]}
                  </span>
                  <span className="text-[13px] font-bold text-ink">
                    {c.userName ?? "이용자"}
                  </span>
                  <span className="ml-auto text-[11px] text-text-3">{timeAgo(c.createdAt)}</span>
                </div>

                <p className="whitespace-pre-wrap rounded-xl bg-[rgba(0,0,0,.03)] px-3.5 py-2.5 text-[13px] leading-[1.7] text-text-2">
                  {c.message}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-3">
                  {c.contactInfo && (
                    <span>
                      연락처 · <b className="text-ink break-all">{c.contactInfo}</b>
                    </span>
                  )}
                  {c.preferredTime && (
                    <span>
                      희망 시간 · <b className="text-text-2">{c.preferredTime}</b>
                    </span>
                  )}
                </div>

                {c.reply && (
                  <div className="rounded-xl border border-[rgba(26,127,78,.2)] bg-[rgba(26,127,78,.05)] px-3.5 py-2.5">
                    <div className="mb-1 text-[11px] font-bold text-[#1a7f4e]">내 답변</div>
                    <p className="whitespace-pre-wrap text-[13px] leading-[1.7] text-text-2">
                      {c.reply}
                    </p>
                  </div>
                )}

                <div className="mt-0.5">
                  <ConsultReply
                    expertId={expert.id}
                    consultationId={c.id}
                    existingReply={c.reply}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 법적 고지 */}
      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        상담 답변은 전문가 개인의 의견이며, 누구집은 상담 당사자가 아니에요. 투자·법률·세무
        판단의 최종 책임은 이용자 본인에게 있습니다.
      </div>
    </PageShell>
  );
}
