import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { ExpertCard, type ExpertCardData } from "./ExpertCard";
import { ExpertApplyCta } from "./ExpertApplyCta";
import { QuoteRequestBanner } from "./QuoteRequest";
import { listExperts, type UserExpertProfile } from "@/lib/experts/store-db";
import { EXPERT_SUBCATEGORIES, findSub, matchSubcategory } from "@/lib/subcategories";
import { Icon } from "@/app/components/Icon";

/* 시안 6p(전문가 상담) 고도화 — expert_profiles 실데이터 연동.
   인증(is_verified) 전문가만 실제 상담 가능 · 지역·분야 필터 + 평점/상담수 정렬.
   실데이터 0건이면 "예시" 라벨 목업(비활성) 폴백. 전문가 인증 신청 플로우 강화. */

export const dynamic = "force-dynamic";

type Params = Promise<{ sub?: string; region?: string; sort?: string }>;

/* ---------- 목업 폴백 (실데이터 0건일 때만, 예시·비활성) ---------- */

const FALLBACK_EXPERTS: ExpertCardData[] = [
  {
    id: null,
    name: "김OO",
    title: "공인중개사",
    initial: "김",
    regionLine: "안양 관양동 · 경력 12년",
    regions: ["안양 관양동"],
    tags: ["재건축", "1기 신도시"],
    ratingLabel: "★ 4.9",
    reviews: 128,
    consultations: 342,
    responseLabel: "2h",
    introduction: "관양동 일대 재건축·갈아타기 상담을 12년간 진행했습니다.",
    consultFeeLabel: "30,000원",
    reportFeeLabel: "9,900원",
    verified: false,
    actionable: false,
    pendingLabel: "예시",
  },
];

/* ---------- 헬퍼 ---------- */

function fee(n: number): string {
  if (n <= 0) return "—";
  if (n >= 10000 && n % 10000 === 0) return `${n / 10000}만원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0]! : "전";
}

function regionKeyOf(region: string): string {
  return region.split(/[\s·]/)[0] || region;
}

function toCard(e: UserExpertProfile): ExpertCardData {
  return {
    id: e.id,
    name: e.name,
    title: e.title,
    initial: initialOf(e.name),
    regionLine: [e.regions.slice(0, 2).join("·") || "전국", e.experience ? `경력 ${e.experience}` : null]
      .filter(Boolean)
      .join(" · "),
    regions: e.regions,
    tags: (e.specialties.length > 0 ? e.specialties : [e.category]).filter(Boolean).slice(0, 4),
    ratingLabel: `★ ${e.rating.toFixed(1)}`,
    reviews: e.reviews,
    consultations: e.consultations,
    responseLabel: e.responseTime
      ? e.responseTime
      : e.responseRate > 0
        ? `${e.responseRate}%`
        : "—",
    introduction: e.introduction,
    consultFeeLabel: fee(e.consultationFee),
    reportFeeLabel: fee(e.reportFee),
    verified: e.isVerified,
    actionable: e.isVerified,
    pendingLabel: e.isVerified ? null : "인증 심사 중",
  };
}

/* ---------- 페이지 ---------- */

export default async function TownExpertsPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const sub = findSub(EXPERT_SUBCATEGORIES, sp.sub);
  const region = sp.region ?? "all";
  const sort = sp.sort ?? "rating";

  let realExperts: UserExpertProfile[] = [];
  try {
    realExperts = await listExperts();
  } catch {
    realExperts = [];
  }
  const usingReal = realExperts.length > 0;

  /* 지역 칩 — 실데이터에서 도출 */
  const regionKeys = [
    ...new Set(realExperts.flatMap((e) => e.regions).map(regionKeyOf).filter(Boolean)),
  ].slice(0, 6);

  let cards: ExpertCardData[];
  if (usingReal) {
    let list = realExperts;
    if (sub.id !== "all") {
      list = list.filter((e) => matchSubcategory(sub, [e.category, e.title, ...e.specialties]));
    }
    if (region !== "all") {
      list = list.filter((e) => e.regions.some((r) => regionKeyOf(r) === region));
    }
    list = [...list].sort((a, b) => {
      // 인증 우선 노출 후, 정렬 기준 적용
      if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
      return sort === "consult" ? b.consultations - a.consultations : b.rating - a.rating;
    });
    cards = list.map(toCard);
  } else {
    cards = FALLBACK_EXPERTS;
  }

  const verifiedCount = cards.filter((c) => c.verified).length;

  const subChips = EXPERT_SUBCATEGORIES.slice(0, 6);
  const sortChips = [
    { id: "rating", label: "평점순" },
    { id: "consult", label: "상담수순" },
  ];

  function qs(patch: Record<string, string | undefined>) {
    const merged = { sub: sub.id, region, sort, ...patch };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all" && !(k === "sort" && v === "rating")) usp.set(k, v);
    const s = usp.toString();
    return s ? `/town/experts?${s}` : "/town/experts";
  }

  return (
    <PageShell breadcrumb="동네이야기 › 전문가">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="rise-in text-[26px] font-extrabold text-ink">검증된 전문가</h1>
          <p className="mt-1.5 text-sm text-text-2">
            자격 검증 완료{usingReal ? ` · 인증 전문가 ${verifiedCount}명` : ""} · 내 임장노트를
            첨부해 바로 질문하세요
          </p>
        </div>
        <ExpertApplyCta />
      </div>

      {/* 분야 필터 */}
      <div className="mb-2 flex gap-1.5 overflow-x-auto text-[13px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {subChips.map((c) => (
          <Link
            key={c.id}
            href={qs({ sub: c.id })}
            className={`chip shrink-0 px-3.5 py-2 ${
              sub.id === c.id ? "chip-active" : "bg-[rgba(255,255,255,.7)] text-text-2"
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {/* 지역 + 정렬 필터 */}
      {usingReal && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px]">
          <Link
            href={qs({ region: "all" })}
            className={`chip px-3 py-1.5 ${region === "all" ? "chip-active" : "border border-line bg-surface text-text-2"}`}
          >
            전체 지역
          </Link>
          {regionKeys.map((r) => (
            <Link
              key={r}
              href={qs({ region: r })}
              className={`chip px-3 py-1.5 ${region === r ? "chip-active" : "border border-line bg-surface text-text-2"}`}
            >
              {r}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          {sortChips.map((c) => (
            <Link
              key={c.id}
              href={qs({ sort: c.id })}
              className={`chip px-3 py-1.5 ${sort === c.id ? "chip-active" : "border border-line bg-surface text-text-2"}`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}

      {/* 견적 요청 플로우 (숨고 벤치마크 A4) — market_requests 실저장 */}
      <QuoteRequestBanner />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((e, i) => (
          <ExpertCard key={e.id ?? `${e.name}-${i}`} e={e} index={i} />
        ))}

        {cards.length === 0 && (
          <div className="card col-span-full rounded-[20px] px-6 py-10 text-center text-sm text-text-3">
            {sub.label} 분야 전문가가 아직 없어요.{" "}
            <Link href="/town/experts" className="font-semibold text-primary no-underline">
              필터를 초기화
            </Link>
            해 보세요.
          </div>
        )}

        {/* 전문가 등록/인증 신청 CTA */}
        <div className="rise-in-3 flex flex-col items-center justify-center gap-2.5 rounded-[20px] border-[1.5px] border-dashed border-[#a9bde8] bg-[rgba(29,79,216,.06)] p-[22px] text-center">
          <div className="text-2xl"><Icon name="🛡" size={24} /></div>
          <div className="text-[15px] font-extrabold text-primary">전문가이신가요?</div>
          <p className="text-[13px] leading-[1.6] text-[#5b74b8]">
            자격 인증 후 상담·리포트 수익과
            <br />내 매물 등록·크리에이터 활동이 열려요
          </p>
          <ExpertApplyCta />
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] leading-[1.6] text-text-3">
        상담·견적 요청은 로그인 후 이용할 수 있어요 · 개인정보(전화번호·계좌)는 남기지 마세요 ·
        플랫폼 밖 결제 유도는 신고 대상입니다
      </p>
    </PageShell>
  );
}
