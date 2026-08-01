import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { ExpertCard, type ExpertCardData } from "./ExpertCard";
import { ExpertApplyCta } from "./ExpertApplyCta";
import { QuoteRequestBanner } from "./QuoteRequest";
import { listExperts, type UserExpertProfile } from "@/lib/experts/store-db";
import { EXPERT_SUBCATEGORIES, findSub, matchSubcategory } from "@/lib/subcategories";
import { Icon } from "@/app/components/Icon";
import { TownCategoryNav } from "../TownCategoryNav";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 시안 6p(전문가 상담) 고도화 — expert_profiles 실데이터 연동.
   자료(#8) 섹션 포맷에 맞춰 재구성: 페이지 헤더 + 인증 안내 + 필터 칩 + 라벨 섹션(인증 전문가 / 그 외).
   인증(is_verified) 전문가만 실제 상담 가능 · 지역·분야 필터 + 평점/상담수 정렬.
   실데이터 0건이면 0건이라고 말한다(목업 폴백 없음 — 아래 주석 참고).
   조회 실패는 "없음"과 구분해 따로 그린다. 전문가 인증 신청 플로우 강화. */

export const dynamic = "force-dynamic";

/* N7 — ?sub=·?region=·?sort= 조합마다 색인되지 않도록 canonical 고정. */
export const metadata = buildPageMetadata({
  title: "전문가 상담 — 공인중개사·세무·법무",
  description:
    "부동산 관련 상담이 가능한 전문가를 분야·지역으로 찾습니다. 인증을 마친 전문가와 그 외를 구분해 표시합니다.",
  path: "/town/experts",
});

type Params = Promise<{ sub?: string; region?: string; sort?: string }>;

/* 예시 목업 폴백은 제거했다 — 임장 모임 목록(/town/groups)에서 같은 이유로 이미
   걷어낸 것과 같다. "김OO 공인중개사 · ★ 4.9 · 후기 128건 · 상담 342건 · 상담료
   30,000원" 처럼 구체적인 숫자가 박힌 카드는 구석에 "예시" 배지가 붙어 있어도
   진짜 전문가로 읽힌다. 그 네 숫자는 전부 지어낸 값이었고(전문가 후기 테이블은
   아직 없다), 요금은 특히 돈 문제라 예시로도 띄우면 안 된다.
   0명이면 0명이라고 말하고 인증 신청 CTA 를 보여 주는 편이 정직하다. */

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
    // 후기가 한 건도 없으면 평점을 숫자로 보여 주지 않는다. 예전에는 리뷰 0건인
    // 전문가도 "★ 0.0" 으로 찍혀서, 평가가 없는 것과 낮은 평가를 받은 것이
    // 구분되지 않았다(전문가 후기 테이블 자체가 아직 없어서 항상 0이다).
    ratingLabel: e.reviews > 0 ? `★ ${e.rating.toFixed(1)}` : "평가 없음",
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
  /* J8 — "평점순"을 없앴다. expert_profiles.rating 은 아무도 쓰지 않는 상수 0 컬럼이라
     그 정렬은 0끼리 비교하는, 아무 일도 하지 않는 정렬이었다. 전문가 후기 테이블이
     생기면 그때 다시 넣는다. 기본값은 최근 등록순. 옛 링크(?sort=rating)도 여기로 온다. */
  const sort = sp.sort === "consult" ? "consult" : "recent";

  /* 목록을 **못 읽은 것**과 전문가가 **없는 것**은 다른 사실이다. 예전에는 실패를
     빈 배열로 삼킨 뒤 목업 카드로 덮어서, 조회가 죽었을 때 화면에는 존재하지 않는
     전문가가 실적까지 달고 떠 있었다. 실패는 실패라고 그린다. */
  let realExperts: UserExpertProfile[] = [];
  let loadFailed = false;
  try {
    realExperts = await listExperts();
  } catch {
    loadFailed = true;
    realExperts = [];
  }
  const usingReal = realExperts.length > 0;

  /* 지역 칩 — 실데이터에서 도출 */
  const regionKeys = [
    ...new Set(realExperts.flatMap((e) => e.regions).map(regionKeyOf).filter(Boolean)),
  ].slice(0, 6);

  let cards: ExpertCardData[] = [];
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
      if (sort === "consult") return b.consultations - a.consultations;
      return b.createdAt.localeCompare(a.createdAt);
    });
    cards = list.map(toCard);
  }

  /* 자료 섹션 분류 — 인증 전문가 / 그 외 */
  const verifiedCards = cards.filter((c) => c.verified);
  const otherCards = cards.filter((c) => !c.verified);

  const subChips = EXPERT_SUBCATEGORIES.slice(0, 6);
  const sortChips = [
    { id: "recent", label: "최근 등록순" },
    { id: "consult", label: "상담 많은 순" },
  ];
  const filtersActive = sub.id !== "all" || region !== "all" || sort !== "recent";

  function qs(patch: Record<string, string | undefined>) {
    const merged = { sub: sub.id, region, sort, ...patch };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all" && !(k === "sort" && v === "recent")) usp.set(k, v);
    const s = usp.toString();
    return s ? `/town/experts?${s}` : "/town/experts";
  }

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

      {/* ---------- 필터 ---------- */}
      <div className="rise-in-1 mb-4 flex flex-col gap-2.5">
        {/* 분야 필터 */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 text-[13px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {subChips.map((c) => (
            <Link
              key={c.id}
              href={qs({ sub: c.id })}
              className={`chip press shrink-0 px-3.5 py-2 ${
                sub.id === c.id ? "chip-active" : "border border-line bg-surface text-text-2"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>

        {/* 지역 + 정렬 필터 */}
        {usingReal && (
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
            <Link
              href={qs({ region: "all" })}
              className={`chip press px-3 py-1.5 ${region === "all" ? "chip-active" : "border border-line bg-surface text-text-2"}`}
            >
              전체 지역
            </Link>
            {regionKeys.map((r) => (
              <Link
                key={r}
                href={qs({ region: r })}
                className={`chip press px-3 py-1.5 ${region === r ? "chip-active" : "border border-line bg-surface text-text-2"}`}
              >
                {r}
              </Link>
            ))}
            <span className="mx-1 h-4 w-px bg-line" />
            {sortChips.map((c) => (
              <Link
                key={c.id}
                href={qs({ sort: c.id })}
                className={`chip press px-3 py-1.5 ${sort === c.id ? "chip-active" : "border border-line bg-surface text-text-2"}`}
              >
                {c.label}
              </Link>
            ))}
            {filtersActive && (
              <Link
                href="/town/experts"
                className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-primary no-underline"
              >
                <Icon name="x" size={12} /> 필터 초기화
              </Link>
            )}
          </div>
        )}
      </div>

      {/* 견적 요청 플로우 (숨고 벤치마크 A4) — market_requests 실저장 */}
      <div className="mb-6">
        <QuoteRequestBanner />
      </div>

      {/* ---------- 섹션 ---------- */}
      {loadFailed ? (
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
      ) : cards.length === 0 ? (
        <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[18px] px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="search" size={22} />
          </div>
          <p className="text-sm font-bold text-ink">
            {sub.id === "all" && region === "all"
              ? "인증 전문가가 아직 없어요"
              : `${sub.label} 분야 전문가가 아직 없어요`}
          </p>
          <p className="max-w-xs text-xs leading-[1.6] text-text-3">
            {sub.id === "all" && region === "all"
              ? "베타 기간에는 공급이 적을 수 있어요. 전문가 인증이 끝나면 상담이 열려요. 그동안은 임장노트·지도로 판단을 이어가세요."
              : "다른 분야·지역을 보거나, 임장노트로 기록을 이어가세요."}
          </p>
          {filtersActive && (
            <Link href="/town/experts" className="btn-soft rounded-lg px-4 py-2 text-xs no-underline">
              필터 초기화
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* 인증 전문가 */}
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-extrabold text-ink">인증 전문가</h2>
              <span className="text-[12px] font-semibold text-text-3">
                {verifiedCards.length}명
              </span>
            </div>
            {verifiedCards.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {verifiedCards.map((e, i) => (
                  <ExpertCard key={e.id ?? `${e.name}-${i}`} e={e} index={i} />
                ))}
              </div>
            ) : (
              <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Icon name="shield" size={22} />
                </div>
                <div className="text-sm font-bold text-text-1">아직 인증된 전문가가 없어요</div>
                <div className="max-w-xs text-xs leading-[1.6] text-text-3">
                  인증 심사를 통과하면 상담 가능한 전문가로 노출돼요.
                </div>
              </div>
            )}
          </section>

          {/* 그 외 전문가 (인증 심사 중 · 예시) */}
          {otherCards.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-extrabold text-ink">그 외 전문가</h2>
                <span className="text-[12px] font-semibold text-text-3">{otherCards.length}명</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {otherCards.map((e, i) => (
                  <ExpertCard key={e.id ?? `${e.name}-${i}`} e={e} index={i} />
                ))}
              </div>
            </section>
          )}
        </>
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

      <p className="mt-4 text-center text-[11px] leading-[1.6] text-text-3">
        상담·견적 요청은 로그인 후 이용할 수 있어요 · 개인정보(전화번호·계좌)는 남기지 마세요 ·
        플랫폼 밖 결제 유도는 신고 대상입니다
      </p>
    </PageShell>
  );
}
