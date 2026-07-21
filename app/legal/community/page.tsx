import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";

export const metadata: Metadata = {
  title: "커뮤니티 운영정책 | 우리동네이야기",
  description: "우리동네이야기 커뮤니티 이용 규칙, 금지 행위, 신고·제재 절차를 안내합니다.",
};

const LAST_UPDATED = "2026-04-30";

export default function CommunityPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl">
      {/* 페이지 전환 모션 일관화 — globals.css riseIn(dur-md) 재사용 */}
      <article className="rise-in">
        <h1 className="text-2xl font-bold text-ink">커뮤니티 운영정책</h1>
        <p className="mt-1 text-xs text-text-3">최종 업데이트: {LAST_UPDATED}</p>

        <p className="mt-4 text-sm leading-relaxed text-text-1">
          우리동네이야기(이하 &quot;서비스&quot;)는 부동산 정보와 동네 이야기를 건강하게 나누는
          공간을 만들기 위해 아래와 같은 커뮤니티 운영정책을 운영합니다.
          모든 회원은 이 정책을 숙지하고 준수해야 합니다.
        </p>

        {/* 1. 기본 원칙 */}
        <section className="card mt-6 p-5">
          <h2 className="text-base font-bold text-ink">1. 기본 원칙</h2>
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-text-1">
            <li><Icon name="✅" size={16} className="inline align-middle" /> 서로 존중하고 배려하는 언어를 사용합니다.</li>
            <li><Icon name="✅" size={16} className="inline align-middle" /> 부동산 실무 정보는 출처를 명시하고 정확하게 공유합니다.</li>
            <li><Icon name="✅" size={16} className="inline align-middle" /> 개인의 경험과 의견은 자유롭게 나눌 수 있으나, 타인을 비방하지 않습니다.</li>
            <li><Icon name="✅" size={16} className="inline align-middle" /> 저작권이 있는 자료는 허락 없이 무단 게재하지 않습니다.</li>
          </ul>
        </section>

        {/* 2. 금지 행위 */}
        <section className="mt-4 rounded-[16px] border border-danger/20 bg-danger-soft p-5">
          <h2 className="text-base font-bold text-ink">2. 금지 행위</h2>
          <p className="mt-1 text-xs text-text-3">
            아래 행위는 경고·일시 정지·영구 탈퇴 조치를 받을 수 있습니다.
          </p>
          <div className="mt-3 space-y-3 text-sm text-text-1">
            <div>
              <p className="flex items-center gap-1.5 font-semibold text-danger"><Icon name="🚫" size={16} />불법·유해 콘텐츠</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text-2">
                <li>허위 부동산 정보 유포 및 사기성 매물 광고</li>
                <li>음란·폭력적 표현, 혐오 발언</li>
                <li>불법 투자 권유 및 다단계·도박 홍보</li>
              </ul>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-semibold text-danger"><Icon name="🚫" size={16} />광고·스팸</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text-2">
                <li>무단 상업 광고, 홍보성 도배 게시물</li>
                <li>타 서비스 회원 유인 목적의 링크·연락처 대량 게시</li>
                <li>동일 내용 반복 게시(연속 3회 이상)</li>
              </ul>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-semibold text-danger"><Icon name="🚫" size={16} />개인정보 침해</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text-2">
                <li>타인의 실명·연락처·주소 등 개인정보 무단 게시</li>
                <li>회원 동의 없는 사진·영상 게재</li>
              </ul>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-semibold text-danger"><Icon name="🚫" size={16} />계정 악용</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text-2">
                <li>다중 계정 운영을 통한 커뮤니티 조작</li>
                <li>타인 계정 도용 또는 사칭</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 3. 신고 및 처리 절차 */}
        <section className="card mt-4 p-5">
          <h2 className="text-base font-bold text-ink">3. 신고 및 처리 절차</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-text-1">
            <li>
              <strong>신고:</strong> 게시물 우측 메뉴의 &quot;신고&quot; 버튼 또는{" "}
              <a
                href="mailto:report@nuguzip.com"
                className="font-medium text-primary hover:underline"
              >
                report@nuguzip.com
              </a>
              으로 접수할 수 있습니다.
            </li>
            <li>
              <strong>검토:</strong> 접수 후 영업일 기준 3일 이내 운영팀이 검토합니다.
            </li>
            <li>
              <strong>조치:</strong> 위반 정도에 따라 경고 → 일시정지(7~30일) → 영구 이용 제한
              순으로 조치합니다.
            </li>
            <li>
              <strong>이의 신청:</strong> 조치에 이의가 있는 경우{" "}
              <a
                href="mailto:support@nuguzip.com"
                className="font-medium text-primary hover:underline"
              >
                support@nuguzip.com
              </a>
              으로 7일 이내 이의 신청이 가능합니다.
            </li>
          </ol>
        </section>

        {/* 4. 게시물 관리 */}
        <section className="card mt-4 p-5">
          <h2 className="text-base font-bold text-ink">4. 게시물 및 댓글 관리</h2>
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-text-1">
            <li>운영자는 정책 위반 게시물을 사전 통보 없이 삭제할 수 있습니다.</li>
            <li>
              삭제된 게시물은 복구되지 않으며, 원작자에게 삭제 사유를 이메일로 안내합니다.
            </li>
            <li>서비스 종료 또는 계정 탈퇴 시 게시물은 이용약관에 따라 처리됩니다.</li>
            <li>
              금칙어가 포함된 게시물은 자동으로 검토 대기 상태가 되며, 운영팀이 확인 후
              공개 여부를 결정합니다.
            </li>
          </ul>
        </section>

        {/* 5. 전문가 인증 가이드 */}
        <section className="mt-4 rounded-[16px] border border-primary/20 bg-primary-soft p-5">
          <h2 className="text-base font-bold text-ink">5. 전문가 인증 가이드</h2>
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-text-1">
            <li>전문가 인증 신청은 마이페이지 → 전문가 등록에서 가능합니다.</li>
            <li>인증된 전문가는 ✓ 배지가 부여되며, 유료 상담 서비스를 제공할 수 있습니다.</li>
            <li>허위 자격 등록 시 인증이 취소되고 법적 책임이 발생할 수 있습니다.</li>
            <li>인증 심사는 서류 제출 후 영업일 기준 5일 이내 완료됩니다.</li>
          </ul>
        </section>

        {/* 6. 정책 변경 안내 */}
        <section className="mt-4 rounded-[16px] border border-line bg-bg p-5">
          <h2 className="text-base font-bold text-ink">6. 정책 변경 안내</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-1">
            본 정책은 서비스 운영 필요에 따라 변경될 수 있습니다. 중요한 변경 사항은
            서비스 내 공지 또는 가입 이메일을 통해 최소 7일 전에 공지합니다.
            변경 사항에 동의하지 않는 경우 서비스 탈퇴를 선택할 수 있습니다.
          </p>
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <a
            href="mailto:report@nuguzip.com?subject=%5B%EC%8B%A0%EA%B3%A0%5D%20%EC%BB%A4%EB%AE%A4%EB%8B%88%ED%8B%B0%20%EC%9A%B4%EC%98%81"
            className="inline-flex items-center justify-center rounded-[12px] bg-danger px-4 py-2.5 text-center text-sm font-bold text-white hover:opacity-90"
          >
            신고 메일 보내기 (report@nuguzip.com)
          </a>
          <div className="flex flex-wrap gap-3">
            <Link href="/legal" className="btn-secondary">
              ← 법적 고지 목록
            </Link>
            <Link href="/support" className="btn-primary">
              문의하기
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
}
