import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { ExpertApplyCta } from "./ExpertApplyCta";
import { QuoteRequestBanner } from "./QuoteRequest";
import { ExpertsClient, type ExpertPublicRow } from "./ExpertsClient";
import { listExpertsAll, type UserExpertProfile } from "@/lib/experts/store-db";
import { Icon } from "@/app/components/Icon";
import { TownCategoryNav } from "../TownCategoryNav";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";

/* 시안 6p(전문가 상담) 고도화 — expert_profiles 실데이터 연동.
   인증(is_verified) 전문가만 실제 상담 가능 · 지역·분야 필터 + 상담수/등록순 정렬.
   실데이터 0건이면 0건이라고 말한다(목업 폴백 없음). 조회 실패는 "없음"과 구분. */

/* ── ISR 전환 (사용량 절감 11차, 2026-08-10) ────────────────────────────────
   예전에는 force-dynamic + ?sub/?region/?sort 서버 필터였다. 로더는 원래도
   전량(상한 200)을 받아 메모리에서 걸렀으므로 — searchParams 읽기만이 라우트를
   영구 동적으로 만들고 있었다. 실측: expert_profiles 0행. 필터는 ExpertsClient 가
   마운트 후 location.search 로 처리하고 SSR 은 전량을 그대로 그린다.
   클라이언트에는 슬림 DTO(ExpertPublicRow)만 넘긴다 — 프로필의 ownerEmail·userId
   가 공개 ISR 캐시에 실리면 안 된다. */
export const revalidate = 300;

/* N7 — ?sub=·?region=·?sort= 조합마다 색인되지 않도록 canonical 고정. */
export const metadata = buildPageMetadata({
  title: "전문가 상담 — 공인중개사·세무·법무",
  description:
    "부동산 관련 상담이 가능한 전문가를 분야·지역으로 찾습니다. 인증을 마친 전문가와 그 외를 구분해 표시합니다.",
  path: "/town/experts",
});

/* 예시 목업 폴백은 제거했다 — "김OO 공인중개사 · ★ 4.9 · 후기 128건" 같은 지어낸
   숫자 카드는 "예시" 배지가 붙어도 진짜로 읽히고, 요금은 예시로도 띄우면 안 된다.
   0명이면 0명이라고 말하고 인증 신청 CTA 를 보여 주는 편이 정직하다. */

/** 공개 필드만 깎아 클라이언트로 — ownerEmail·userId·중개등록번호는 넘기지 않는다 */
function toPublicRow(e: UserExpertProfile): ExpertPublicRow {
  return {
    id: e.id,
    name: e.name,
    title: e.title,
    category: e.category,
    regions: e.regions,
    specialties: e.specialties,
    introduction: e.introduction,
    consultationFee: e.consultationFee,
    reportFee: e.reportFee,
    rating: e.rating,
    reviews: e.reviews,
    consultations: e.consultations,
    experience: e.experience,
    responseTime: e.responseTime,
    isVerified: e.isVerified,
    createdAt: e.createdAt,
  };
}

export default async function TownExpertsPage() {
  const loaded = await listExpertsAll();

  return (
    <PageShell breadcrumb="동네이야기 › 전문가">
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />
      {/* ---------- 페이지 헤더 ---------- */}
      <div className="rise-in mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink">전문가</h1>
          <p className="mt-1 text-[13px] leading-[1.6] text-text-2">
            검증 절차를 거치는 공인중개사·세무사·감정평가사에게 내 임장노트를 첨부해 바로 질문하세요
          </p>
        </div>
        <div className="shrink-0">
          <ExpertApplyCta />
        </div>
      </div>

      {/* 인증 안내 — 인증 전문가만 실제 상담 가능 */}
      <div className="rise-in-1 mb-4 flex items-center gap-2 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-2.5 text-[12px] leading-[1.6] text-[#5b74b8]">
        <Icon name="shield" size={15} className="shrink-0 text-primary" />
        <span>
          <b className="text-primary">인증</b> 배지가 있는 전문가만 실제 상담·견적 요청이 가능해요.
        </span>
      </div>

      {/* 견적 요청 플로우 (숨고 벤치마크 A4) — market_requests 실저장 */}
      <div className="mb-6">
        <QuoteRequestBanner />
      </div>

      {loaded.ok ? (
        <ExpertsClient items={loaded.items.map(toPublicRow)} truncated={loaded.truncated} />
      ) : (
        /* 조회 실패 — "전문가 없음"과 구별한다. 예전 로더는 error 를 [] 로 삼켜
           이 구별이 로더에서 죽어 있었다(listExpertsAll 이 ok 로 되살림). */
        <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[18px] px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
            <Icon name="warning" size={22} />
          </div>
          <p className="text-sm font-bold text-ink">전문가 목록을 불러오지 못했어요</p>
          <p className="max-w-xs text-xs leading-[1.6] text-text-3">
            등록된 전문가가 없는 게 아니라, 지금 목록을 읽지 못한 상태예요. 잠시 뒤
            새로고침해 주세요.
          </p>
          <Link href="/town/experts" className="btn-soft rounded-lg px-4 py-2 text-xs no-underline">
            다시 불러오기
          </Link>
        </div>
      )}

      {/* 전문가 등록/인증 신청 CTA */}
      <div className="rise-in-3 flex flex-col items-center justify-center gap-3 rounded-[20px] border-[1.5px] border-dashed border-[#a9bde8] bg-[rgba(29,79,216,.05)] p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="shield" size={24} />
        </div>
        <div className="text-[15px] font-extrabold text-primary">전문가이신가요?</div>
        <p className="text-[13px] leading-[1.6] text-[#5b74b8]">
          자격 인증 후 상담·리포트 수익과
          <br />내 매물 등록·크리에이터 활동이 열려요
        </p>
        <ExpertApplyCta />
        <p className="text-[11px] text-text-3">
          중개사무소 매물 노출·상담 연결 제휴는{" "}
          <Link href="/partners" className="font-bold text-primary underline underline-offset-2">
            중개사 제휴 안내
          </Link>
          에서 신청할 수 있어요.
        </p>
      </div>

      {/* 베타 공급 부족의 실제 대안 — 전문가가 없어도 판단은 이어져야 한다 */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="text-[11px] text-text-3">원하는 전문가가 없다면:</span>
        <Link href="/qna" className="press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline">
          이웃에게 묻기 (단지 Q&A)
        </Link>
        <Link href="/notes" className="press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline">
          실거주 기록 읽기 (임장노트)
        </Link>
      </div>

      <p className="mt-4 text-center text-[11px] leading-[1.6] text-text-3">
        상담·견적 요청은 로그인 후 이용할 수 있어요 · 개인정보(전화번호·계좌)는 남기지 마세요 ·
        플랫폼 밖 결제 유도는 신고 대상입니다
      </p>
      {/* 수익 문구 미기재 방침(소유자 방침 2026-08-11) — 유료 상담 표면 고지 */}
      <ComplianceNotice className="mt-3" />
    </PageShell>
  );
}
