import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { JsonLd } from "@/app/components/JsonLd";
import { getExpert } from "@/lib/experts/store-db";
import { listConsultationsForExpert } from "@/lib/expert-consultations/store-db";
import { ConsultButton } from "../ConsultButton";
import { seoAlternates } from "@/lib/seo/alternates";

/* 전문가 상세 페이지 — 실사 갭 #1 해소.
   지금까지 전문가 프로필은 목록 페이지의 **모달**에만 있어서 공유할 URL 도,
   색인될 표면도 없었다(견적 제안 알림이 딥링크할 곳도 없었다). 이 페이지가
   그 주소다. 인증 전문가만 색인(index)하고, 미인증은 noindex — 심사 중 프로필을
   검색에 실어 나르지 않는다. 연락처는 본인이 프로필 수정에서 채운 값만,
   인증 전문가에 한해 표시한다(목록 DTO 와 같은 원칙). */

/* 비용(2026-08-22): force-dynamic 이라 크롤·방문마다 오리진 함수가 돌았다.
   이 렌더에 사용자별 상태가 없다(auth·cookies 0건) — 목록(ISR 300)과 같은
   주기의 ISR 로 전환. 상담 신청 버튼은 클라이언트라 캐시와 무관하다. */
export const revalidate = 300;
// 동적 세그먼트는 이게 없으면 "요청마다 서버 렌더"로 분류된다(/town/news/[id] 실측)
export function generateStaticParams() {
  return [];
}

const BASE_URL = "https://nuguzip.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const e = await getExpert(id).catch(() => null);
  /* 여기서 notFound() 를 던져야 HTTP 404 가 된다. 메타데이터를 반환하면 Next 가
     200 으로 스트리밍을 시작한 뒤 본문 notFound() 는 UI 만 바꾼다(soft-404) —
     실측: 없는 id 가 200 + "찾을 수 없습니다" 본문으로 나갔다. */
  if (!e) notFound();
  const title = `${e.name} ${e.title || e.category} — 부동산 전문가 | 내집나우`;
  const description = (
    e.introduction?.trim() ||
    `${e.regions.join("·") || "전국"} 활동 ${e.category} 전문가. 내집나우에서 상담을 신청할 수 있어요.`
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

export default async function ExpertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const e = await getExpert(id).catch(() => null);
  if (!e) notFound();

  /* 상담 완료 수 — 프로필 컬럼(consultations)은 항상 0 인 죽은 값이라(원장에서
     재계산하는 목록과 동일하게) 실제 답변된 상담을 센다. 실패해도 페이지는 산다. */
  const replied = await listConsultationsForExpert(e.id)
    .then((rows) => rows.filter((c) => c.repliedAt).length)
    .catch(() => null);

  const showContact = e.isVerified;
  const kakaoOk = showContact && e.contactKakao && /^https:\/\//i.test(e.contactKakao.trim());

  return (
    <PageShell breadcrumb={`동네이야기 › 전문가 › ${e.name}`}>
      {e.isVerified && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "RealEstateAgent",
            name: e.name,
            description: e.introduction || undefined,
            areaServed: e.regions.length > 0 ? e.regions : undefined,
            url: `${BASE_URL}/town/experts/${e.id}`,
            ...(showContact && e.contactPhone ? { telephone: e.contactPhone } : {}),
            ...(e.organization ? { worksFor: { "@type": "Organization", name: e.organization } } : {}),
          }}
        />
      )}

      <div className="mx-auto w-full max-w-[720px]">
        <div className="mb-3">
          <Link href="/town/experts" className="text-[12px] font-bold text-text-3 no-underline">
            ← 전문가 목록
          </Link>
        </div>

        {/* 헤더 */}
        <div className="rise-in card flex flex-col gap-4 rounded-[20px] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-line to-bg text-[20px] font-extrabold text-primary">
              {e.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[20px] font-extrabold text-ink">{e.name}</h1>
                {e.isVerified ? (
                  <span className="rounded-[6px] bg-primary-soft px-2 py-0.5 text-[11px] font-extrabold text-primary">
                    ✓ 인증 전문가
                  </span>
                ) : (
                  <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold text-text-3">
                    인증 심사 중
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[13px] text-text-2">
                {e.title || e.category}
                {e.regions.length > 0 ? ` · ${e.regions.slice(0, 3).join("·")}` : ""}
                {e.experience ? ` · 경력 ${e.experience}` : ""}
              </div>
            </div>
          </div>

          {/* 지표 — 실계산 값만 (죽은 컬럼·지어낸 평점 미표기) */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-bg p-3 text-center">
              <div className="text-[16px] font-extrabold text-ink">
                {replied !== null ? replied : "—"}
              </div>
              <div className="text-[10px] text-text-3">상담 완료</div>
            </div>
            <div className="rounded-xl bg-bg p-3 text-center">
              <div className="text-[16px] font-extrabold text-ink">
                {e.responseTime?.trim() || "—"}
              </div>
              <div className="text-[10px] text-text-3">응답 안내</div>
            </div>
            <div className="rounded-xl bg-bg p-3 text-center">
              <div className="text-[16px] font-extrabold text-ink">
                {e.reviews > 0 ? `★ ${e.rating.toFixed(1)}` : "—"}
              </div>
              <div className="text-[10px] text-text-3">
                {e.reviews > 0 ? `후기 ${e.reviews}건` : "평가 없음"}
              </div>
            </div>
          </div>

          {e.isVerified && <ConsultButton expertId={e.id} expertName={e.name} className="btn-primary rounded-xl p-3 text-[14px]" />}
        </div>

        {/* 소개 */}
        {e.introduction?.trim() && (
          <div className="rise-in-1 card mt-3 flex flex-col gap-2 rounded-[20px] p-6">
            <h2 className="text-[14px] font-extrabold text-ink">소개</h2>
            <p className="whitespace-pre-wrap text-[13.5px] leading-[1.75] text-text-1">
              {e.introduction}
            </p>
          </div>
        )}

        {/* 전문 분야 */}
        {(e.specialties.length > 0 || e.category) && (
          <div className="rise-in-1 card mt-3 flex flex-col gap-2.5 rounded-[20px] p-6">
            <h2 className="text-[14px] font-extrabold text-ink">전문 분야</h2>
            <div className="flex flex-wrap gap-1.5">
              {(e.specialties.length > 0 ? e.specialties : [e.category]).filter(Boolean).map((t) => (
                <span key={t} className="rounded-full bg-bg px-3 py-1.5 text-[12px] font-semibold text-text-2">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 상호·연락처·등록번호 — 인증 전문가가 직접 공개한 값만 */}
        {showContact && (e.organization || e.brokerRegistrationNo || e.contactPhone || kakaoOk) && (
          <div className="rise-in-2 card mt-3 flex flex-col gap-2 rounded-[20px] p-6">
            <h2 className="text-[14px] font-extrabold text-ink">사무소 · 연락처</h2>
            <div className="flex flex-col gap-2 text-[13px]">
              {e.organization && (
                <div className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-text-3">상호</span>
                  <span className="min-w-0 truncate font-bold text-ink">{e.organization}</span>
                </div>
              )}
              {e.brokerRegistrationNo && (
                <div className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-text-3">등록번호</span>
                  <span className="min-w-0 truncate font-bold text-ink">{e.brokerRegistrationNo}</span>
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
            <p className="text-[10px] leading-[1.6] text-text-3">
              플랫폼 밖 선결제 유도는 신고 대상이에요.
            </p>
          </div>
        )}

        {/* 상담료 */}
        {(e.consultationFee > 0 || e.reportFee > 0) && (
          <div className="rise-in-2 card mt-3 flex flex-col gap-2 rounded-[20px] p-6">
            <h2 className="text-[14px] font-extrabold text-ink">이용 요금</h2>
            <div className="flex items-center justify-between rounded-xl bg-bg px-4 py-3 text-[13px]">
              <span className="font-bold text-ink">상담료</span>
              <span className="font-extrabold text-ink">{feeLabel(e.consultationFee)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-bg px-4 py-3 text-[13px]">
              <span className="font-bold text-ink">리포트료</span>
              <span className="font-extrabold text-ink">{feeLabel(e.reportFee)}</span>
            </div>
          </div>
        )}

        {!e.isVerified && (
          <p className="mt-4 text-center text-[12px] leading-[1.6] text-text-3">
            인증 심사 중인 프로필이에요. 상담·연락처는 인증 완료 후 열려요.
          </p>
        )}
      </div>
    </PageShell>
  );
}
