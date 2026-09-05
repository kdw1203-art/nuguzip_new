import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { getExpertByOwnerEmail } from "@/lib/experts/store-db";
import { getLatestExpertApplication } from "@/lib/experts/verification-store";
import { EXPERT_VERIFICATION_PIPELINE } from "@/lib/experts/verification-policy";
import { ExpertProfileForm } from "./ExpertProfileForm";

/* 전문가 프로필 수정 — 승인 후 프로필을 본인이 관리하는 유일한 화면.
   PATCH /api/experts/[id] 는 예전부터 완성돼 있었지만(권한 검사 포함) 부르는
   UI 가 하나도 없어서, 승인 시 복사된 값(소개·전문분야·경력·상담료)이 영원히
   얼어 있었다. 연락처(전화·카카오)는 여기서 본인이 채울 때만 공개된다. */

export const metadata = {
  title: "전문가 프로필 관리 · 내집나우",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ExpertProfilePage() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;

  if (!email) {
    return (
      <PageShell breadcrumb="마이 › 전문가 프로필">
        <div className="card mx-auto mt-8 max-w-[520px] rounded-2xl px-5 py-8 text-center">
          <p className="t-section text-ink">로그인이 필요해요</p>
          <Link
            href="/login?callbackUrl=/my/expert-profile"
            className="btn-primary btn-md mt-3 inline-block no-underline"
          >
            로그인
          </Link>
        </div>
      </PageShell>
    );
  }

  const expert = await getExpertByOwnerEmail(email).catch(() => null);

  if (!expert) {
    /* [965] 신청은 했는데 승인 전인 사람에게 "프로필이 없어요 → 신청하기" 만 보이던
       문제. 가장 최근 신청의 상태(심사 중·반려·승인)를 여기서 보여 준다. */
    const application = await getLatestExpertApplication(email).catch(() => null);
    return (
      <PageShell breadcrumb="마이 › 전문가 프로필">
        {application ? (
          <ApplicationStatusCard application={application} />
        ) : (
          <div className="card mx-auto mt-8 max-w-[560px] rounded-2xl px-5 py-8 text-center">
            <p className="t-section text-ink">
              아직 전문가 프로필이 없어요
            </p>
            <p className="mx-auto mt-1.5 max-w-[420px] t-sub text-text-3">
              전문가 인증을 신청하고 승인되면 프로필이 만들어져요. 인증 후 이
              화면에서 소개·전문 분야·상담료·연락처를 직접 관리할 수 있습니다.
            </p>
            <Link href="/town/experts#apply" className="btn-primary btn-md mt-4 inline-block no-underline">
              전문가 인증 신청하기
            </Link>
          </div>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell breadcrumb="마이 › 전문가 프로필">
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="t-title text-ink">전문가 프로필 관리</h1>
            <p className="mt-1 t-sub text-text-3">
              여기서 저장한 내용이 전문가 목록·상세에 바로 반영돼요.
              {expert.isVerified
                ? " 인증 전문가라 연락처를 공개하면 상담 신청자에게 표시됩니다."
                : " 인증 심사 중에는 연락처가 공개되지 않아요(승인 후 노출)."}
            </p>
          </div>
          <Link href="/my/consultations#received" className="btn-soft btn-sm no-underline">
            상담함 ›
          </Link>
        </div>
        <ExpertProfileForm
          expert={{
            id: expert.id,
            name: expert.name,
            title: expert.title,
            category: expert.category,
            reviews: expert.reviews,
            rating: expert.rating,
            consultations: expert.consultations,
            introduction: expert.introduction,
            specialties: expert.specialties,
            regions: expert.regions,
            experience: expert.experience,
            consultationFee: expert.consultationFee,
            reportFee: expert.reportFee,
            responseTime: expert.responseTime,
            organization: expert.organization,
            contactPhone: expert.contactPhone,
            contactKakao: expert.contactKakao,
            isVerified: expert.isVerified,
          }}
        />
      </div>
    </PageShell>
  );
}

/* ── 신청 진행 상태 (프로필 생성 전) ── */
function ApplicationStatusCard({
  application,
}: {
  application: NonNullable<Awaited<ReturnType<typeof getLatestExpertApplication>>>;
}) {
  const submitted = new Date(application.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const reviewFlags = application.fraudFlags.filter((f) => f.severity !== "block");
  const stageIndex = (() => {
    if (application.status === "approved") return EXPERT_VERIFICATION_PIPELINE.length - 1;
    if (application.workflowStage === "intake") return 0;
    /* auto_check 이후는 전부 운영자 검토 단계 */
    return 2;
  })();

  if (application.status === "rejected") {
    return (
      <div className="card mx-auto mt-8 max-w-[560px] rounded-2xl px-5 py-7">
        <p className="t-caption font-bold text-danger">인증 신청 반려</p>
        <h1 className="mt-1 t-section text-ink">이번 신청은 승인되지 않았어요</h1>
        <p className="mt-2 t-sub text-text-2">
          {submitted} 접수 · {application.expertType ?? application.specialty}
        </p>
        {application.reviewNote && (
          <div className="mt-3 rounded-[10px] bg-bg px-4 py-3 t-sub text-text-1">
            <span className="font-bold text-ink">반려 사유</span> — {application.reviewNote}
          </div>
        )}
        <p className="mt-3 t-sub text-text-3">
          사유를 보완해 같은 유형으로 다시 신청할 수 있어요. 등록·자격번호와 증빙 링크를 다시 확인해 주세요.
        </p>
        <Link href="/town/experts#apply" className="btn-primary btn-md mt-4 inline-block no-underline">
          다시 신청하기
        </Link>
      </div>
    );
  }

  if (application.status === "approved") {
    return (
      <div className="card mx-auto mt-8 max-w-[560px] rounded-2xl px-5 py-7 text-center">
        <h1 className="t-section text-ink">인증은 승인됐는데 프로필을 아직 못 찾았어요</h1>
        <p className="mt-2 t-sub text-text-2">
          잠시 후 새로고침해 보시고, 계속 보이지 않으면 고객센터에 알려 주세요. 승인일:{" "}
          {application.reviewedAt ? new Date(application.reviewedAt).toLocaleDateString("ko-KR") : "-"}
        </p>
        <Link href="/support" className="btn-soft btn-md mt-4 inline-block no-underline">
          고객센터
        </Link>
      </div>
    );
  }

  return (
    <div className="card mx-auto mt-8 max-w-[560px] rounded-2xl px-5 py-7">
      <p className="t-caption font-bold text-primary">인증 심사 중</p>
      <h1 className="mt-1 t-section text-ink">신청서를 검토하고 있어요</h1>
      <p className="mt-2 t-sub text-text-2">
        {submitted} 접수 · {application.expertType ?? application.specialty}
        {application.regions[0] ? ` · ${application.regions[0]}` : ""}
      </p>
      <ol className="mt-4 flex flex-col gap-2">
        {EXPERT_VERIFICATION_PIPELINE.map((s, i) => {
          const done = i < stageIndex;
          const current = i === stageIndex;
          return (
            <li key={s.id} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full t-caption font-bold ${
                  done
                    ? "bg-brand-navy text-on-dark"
                    : current
                      ? "border-2 border-brand-navy text-brand-navy"
                      : "border border-line text-text-3"
                }`}
              >
                {done ? "✓" : s.step}
              </span>
              <div>
                <div className={`t-body font-bold ${current ? "text-ink" : "text-text-2"}`}>
                  {s.label}
                  {current && s.slaHours ? (
                    <span className="ml-1.5 t-caption font-bold text-text-3">목표 {s.slaHours}시간 안</span>
                  ) : null}
                </div>
                <p className="t-sub text-text-3">{s.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {reviewFlags.length > 0 && (
        <div className="mt-4 rounded-[10px] bg-warning-soft px-4 py-3">
          <p className="t-sub font-bold text-ink">자동 검증에서 확인이 필요한 항목</p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 t-sub text-text-2">
            {reviewFlags.map((f, i) => (
              <li key={`${f.ruleId}-${i}`}>{f.message}</li>
            ))}
          </ul>
          <p className="mt-1 t-caption text-text-3">운영자가 서류로 대신 확인합니다. 따로 하실 일은 없어요.</p>
        </div>
      )}
      <p className="mt-4 t-sub text-text-3">
        결과는 알림함으로 알려드려요. 승인되면 이 화면에서 프로필을 관리할 수 있어요.
      </p>
      <Link href="/notifications" className="btn-soft btn-md mt-3 inline-block no-underline">
        알림함 보기
      </Link>
    </div>
  );
}
