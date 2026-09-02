import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { getExpertByOwnerEmail } from "@/lib/experts/store-db";
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
    return (
      <PageShell breadcrumb="마이 › 전문가 프로필">
        <div className="card mx-auto mt-8 max-w-[560px] rounded-2xl px-5 py-8 text-center">
          <p className="t-section text-ink">
            아직 전문가 프로필이 없어요
          </p>
          <p className="mx-auto mt-1.5 max-w-[420px] t-sub text-text-3">
            전문가 인증을 신청하고 승인되면 프로필이 만들어져요. 인증 후 이
            화면에서 소개·전문 분야·상담료·연락처를 직접 관리할 수 있습니다.
          </p>
          <Link href="/town/experts" className="btn-primary btn-md mt-4 inline-block no-underline">
            전문가 인증 신청하기
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell breadcrumb="마이 › 전문가 프로필">
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-4">
          <h1 className="t-title text-ink">전문가 프로필 관리</h1>
          <p className="mt-1 t-sub text-text-3">
            여기서 저장한 내용이 전문가 목록·상세에 그대로 노출돼요.
            {expert.isVerified
              ? " 인증 전문가라 연락처를 공개하면 상담 신청자에게 표시됩니다."
              : " 인증 심사 중에는 연락처가 공개되지 않아요(승인 후 노출)."}
          </p>
        </div>
        <ExpertProfileForm
          expert={{
            id: expert.id,
            name: expert.name,
            title: expert.title,
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
