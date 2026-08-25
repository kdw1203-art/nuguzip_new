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
  /* "법무"는 2026-08-12 카테고리 전면 제거(토스 정책: 법률 서비스 입점 불가)
     때 본문에서 빠졌는데 메타 제목에만 남아 있었다 — 심사 회신의 "전면 제거"
     주장과 사이트가 한 글자도 어긋나면 안 된다(2026-08-16 최종 점검에서 발견). */
  title: "전문가 상담 — 공인중개사·세무·감정평가",
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
    /* 상호·연락처·등록번호 — 인증 전문가만 공개(미인증은 null 로 눌러 노출 차단).
       연락처는 본인이 프로필 수정에서 채운 값만 존재한다(자동 공개 없음). */
    organization: e.isVerified ? (e.organization ?? null) : null,
    contactPhone: e.isVerified ? (e.contactPhone ?? null) : null,
    contactKakao: e.isVerified ? (e.contactKakao ?? null) : null,
    brokerRegistrationNo: e.isVerified ? (e.brokerRegistrationNo ?? null) : null,
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
          <h1 className="t-title text-ink">전문가</h1>
          <p className="mt-1 t-body text-text-2">
            검증 절차를 거치는 공인중개사·세무사·감정평가사에게 내 임장노트를 첨부해 바로 질문하세요
          </p>
        </div>
        <div className="shrink-0">
          <ExpertApplyCta />
        </div>
      </div>

      {/* 인증 안내 — 인증 전문가만 실제 상담 가능 */}
      <div className="rise-in-1 mb-4 flex items-center gap-2 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-2.5 t-sub text-[#5b74b8]">
        <Icon name="shield" size={15} className="shrink-0 text-primary" />
        <span>
          <b className="text-primary">인증</b> 배지가 있는 전문가만 실제 상담·견적 요청이 가능해요.
        </span>
      </div>

      {/* 업무 범위 안내 — 인증으로 열리는 기능. 예전엔 CTA·마이 카드·약관에 흩어져
          있어서 "인증하면 뭘 할 수 있는지"를 게이트에 부딪혀야만 알 수 있었다.
          공통 vs 중개사 전용을 한 곳에서 밝힌다(법무·변호사 유료 입점 불가 정책 유지). */}
      <details className="rise-in-1 card mb-4 rounded-2xl px-5 py-4">
        <summary className="cursor-pointer list-none t-body font-extrabold text-ink">
          전문가 인증으로 할 수 있는 일 <span className="font-semibold text-primary">펼치기 ›</span>
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-bg px-4 py-3">
            <div className="t-sub font-extrabold text-ink">모든 인증 전문가 공통</div>
            <ul className="mt-1.5 flex list-none flex-col gap-1 t-sub text-text-2">
              <li>· 프로필 노출 + 상담 신청 수신·답변 (답변은 신청자 알림으로 전달)</li>
              <li>· 소개·전문 분야·경력·상담료·연락처를 직접 관리 (마이 › 전문가 프로필)</li>
              <li>· 크리에이터 활동 — 임장 리포트 발행·판매</li>
            </ul>
          </div>
          <div className="rounded-xl bg-bg px-4 py-3">
            <div className="t-sub font-extrabold text-ink">공인중개사 추가 권한</div>
            <ul className="mt-1.5 flex list-none flex-col gap-1 t-sub text-text-2">
              <li>· 매물 등록·관리 + 받은 문의(리드) 확인</li>
              <li>· 매물 상단 노출 부스트 (포인트)</li>
              <li>· 상호·중개등록번호·전화가 프로필에 표시돼 신뢰를 높여요</li>
            </ul>
          </div>
        </div>
        <p className="mt-2.5 t-caption text-text-3">
          세무사·감정평가사·대출상담사도 인증 대상이에요 (법무 서비스는 정책상 유료 입점
          불가). 인증 절차·검증 기준은 <Link href="/legal/expert" className="font-bold text-primary">전문가 약관</Link>에서 확인할 수 있어요.
        </p>
      </details>

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
      <div className="flex flex-col items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-line-strong bg-primary-soft p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="shield" size={24} />
        </div>
        <div className="t-section text-primary">전문가이신가요?</div>
        <p className="t-body text-[#5b74b8]">
          자격 인증 후 상담·리포트 수익과
          <br />내 매물 등록·크리에이터 활동이 열려요
        </p>
        <ExpertApplyCta />
        <p className="t-sub text-text-3">
          중개사무소 매물 노출·상담 연결 제휴는{" "}
          <Link href="/partners" className="font-bold text-primary underline underline-offset-2">
            중개사 제휴 안내
          </Link>
          에서 신청할 수 있어요.
        </p>
      </div>

      {/* 베타 공급 부족의 실제 대안 — 전문가가 없어도 판단은 이어져야 한다 */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="t-sub text-text-3">원하는 전문가가 없다면:</span>
        <Link href="/qna" className="press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline">
          이웃에게 묻기 (단지 Q&A)
        </Link>
        <Link href="/notes" className="press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline">
          실거주 기록 읽기 (임장노트)
        </Link>
      </div>

      <p className="mt-4 text-center t-sub text-text-3">
        상담·견적 요청은 로그인 후 이용할 수 있어요 · 개인정보(전화번호·계좌)는 남기지 마세요 ·
        플랫폼 밖 결제 유도는 신고 대상입니다
      </p>
      {/* 수익 문구 미기재 방침(소유자 방침 2026-08-11) — 유료 상담 표면 고지 */}
      <ComplianceNotice className="mt-3" />
    </PageShell>
  );
}
