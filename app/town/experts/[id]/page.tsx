import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { JsonLd } from "@/app/components/JsonLd";
import { Icon } from "@/app/components/Icon";
import { getExpert, listExpertsAll } from "@/lib/experts/store-db";
import { listPublicReviews } from "@/lib/experts/reviews-store";
import { responseStats, responseTimeLabel } from "@/lib/experts/review-rules";
import { findExpertType, findSpecialty } from "@/lib/experts/taxonomy";
import { listConsultationsForExpert } from "@/lib/expert-consultations/store-db";
import { ConsultButton } from "../ConsultButton";
import { Stars } from "../ExpertCard";
import { QuoteRequestLink } from "../QuoteRequest";
import { seoAlternates } from "@/lib/seo/alternates";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";

/* 전문가 상세 (953 개편).
   공유·색인되는 유일한 전문가 주소. 인증 전문가만 index, 심사 중은 noindex.
   구조: 네이비 히어로(누구·자격·지역·인증) → 지표(완료 상담·응답·평점, 실측만) → CTA →
   소개 → 전문 분야(분류 체계 설명 포함) → 사무소·연락처(인증 전문가 본인이 채운 값만)
   → 요금 → 후기(expert_reviews) → 검증 정보 → 같은 자격의 다른 전문가.
   연락처는 목록 DTO 와 같은 원칙: 본인이 프로필 수정에서 채운 값만, 인증 전문가만. */

export const revalidate = 300;
export function generateStaticParams() {
  return [];
}

const BASE_URL = DEFAULT_DESKTOP_ORIGIN;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const e = await getExpert(id).catch(() => null);
  /* generateMetadata 에서 notFound() 를 던져야 HTTP 404 — 본문 notFound() 는 soft-404 */
  if (!e) notFound();
  const type = findExpertType(e.category)?.label ?? e.category;
  const title = `${e.name} ${type} — ${e.regions.slice(0, 2).join("·") || "전국"} 부동산 전문가 | 내집나우`;
  const description = (
    e.introduction?.trim() ||
    `${e.regions.join("·") || "전국"} 활동 ${type}. 내집나우에서 글로 상담을 신청하고 답변을 받을 수 있어요.`
  ).slice(0, 150);
  return {
    title,
    description,
    alternates: seoAlternates(`/town/experts/${e.id}`),
    robots: e.isVerified ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { title, description, url: `${BASE_URL}/town/experts/${e.id}`, siteName: "내집나우", locale: "ko_KR", type: "profile" },
  };
}

function feeLabel(v: number): string {
  return v > 0 ? `${v.toLocaleString("ko-KR")}원` : "—";
}

function dateLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function Section({ title, children, delay = 1 }: { title: string; children: React.ReactNode; delay?: number }) {
  return (
    <section className={`rise-in-${delay} card mt-3 flex flex-col gap-2.5 rounded-[18px] p-5 md:p-6`}>
      <h2 className="t-body font-extrabold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default async function ExpertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const e = await getExpert(id).catch(() => null);
  if (!e) notFound();

  const [consults, reviews, all] = await Promise.all([
    listConsultationsForExpert(e.id).catch(() => null),
    listPublicReviews(e.id, 20).catch(() => []),
    listExpertsAll().catch(() => ({ ok: false, items: [], truncated: false })),
  ]);
  const replied = consults ? consults.filter((c) => c.repliedAt).length : null;
  const stats = consults ? responseStats(consults) : null;
  const respLabel = responseTimeLabel(stats?.medianHours ?? null, e.responseTime);

  const type = findExpertType(e.category);
  const typeLabel = type?.label ?? e.category;
  const showContact = e.isVerified;
  const kakaoOk = showContact && e.contactKakao && /^https:\/\//i.test(e.contactKakao.trim());
  const specialties = e.specialties.filter(Boolean);

  /* 같은 자격·겹치는 지역의 인증 전문가 — 최대 3명 */
  const regionKeys = new Set(e.regions.map((r) => r.split(/[\s·]/)[0]).filter(Boolean));
  const similar = all.items
    .filter((x) => x.id !== e.id && x.isVerified)
    .map((x) => ({
      x,
      score:
        (findExpertType(x.category)?.id === type?.id ? 2 : 0) +
        (x.regions.some((r) => regionKeys.has(r.split(/[\s·]/)[0])) ? 1 : 0),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.x.consultations - a.x.consultations)
    .slice(0, 3)
    .map((s) => s.x);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": type?.id === "broker" ? "RealEstateAgent" : "Person",
    name: e.name,
    ...(type?.id === "broker" ? {} : { jobTitle: typeLabel }),
    description: e.introduction || undefined,
    areaServed: e.regions.length > 0 ? e.regions : undefined,
    url: `${BASE_URL}/town/experts/${e.id}`,
    ...(showContact && e.contactPhone ? { telephone: e.contactPhone } : {}),
    ...(e.organization ? { worksFor: { "@type": "Organization", name: e.organization } } : {}),
    ...(e.reviews > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: e.rating.toFixed(1),
            reviewCount: e.reviews,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  return (
    <PageShell breadcrumb={`동네이야기 › 전문가 › ${e.name}`}>
      {e.isVerified && <JsonLd data={jsonLd} />}

      <div className="mx-auto w-full max-w-[760px]">
        <div className="mb-3">
          <Link href="/town/experts" className="t-sub font-bold text-text-3 no-underline">
            ← 전문가 목록
          </Link>
        </div>

        {/* ---------- 히어로 (네이비) ---------- */}
        <section className="rise-in brand-navy-card flex flex-col gap-4 rounded-[18px] p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-hanji t-title text-brand-hanji-ink" aria-hidden="true">
              {Array.from(e.name.trim())[0] ?? "전"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="t-title text-on-dark">{e.name}</h1>
                {e.isVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-brand-hanji chip-pad t-caption font-extrabold text-brand-hanji-ink">
                    <Icon name="shield" size={11} /> 인증 전문가
                  </span>
                ) : (
                  <span className="rounded-md border border-on-dark-faint chip-pad t-caption font-semibold text-on-dark-muted">인증 심사 중</span>
                )}
              </div>
              <div className="mt-1 t-body text-on-dark">
                <b>{typeLabel}</b>
                {e.title && e.title !== typeLabel ? <span className="text-on-dark-muted"> · {e.title}</span> : null}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 t-sub text-on-dark-muted">
                {e.regions.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="pin" size={12} /> {e.regions.slice(0, 4).join(" · ")}
                  </span>
                )}
                {e.experience && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="briefcase" size={12} /> 경력 {e.experience}
                  </span>
                )}
                {e.organization && showContact && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="building" size={12} /> {e.organization}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 지표 — 실계산 값만 */}
          <div className="grid grid-cols-3 gap-2 border-t border-on-dark-faint pt-4">
            <div>
              <div className="t-section t-num text-on-dark">{replied !== null ? replied : "—"}</div>
              <div className="t-caption text-on-dark-muted">답변 완료 상담</div>
            </div>
            <div>
              <div className="t-section text-on-dark">{respLabel ?? "—"}</div>
              <div className="t-caption text-on-dark-muted">
                {stats?.responseRate != null ? `응답률 ${stats.responseRate}% (90일)` : "응답 안내"}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 t-section t-num text-on-dark">
                {e.reviews > 0 ? (
                  <>
                    <span className="text-brand-red-dark">★</span> {e.rating.toFixed(1)}
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div className="t-caption text-on-dark-muted">{e.reviews > 0 ? `후기 ${e.reviews}건` : "후기 아직 없음"}</div>
            </div>
          </div>

          {e.isVerified ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <ConsultButton expertId={e.id} expertName={e.name} className="btn-primary btn-cta flex-1 rounded-xl px-4 py-3 t-body" />
              <QuoteRequestLink className="brand-photo-chip flex-1 rounded-xl px-4 py-3 text-center t-body font-bold" />
            </div>
          ) : (
            <p className="rounded-xl bg-on-dark-faint px-4 py-3 t-sub text-on-dark">
              인증 심사 중인 프로필이에요. 상담 신청·연락처는 인증 완료 후 열려요.
            </p>
          )}
        </section>

        {/* ---------- 소개 ---------- */}
        {e.introduction?.trim() && (
          <Section title="소개" delay={1}>
            <p className="whitespace-pre-wrap t-body text-text-1">{e.introduction}</p>
          </Section>
        )}

        {/* ---------- 전문 분야 ---------- */}
        <Section title="전문 분야" delay={1}>
          {specialties.length > 0 ? (
            <div className="flex flex-col gap-2">
              {specialties.map((t) => {
                const sp = findSpecialty(t);
                return (
                  <div key={t} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="chip-tag px-2.5 py-1 t-sub font-bold">{t}</span>
                    {sp && <span className="t-sub text-text-3">{sp.desc}</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="t-sub text-text-3">
              {type ? `${type.label} — ${type.desc}` : "전문 분야를 아직 적지 않았어요."}
            </p>
          )}
          {type?.extraScope && e.isVerified && (
            <p className="t-caption text-text-3">이 자격의 추가 권한: {type.extraScope}</p>
          )}
        </Section>

        {/* ---------- 사무소 · 연락처 ---------- */}
        {showContact && (e.organization || e.brokerRegistrationNo || e.contactPhone || kakaoOk) && (
          <Section title="사무소 · 연락처" delay={2}>
            <div className="flex flex-col gap-2 t-body">
              {e.organization && (
                <div className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-text-3">상호</span>
                  <span className="min-w-0 truncate font-bold text-ink">{e.organization}</span>
                </div>
              )}
              {e.brokerRegistrationNo && (
                <div className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-text-3">등록번호</span>
                  <span className="min-w-0 truncate t-num font-bold text-ink">{e.brokerRegistrationNo}</span>
                </div>
              )}
              {e.contactPhone && (
                <div className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-text-3">전화</span>
                  <a href={`tel:${e.contactPhone.replace(/[^0-9+]/g, "")}`} className="font-extrabold text-primary no-underline">
                    {e.contactPhone}
                  </a>
                </div>
              )}
              {kakaoOk && (
                <div className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-text-3">카카오톡</span>
                  <a href={e.contactKakao!.trim()} target="_blank" rel="noopener noreferrer" className="font-extrabold text-primary no-underline">
                    채널 열기 ↗
                  </a>
                </div>
              )}
            </div>
            <p className="t-caption text-text-3">전문가가 직접 공개한 값이에요. 플랫폼 밖 선결제 유도는 신고 대상입니다.</p>
          </Section>
        )}

        {/* ---------- 요금 ---------- */}
        {(e.consultationFee > 0 || e.reportFee > 0) && (
          <Section title="이용 요금 안내" delay={2}>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-bg px-4 py-3">
                <div className="t-caption text-text-3">상담료</div>
                <div className="t-section t-num text-ink">{feeLabel(e.consultationFee)}</div>
              </div>
              <div className="rounded-xl bg-bg px-4 py-3">
                <div className="t-caption text-text-3">리포트료</div>
                <div className="t-section t-num text-ink">{feeLabel(e.reportFee)}</div>
              </div>
            </div>
            <p className="t-caption text-text-3">전문가가 적은 안내 금액이에요. 결제·정산은 별도 안내 전까지 플랫폼에서 처리하지 않습니다.</p>
          </Section>
        )}

        {/* ---------- 후기 ---------- */}
        <Section title={e.reviews > 0 ? `후기 ${e.reviews}건` : "후기"} delay={2}>
          {reviews.length === 0 ? (
            <p className="t-sub text-text-3">
              아직 후기가 없어요. 후기는 답변이 완료된 상담의 의뢰자만 남길 수 있어요 — 첫 상담을 신청해 보세요.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {reviews.map((r) => (
                <div key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={r.rating} size={13} />
                    <span className="t-sub font-bold text-ink">{r.reviewerLabel}</span>
                    <span className="ml-auto t-caption text-text-3">{dateLabel(r.createdAt)}</span>
                  </div>
                  {r.comment && <p className="t-body text-text-2">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ---------- 검증 정보 ---------- */}
        {e.isVerified && (
          <Section title="검증 정보" delay={3}>
            <div className="flex flex-col gap-1.5 t-sub text-text-2">
              <div className="flex items-start gap-2">
                <Icon name="check" size={14} className="mt-0.5 shrink-0 text-success" />
                <span>
                  자격 서류·신원 확인 후 내집나우가 승인
                  {e.verificationCheckedAt ? ` (${dateLabel(e.verificationCheckedAt)})` : ""}
                </span>
              </div>
              {type?.source && (
                <div className="flex items-start gap-2">
                  <Icon name="check" size={14} className="mt-0.5 shrink-0 text-success" />
                  <span>
                    {type.source.label}에서 등록 상태 확인 —{" "}
                    <a href={type.source.verificationUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-primary">
                      직접 조회 ↗
                    </a>
                    <span className="text-text-3"> ({type.source.searchHint})</span>
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Icon name="check" size={14} className="mt-0.5 shrink-0 text-success" />
                <span>연락처·계좌 교환과 플랫폼 밖 결제 유도는 자동 차단·신고 대상 (운영정책 §5)</span>
              </div>
            </div>
            <Link href="/legal/expert" className="self-start t-sub font-bold text-primary no-underline">
              전문가 운영정책 보기 ›
            </Link>
          </Section>
        )}

        {/* ---------- 같은 자격의 다른 전문가 ---------- */}
        {similar.length > 0 && (
          <Section title="함께 볼 만한 전문가" delay={3}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {similar.map((x) => (
                <Link key={x.id} href={`/town/experts/${x.id}`} className="tile flex flex-col gap-0.5 rounded-xl border border-line bg-bg px-3.5 py-3 no-underline">
                  <span className="t-body font-extrabold text-ink">{x.name}</span>
                  <span className="t-caption text-text-2">
                    {findExpertType(x.category)?.label ?? x.category} · {x.regions.slice(0, 2).join("·") || "전국"}
                  </span>
                  <span className="t-caption text-text-3">
                    {x.reviews > 0 ? `★ ${x.rating.toFixed(1)} (${x.reviews}) · ` : ""}상담 완료 {x.consultations}
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <p className="mt-4 text-center t-caption text-text-3">
          상담 답변은 전문가 개인의 의견이며 내집나우는 상담 당사자가 아니에요. 개인정보(전화번호·계좌)는 남기지 마세요.
        </p>
      </div>
    </PageShell>
  );
}
