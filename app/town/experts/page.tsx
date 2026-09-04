import Link from "next/link";
import { CountUp } from "@/app/components/motion/CountUp";
import { PageShell } from "../../components/PageShell";
import { ExpertApplyCta } from "./ExpertApplyCta";
import { QuoteRequestBanner } from "./QuoteRequest";
import { ExpertsClient, type ExpertPublicRow } from "./ExpertsClient";
import { listExpertsAll, type UserExpertProfile } from "@/lib/experts/store-db";
import { EXPERT_TYPES } from "@/lib/experts/taxonomy";
import { EXPERT_FAQ } from "@/lib/experts/faq";
import { Icon } from "@/app/components/Icon";
import { BrandWatermark } from "@/app/components/BrandWatermark";
import { JsonLd } from "@/app/components/JsonLd";
import { faqJsonLd } from "@/lib/seo/jsonld";
import { TownCategoryNav } from "../TownCategoryNav";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";

/* 전문가 목록 (953 개편) — expert_profiles 실데이터.
   구조: 네이비 히어로(무엇을·왜 믿을지) → 필터·카드 → 견적 요청 → 인증 안내·신청
   → FAQ(JSON-LD 동일 배열) → 고지. 실데이터 0건이면 0건이라고 말한다(목업 폴백 없음). */

/* ── ISR (사용량 절감 11차, 2026-08-10) ── 필터는 클라이언트(location.search). */
export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "전문가 상담 — 공인중개사·세무사·감정평가사·대출상담사",
  description:
    "자격을 확인한 부동산 전문가에게 글로 묻고 답을 받습니다. 인증 배지, 답변 완료 수, 실제 의뢰자 후기로 고르고, 견적 요청으로 제안을 받아 비교하세요.",
  path: "/town/experts",
});

/** 공개 필드만 깎아 클라이언트로 — ownerEmail·userId 는 넘기지 않는다 */
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
    responseRate: e.responseRate,
    experience: e.experience,
    responseTime: e.responseTime,
    isVerified: e.isVerified,
    /* 상호·연락처·등록번호 — 인증 전문가만 공개(미인증은 null) */
    organization: e.isVerified ? (e.organization ?? null) : null,
    contactPhone: e.isVerified ? (e.contactPhone ?? null) : null,
    contactKakao: e.isVerified ? (e.contactKakao ?? null) : null,
    brokerRegistrationNo: e.isVerified ? (e.brokerRegistrationNo ?? null) : null,
    createdAt: e.createdAt,
  };
}

export default async function TownExpertsPage() {
  const loaded = await listExpertsAll();
  const verified = loaded.items.filter((e) => e.isVerified);
  const answered = loaded.items.reduce((n, e) => n + e.consultations, 0);
  const reviewed = loaded.items.filter((e) => e.reviews > 0);
  const avgRating =
    reviewed.length > 0
      ? reviewed.reduce((n, e) => n + e.rating * e.reviews, 0) / reviewed.reduce((n, e) => n + e.reviews, 0)
      : null;
  const typeCounts = EXPERT_TYPES.map((t) => ({
    ...t,
    count: verified.filter((e) => e.category === t.label || e.category.includes(t.label)).length,
  }));

  return (
    <PageShell breadcrumb="동네이야기 › 전문가">
      <JsonLd data={faqJsonLd(EXPERT_FAQ)} />
      <TownCategoryNav stick />

      {/* ---------- 히어로 (브랜드 네이비) ---------- */}
      <section className="rise-in brand-navy-card mb-5 overflow-hidden rounded-[18px] px-5 py-6 md:px-7 md:py-7">
        <BrandWatermark />
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[560px]">
            <div className="t-caption font-extrabold tracking-wider text-on-dark-muted">전문가 상담</div>
            <h1 className="mt-1 t-title text-on-dark">
              자격을 확인한 전문가에게, <span className="text-brand-red-dark">지금</span> 물어보기
            </h1>
            <p className="mt-2 t-body text-on-dark-muted">
              공인중개사·세무사·감정평가사·대출상담사·건축사. 임장노트 링크를 붙여 글로 묻고, 답변은 상담함으로 받아요.
              고르기 어려우면 견적 요청 하나로 인증 전문가의 제안을 비교하세요.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 t-sub text-on-dark-muted">
              <span className="inline-flex items-center gap-1">
                <Icon name="shield" size={13} className="text-on-dark" /> 서류·신원 확인 후 인증
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="star" size={13} className="text-brand-red-dark" /> 후기는 답변 완료 의뢰자만
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="lock" size={13} className="text-on-dark" /> 연락처·계좌 교환 차단
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2 md:flex-col md:items-end">
            <a href="#experts" className="btn-primary btn-cta rounded-xl px-5 py-2.5 t-body no-underline">
              전문가 보기
            </a>
            <Link href="/town/experts/join" className="brand-photo-chip rounded-xl px-5 py-2.5 t-body font-bold no-underline">
              전문가로 참여
            </Link>
          </div>
        </div>
        {/* 커버리지 — 실측만. 0 이면 0 */}
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-on-dark-faint pt-4">
          <div>
            <div className="t-section text-on-dark t-num">{loaded.ok ? <CountUp value={verified.length} /> : "—"}</div>
            <div className="t-caption text-on-dark-muted">인증 전문가</div>
          </div>
          <div>
            <div className="t-section text-on-dark t-num">{loaded.ok ? <CountUp value={answered} /> : "—"}</div>
            <div className="t-caption text-on-dark-muted">답변 완료 상담</div>
          </div>
          <div>
            <div className="t-section text-on-dark t-num">{avgRating !== null ? avgRating.toFixed(1) : "—"}</div>
            <div className="t-caption text-on-dark-muted">{avgRating !== null ? "평균 후기 평점" : "후기 아직 없음"}</div>
          </div>
        </div>
      </section>

      {/* ---------- 목록 ---------- */}
      <div id="experts" className="scroll-mt-24">
        {loaded.ok ? (
          <ExpertsClient items={loaded.items.map(toPublicRow)} truncated={loaded.truncated} />
        ) : (
          <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[18px] px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Icon name="warning" size={22} />
            </div>
            <p className="t-body font-bold text-ink">전문가 목록을 불러오지 못했어요</p>
            <p className="max-w-xs t-sub text-text-3">
              등록된 전문가가 없는 게 아니라, 지금 목록을 읽지 못한 상태예요. 잠시 뒤 새로고침해 주세요.
            </p>
            <Link href="/town/experts" className="btn-soft btn-sm no-underline">
              다시 불러오기
            </Link>
          </div>
        )}
      </div>

      {/* ---------- 견적 요청 ---------- */}
      <div className="mb-6">
        <QuoteRequestBanner />
      </div>

      {/* ---------- 자격별 안내 ---------- */}
      <section className="mb-6">
        <h2 className="mb-3 t-section text-ink">어떤 전문가에게 무엇을 물을까</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {typeCounts
            .filter((t) => t.id !== "other")
            .map((t) => (
              <Link
                key={t.id}
                href={`/town/experts?type=${t.id}`}
                className="card tile flex flex-col gap-1 rounded-2xl p-4 no-underline"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="t-body font-extrabold text-ink">{t.label}</span>
                  <span className="t-caption text-text-3">{t.count > 0 ? `인증 ${t.count}명` : "모집 중"}</span>
                </div>
                <span className="t-sub text-text-2">{t.desc}</span>
                {t.source && <span className="t-caption text-text-3">자격 확인 · {t.source.label}</span>}
              </Link>
            ))}
        </div>
      </section>

      {/* ---------- 전문가 참여 (한지 띠) ---------- */}
      <section id="apply" className="mb-6 scroll-mt-24 rounded-[18px] bg-brand-hanji px-5 py-6 md:px-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[560px]">
            <div className="t-caption font-extrabold tracking-wider text-brand-hanji-ink opacity-70">전문가이신가요?</div>
            <h2 className="mt-1 t-section text-brand-hanji-ink">자격 인증 후 상담을 받고, 견적 요청에 제안을 보내세요</h2>
            <ul className="mt-3 flex list-none flex-col gap-1 t-sub text-brand-hanji-ink">
              <li>· 프로필 노출 + 상담 신청 수신·답변 — 답변은 의뢰자 상담함과 알림으로 전달</li>
              <li>· 견적 요청 보드에 제안 보내기(요청당 1건) — 의뢰자가 제안을 비교해 프로필로 찾아옵니다</li>
              <li>· 소개·전문 분야·활동 지역·상담료·연락처를 직접 관리 (마이 › 전문가 프로필)</li>
              <li>· 답변 완료 상담의 의뢰자 후기가 프로필에 쌓입니다</li>
              <li>· 공인중개사: 매물 등록·관리 + 받은 문의(리드), 상호·등록번호 표시</li>
            </ul>
            <p className="mt-3 t-caption text-brand-hanji-ink opacity-80">
              인증 대상: {EXPERT_TYPES.filter((t) => t.id !== "other").map((t) => t.label).join("·")} 및 서류·인터뷰 심사를 거친 기타 전문가.
              법률 서비스는 정책상 유료 입점 불가. 절차·검증 기준은{" "}
              <Link href="/legal/expert" className="font-bold underline underline-offset-2">
                전문가 운영정책
              </Link>
              에서 확인할 수 있어요.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
            <ExpertApplyCta />
            <Link href="/town/experts/join" className="t-sub font-bold text-brand-hanji-ink underline underline-offset-2">
              참여 안내 자세히(절차·비용·FAQ) ›
            </Link>
            <Link href="/partners" className="t-sub font-bold text-brand-hanji-ink underline underline-offset-2">
              중개사무소 제휴 안내 ›
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- FAQ (JSON-LD 와 같은 배열) ---------- */}
      <section className="mb-6">
        <h2 className="mb-3 t-section text-ink">자주 묻는 질문</h2>
        <div className="card flex flex-col divide-y divide-line rounded-2xl px-5">
          {EXPERT_FAQ.map((f) => (
            <details key={f.q} className="group py-3.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 t-body font-bold text-ink">
                {f.q}
                <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 t-sub text-text-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 베타 공급 부족의 실제 대안 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="t-sub text-text-3">원하는 전문가가 없다면:</span>
        <Link href="/qna" className="press chip border border-line bg-surface px-3 py-1.5 t-sub text-text-2 no-underline">
          이웃에게 묻기 (단지 Q&A)
        </Link>
        <Link href="/notes" className="press chip border border-line bg-surface px-3 py-1.5 t-sub text-text-2 no-underline">
          실거주 기록 읽기 (임장노트)
        </Link>
        <Link href="/guides" className="press chip border border-line bg-surface px-3 py-1.5 t-sub text-text-2 no-underline">
          가이드 읽기
        </Link>
      </div>

      <p className="mt-4 text-center t-sub text-text-3">
        상담·견적 요청은 로그인 후 이용할 수 있어요 · 개인정보(전화번호·계좌)는 남기지 마세요 ·
        플랫폼 밖 결제 유도는 신고 대상입니다
      </p>
      <ComplianceNotice className="mt-3" />
    </PageShell>
  );
}
