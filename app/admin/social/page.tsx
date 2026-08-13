import type { Metadata } from "next";
import { SocialPanel } from "./SocialPanel";

/**
 * /admin/social — 릴스·쇼츠 자동 업로드 큐 관리.
 *
 * 데이터·조작은 전부 클라이언트 패널이 관리자 API(/api/admin/social-uploads)와
 * 크론 라우트(관리자 세션 폴백 인가)를 통해 한다 — 이 페이지는 껍데기다.
 */
export const metadata: Metadata = { title: "소셜 업로드 · 누구집 Admin" };
export const dynamic = "force-dynamic";

export default function AdminSocialPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[19px] font-extrabold !text-white">소셜 · 릴스/쇼츠</h1>
        <p className="mt-1 text-[12px] text-[#9aa6b8]">
          임장노트·홍보 영상을 자동 생성해 인스타 릴스·유튜브 쇼츠로 발행하는 큐입니다.
          매일 11:00 소재 생성 · 15분마다 집행. 자격 증명 미설정 대상은 대기 상태로
          사유가 남고, 설정 즉시 이어서 발행됩니다.
        </p>
      </div>
      <SocialPanel />
    </div>
  );
}
