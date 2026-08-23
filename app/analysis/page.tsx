import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import {
  listNotes,
  listPublicNotes,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { HubComplexPicker } from "./hub-picker";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { loadHubTeasers } from "./hub-teasers";
import { AI_TOOL_IDS } from "@/lib/ai/ai-tools";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import {
  CompareTrayCount,
  LastToolChip,
  ToolLink,
} from "./tool-cards-client";

/** 공개 노트에서 AI(또는 규칙) 요약 문구가 있는 첫 건 — 게스트 미리보기용 */
function pickPublicAiPreview(notes: InspectionNote[]): {
  id: string;
  title: string;
  teaser: string;
  badge: string;
} | null {
  for (const n of notes) {
    const ai = n.aiAnalysis;
    if (!ai) continue;
    const teaser = [ai.narrativeSummary, ai.summary, ai.detailedConclusion].find(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    if (!teaser) continue;
    const engine = typeof ai.engine === "string" ? ai.engine : "";
    const badge = engine.startsWith("rule-based") ? "규칙 기반 분석" : "AI 생성";
    const title =
      n.aptName && !n.title.includes(n.aptName)
        ? `${n.aptName} — ${n.title}`
        : n.title;
    return {
      id: n.id,
      title,
      teaser: teaser.trim().slice(0, 160),
      badge,
    };
  }
  return null;
}

/* 설명문은 이 화면이 실제로 하는 일만 적는다. 아래 TOOLS 의 sim:true 항목은
   아직 실연동이 아니므로 "시뮬레이션" 이라는 사실을 description 에도 남긴다 —
   검색 결과만 보고 실측 분석을 기대하고 들어오면 그게 곧 거짓말이 된다. */
export const metadata = buildPageMetadata({
  title: "분석 도구",
  description:
    "임장노트 점수화, 후보 단지 비교, 금리·시세 시나리오를 한곳에서. 실연동 전 도구는 '시뮬레이션'으로 따로 표시합니다.",
  path: "/analysis",
});

/* P1-10·P1-12: 가짜 개인화 foot 문구 제거(정적 설명으로 교체),
   실연동 전 도구에는 "시뮬레이션" 칩을 붙여 오해 방지.
   #411 고도화: 실데이터 도구 우선 정렬 + 카드별 실측 티저(hub-teasers). */
const TOOLS = [
  {
    href: "/notes",
    icon: "📝",
    title: "임장노트 분석",
    desc: "기록을 점수화하고 장단점·체크 제안을 정리",
    foot: "내 노트에서 분석 시작 ›",
    sim: false,
  },
  {
    href: "/analysis/price",
    icon: "📈",
    title: "면적대별 실거래 시세",
    desc: "지역·면적대별 평단가·중앙값과 지역 분위, 면적 프리미엄을 실거래로 분석",
    foot: "면적대별 시세 보기 ›",
    sim: false,
  },
  {
    href: "/analysis/timing",
    icon: "⏱",
    title: "시세·타이밍 분석",
    desc: "실제 12개월 지수 추세·모멘텀으로 매수 타이밍 신호 판단",
    foot: "지역 추세 확인하기 ›",
    sim: false,
  },
  {
    href: "/analysis/temperature",
    icon: "🌡",
    title: "지역별 시장 온도 주간 기록",
    desc: "매주 남긴 온도 기록으로 지금 값이 아니라 추세를 확인",
    foot: "주간 기록 보기 ›",
    sim: false,
  },
  {
    href: "/analysis/gap",
    icon: "🧮",
    title: "전세가율·갭 스크리너",
    desc: "전국 시군구 전세가율 랭킹과 평균 매매가 기준 추정 갭 — 공표 통계 기반",
    foot: "지역 랭킹 보기 ›",
    sim: false,
  },
  {
    href: "/analysis/compare",
    icon: "⚖️",
    title: "후보 단지 비교",
    desc: "같은 기준으로 항목·재무를 나란히 비교",
    foot: "비교 트레이 열기 ›",
    sim: false,
  },
  {
    href: "/analysis/scenario",
    icon: "📊",
    title: "시장·대출 시나리오",
    desc: "지역 시세가 있을 때 금리·시세 스트레스 테스트 · 기준가 없으면 예시 계산",
    foot: "시나리오 열어보기 ›",
    sim: true,
  },
  {
    href: "/analysis/portfolio",
    icon: "💼",
    title: "포트폴리오 분석",
    desc: "보유·후보 자산의 구성과 갈아타기 시뮬레이션",
    foot: "예시 리포트 살펴보기 ›",
    sim: true,
  },
] as const;

const QUICK = [
  { href: "/analysis/cycle", label: "시세 사이클 (시뮬레이션)" },
  /* /analysis/price 는 데모 수치 중심 — 빠른 링크에서 내려 오인 유입을 줄인다 */
  { href: "/analysis/switch", label: "갈아타기 추천 (시뮬레이션)" },
] as const;

export const dynamic = "force-dynamic";

export default async function AnalysisHubPage({
  searchParams,
}: {
  searchParams: Promise<{ noteId?: string; complexId?: string; apt?: string }>;
}) {
  const { noteId, complexId, apt } = await searchParams;

  /* #411 — 카드별 실측 티저 (실패/없음이면 해당 줄이 빠질 뿐, 허브는 뜬다) */
  const teasers = await loadHubTeasers().catch(() => ({
    timing: null,
    temp: null,
    price: null,
    baseRate: null,
  }));

  // 로그인 시 실데이터(내 노트 수)로 시작 섹션 구성 — 허위 수치 없음
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  let myNoteCount: number | null = null;
  if (email) {
    try {
      myNoteCount = (await listNotes(email)).length;
    } catch {
      myNoteCount = null; // 집계 실패 시 수치 미표기 (가짜 숫자 금지)
    }
  }

  // 게스트: 공개 노트의 실제 AI 요약을 우선 — 없으면 예시 배지 샘플만
  let publicPreview: ReturnType<typeof pickPublicAiPreview> = null;
  if (!email) {
    try {
      publicPreview = pickPublicAiPreview(await listPublicNotes(24));
    } catch {
      publicPreview = null;
    }
  }

  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div className="rise-in flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h1 className="text-[26px] font-extrabold text-ink">AI 분석 도구</h1>
            <div className="mt-1.5 text-sm text-text-2">
              내 노트와 국토교통부 실거래로 검증하는 분석 도구
            </div>
          </div>
          {/* #411 항목별 고유기능 — 마지막 사용 도구 복귀 칩 (기록 없으면 없음) */}
          <LastToolChip />
        </div>

        {/* [AI-31] 12종 워크벤치 진입 카드 — 입구 부재가 실행 0회의 1원인이었다.
            카드마다 "무엇을 넣으면 무엇이 나오는지"(tagline·useCase)를 명시한다. */}
        <section className="rise-in-1 flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-[16px] font-extrabold text-ink">AI 워크벤치 — 단지 하나로 실데이터 분석</h2>
            <span className="text-[11.5px] text-text-3">전 도구 출처 각주·불확실성 표기</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {AI_TOOL_IDS.map((id) => {
              const t = TOOL_IDENTITIES[id];
              return (
                <Link
                  key={id}
                  href={`/analysis/ai/${id}`}
                  className="card card-hover flex flex-col gap-1 rounded-[14px] p-3.5 no-underline"
                >
                  <span className="text-[13.5px] font-extrabold text-ink">{t.title}</span>
                  <span className="text-[11.5px] leading-[1.55] text-text-2">{t.tagline}</span>
                  <span className="mt-auto pt-1 text-[10.5px] font-bold text-text-3">
                    단지 검색 → 자동 로드 → 실행 · 약 1분
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* 시작 섹션 — 로그인: 실 카운트 + CTA / 비로그인: 예시 분석 1건 + 로그인 CTA */}
        {email ? (
          <div className="rise-in-1 card flex flex-col gap-3 rounded-[20px] p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[15px] font-extrabold text-ink">
                {myNoteCount !== null
                  ? myNoteCount > 0
                    ? `내 노트 ${myNoteCount}건이 분석을 기다려요`
                    : "아직 작성한 임장노트가 없어요"
                  : "내 노트로 바로 분석할 수 있어요"}
              </div>
              <div className="mt-1 text-[12px] text-text-3">
                {myNoteCount === 0
                  ? "첫 임장노트를 남기면 AI 분석이 열려요"
                  : "기록을 점수화하고 강점·약점·체크 제안을 정리해 드려요"}
              </div>
            </div>
            {myNoteCount === 0 ? (
              <Link href="/notes/new" className="btn-primary btn-md shrink-0">
                첫 노트 쓰기
              </Link>
            ) : (
              <a href="#ai-note-analysis" className="btn-primary btn-md shrink-0">
                내 노트로 분석 시작
              </a>
            )}
          </div>
        ) : publicPreview ? (
          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-[20px] p-5">
            <div className="flex items-center gap-1.5 text-[15px] font-extrabold text-ink">
              공개 노트 AI 정리 미리보기
            </div>
            <div className="ai-panel flex flex-col gap-1.5 rounded-[14px] p-3.5">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center rounded border border-white/20 px-1.5 py-px text-[9px] font-semibold text-ai-muted">
                  {publicPreview.badge}
                </span>
                <span className="text-xs font-extrabold text-white">
                  {publicPreview.title}
                </span>
              </div>
              <div className="text-[11px] leading-[1.55] text-ai-text">
                {publicPreview.teaser}
                {publicPreview.teaser.length >= 160 ? "…" : ""}
              </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <span className="text-[12px] text-text-3">
                실제 공개 임장노트의 정리 결과예요. 로그인하면 내 노트도 같은 방식으로
                정리해요
              </span>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  href={`/notes/${publicPreview.id}`}
                  className="btn-primary btn-md no-underline"
                >
                  전체 AI 요약 보기
                </Link>
                <Link
                  href="/notes/new"
                  className="btn-soft btn-md no-underline"
                >
                  내 노트 쓰기
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-[20px] p-5">
            {/* 공개 AI 미리보기 0건 — 공작아파트 샘플 대신 empty+CTA */}
            <div className="text-[15px] font-extrabold text-ink">
              아직 공개된 AI 정리가 없어요
            </div>
            <p className="text-[13px] leading-[1.55] text-text-2">
              샘플 리포트로 채우지 않아요. 임장노트를 남기면 같은 방식으로 장단점·시세
              맥락을 정리해 드려요.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/notes/new" className="btn-primary btn-md no-underline">
                임장노트 쓰고 AI 받기
              </Link>
              <Link href="/notes" className="btn-soft btn-md no-underline">
                공개 노트 보기
              </Link>
              {!email && (
                <Link href="/login" className="btn-soft btn-md no-underline">
                  로그인
                </Link>
              )}
            </div>
          </div>
        )}

        {/* 단지 선택기 + 임장노트 AI 분석 (지도/검색 ?complexId=·?apt= seed) */}
        <HubComplexPicker
          noteId={noteId ?? null}
          initialComplexId={complexId ?? null}
          initialApt={apt ?? null}
          loggedIn={Boolean(email)}
        />

        <div className="rise-in-1 grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => {
            /* #411 — 카드별 실측 티저. 그 도구가 실제로 낼 숫자 한 줄을
               카드에서 먼저 보여준다(실패/없음이면 줄 자체가 없다). */
            let teaser: { value: string; caption: string } | null = null;
            if (t.href === "/analysis/price" && teasers.price) {
              teaser = {
                value: `㎡당 ${teasers.price.perM2Manwon.toLocaleString("ko-KR")}만`,
                caption: `${teasers.price.regionLabel} 매매${teasers.price.period ? ` · ${teasers.price.period}` : ""}`,
              };
            } else if (t.href === "/analysis/timing" && teasers.timing) {
              teaser = {
                value: `${teasers.timing.momentumPct > 0 ? "+" : ""}${teasers.timing.momentumPct}%`,
                caption: `${teasers.timing.regionLabel} 최근 3구간 지수 모멘텀`,
              };
            } else if (t.href === "/analysis/temperature" && teasers.temp) {
              teaser = {
                value: `${teasers.temp.score}/100`,
                caption: `${teasers.temp.headline} · ${teasers.temp.weekLabel}`,
              };
            } else if (t.href === "/analysis/scenario" && teasers.baseRate) {
              teaser = {
                value: teasers.baseRate,
                caption: "실제 기준금리가 계산에 반영돼요",
              };
            } else if (t.href === "/notes" && myNoteCount !== null && myNoteCount > 0) {
              teaser = {
                value: `${myNoteCount}건`,
                caption: "분석을 기다리는 내 노트",
              };
            }
            return (
            <ToolLink
              key={t.title}
              href={t.href}
              title={t.title}
              className="card card-hover flex flex-col gap-2.5 rounded-[20px] p-[22px] no-underline"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon name={t.icon.replace(/\uFE0F/g, "")} size={19} />
              </div>
              <div className="flex items-center gap-1.5 text-base font-extrabold text-ink">
                {t.title}
                {t.sim && (
                  <span className="inline-flex shrink-0 items-center rounded border border-line px-1 py-px text-[9px] font-semibold leading-[1.4] text-text-3">
                    시뮬레이션
                  </span>
                )}
              </div>
              <div className="text-[13px] leading-[1.55] text-text-2">
                {t.desc}
              </div>
              {teaser && (
                <span className="t-num inline-flex w-fit items-baseline gap-1.5 rounded-xl bg-bg px-3 py-1.5">
                  <span className="text-[15px] font-extrabold text-ink">{teaser.value}</span>
                  <span className="text-[10.5px] text-text-3">{teaser.caption}</span>
                </span>
              )}
              {t.href === "/analysis/compare" && <CompareTrayCount />}
              <div className="mt-auto pt-1 text-xs font-bold text-primary">{t.foot}</div>
            </ToolLink>
            );
          })}

          {/* 누구집 AI 에이전트 — 예전엔 눌러도 아무 일 없는 가짜 입력창 목업이었다.
              이제 실제 에이전트(/agent)로 연결된다: 내 임장노트·실거래를 도구로
              직접 조회해 답하고, 조회한 데이터 목록을 답변과 함께 보여 준다. */}
          <Link
            href="/agent"
            className="ai-panel card-hover flex flex-col gap-2.5 rounded-[20px] p-[22px] no-underline shadow-[0_14px_36px_rgba(16,28,54,.22)]"
          >
            <div className="ai-chip flex h-10 w-10 items-center justify-center rounded-xl text-[15px]">AI</div>
            <div className="text-base font-extrabold text-white">AI 에이전트에게 물어보기</div>
            <div className="text-[13px] leading-[1.55] text-ai-text">
              “내 노트 중 점수가 가장 높았던 단지, 지금 실거래는 어때?”
            </div>
            <div className="text-[11px] leading-[1.5] text-ai-text opacity-80">
              AI 분석은 단지·노트 1건을 깊게, 에이전트는 여러 데이터를
              검색·조합해 질문에 답합니다 (현재 수도권 실거래 기준)
            </div>
            <div className="text-xs font-bold text-ai-accent">
              내 노트·실거래 데이터로 답해요 ›
            </div>
          </Link>
        </div>

        {/* 최근 분석 바로가기 */}
        <div className="rise-in-2 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="chip chip-soft px-3.5 py-2 text-xs no-underline"
            >
              {q.label} ›
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
