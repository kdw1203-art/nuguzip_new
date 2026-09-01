import type { ReactNode } from "react";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import {
  listNotes,
  listPublicNotes,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { loadHubTeasers, type HubTeaser } from "./hub-teasers";
import { Sparkline } from "./Sparkline";
import { HubPickedProvider } from "./hub-context";
import { HubHero } from "./hub-hero";
import { WorkbenchGrid } from "./hub-tiers";
import { HubNoteAnalysis } from "./hub-picker";
import { CompareTrayCount, ToolLink } from "./tool-cards-client";
import {
  ACCEPTS_COMPLEX,
  AI_TOOL_COUNT,
  MARKET_LIVE,
  RECORD_LIVE,
  SIM_TOOLS,
  TIERS,
  type HubTool,
  type TierId,
} from "./tool-catalog";

/* ============================================================
   분석 허브 — 2026-08-25 리디자인 (UI-01 ~ UI-10)

   소유자 피드백 그대로: "딱딱하고 개성이 없다 · 내용이 너무 많다 ·
   인터랙티브하지 않다 · 뭐가 중요한지, 어떤 게 어느 기능인지 모르겠다."

   실측 진단(같은 날):
     · 한 화면 진입점 23개 — 전부 같은 무게로 평평
     · 이름이 겹치는 쌍 5개(비교·포트폴리오·타이밍·갭·시나리오)
     · 상호작용 요소 23개 중 1개(검색기 — 그마저 화면 중간)
     · 글자 크기 10종 · 모서리 반경 3종
     · 워크벤치 12장이 전부 같은 문장("… · 약 1분")을 밑줄에 달고 있었음
     · 워크벤치 30일 실행 0회

   구조를 "기능 목록"에서 **질문 3개**로 바꿨다. 사용자는 기능 이름이 아니라
   목적으로 고른다 — 단지 하나 / 지역·시장 / 내 기록.

     [히어로]  검색 + 3단계 스텝퍼            ← 출발점을 첫 화면으로 (UI-05·10)
     [계열 1]  단지 하나를 깊게 — 워크벤치 4 + 접힌 8 (UI-01·03)
     [계열 2]  지역·시장 흐름 — 실데이터 4종 + 스파크라인 (UI-09)
     [계열 3]  내 기록 — 임장노트·비교 트레이 + 노트 AI 실행
     [에이전트] 여러 데이터를 물어보는 자리 (계열을 가로지르는 하나)
     [체험]    예시 계산 4종 — 접힘. 실데이터와 섞지 않는다 (UI-04)

   글자 크기는 램프 유틸(.t-display/.t-title/.t-section/.t-sub/.t-caption)만
   쓴다 — 이 화면에 있던 text-[26px]·[15px]·[13.5px]·[11.5px]·[10.5px]·[9px]
   같은 임의값을 전부 걷어냈다(UI-07).
   ============================================================ */

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
    return { id: n.id, title, teaser: teaser.trim().slice(0, 160), badge };
  }
  return null;
}

/* 설명문은 이 화면이 실제로 하는 일만 적는다. SIM_TOOLS 는 아직 실연동이
   아니므로 "예시 계산"이라는 사실을 description 에도 남긴다 — 검색 결과만
   보고 실측 분석을 기대하고 들어오면 그게 곧 거짓말이 된다. */
export const metadata = buildPageMetadata({
  title: "분석 도구",
  description:
    "단지 하나를 깊게, 지역 시장 흐름을, 내 임장노트를 — 국토교통부 실거래 기반 분석 도구를 한곳에서. 실연동 전 도구는 '예시 계산'으로 따로 표시합니다.",
  path: "/analysis",
});

const TIER_ICON: Record<TierId, string> = {
  complex: "building2",
  market: "trending-up",
  record: "notebook-pen",
};

function TierHead({ id, count }: { id: TierId; count: number }) {
  const t = TIERS[id];
  return (
    <div className="hub-tier-head">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${t.iconClass}`}
        >
          <Icon name={TIER_ICON[id]} size={16} />
        </span>
        <h2 className="accent-underline t-title text-balance text-ink">{t.question}</h2>
        <span className="t-caption ml-auto shrink-0 rounded border border-line px-1.5 py-px font-bold text-text-3">
          {t.badge} · {count}종
        </span>
      </div>
      <p className="t-sub text-text-3">{t.hint}</p>
    </div>
  );
}

/** 도구 카드 한 장 — 아이콘(계열색) · 제목 · 설명 · 실측 티저 + 추세선 · 열기 */
function ToolCard({
  t,
  teaser,
  extra,
}: {
  t: HubTool;
  teaser?: HubTeaser | null;
  extra?: ReactNode;
}) {
  const tier = TIERS[t.tier];
  const spark = teaser && teaser.series.length >= 2 ? teaser.series : null;
  return (
    <ToolLink
      href={t.href}
      title={t.title}
      withPicked={ACCEPTS_COMPLEX.has(t.href)}
      className="tile card ai-glow flex flex-col gap-2 rounded-[14px] p-4 no-underline"
    >
      <div className="flex items-start gap-2">
        <span
          className={`tile-ico flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${tier.iconClass}`}
        >
          <Icon name={t.icon} size={17} />
        </span>
        {spark && (
          <span className={`tile-spark ml-auto ${tier.sparkClass}`}>
            <Sparkline values={spark} width={72} height={24} />
          </span>
        )}
      </div>
      <span className="t-section text-ink">{t.title}</span>
      <span className="t-sub text-text-2">{t.desc}</span>
      {teaser && (
        <span className="flex flex-col gap-0.5 rounded-[10px] bg-bg px-2.5 py-1.5">
          <span className="t-num t-section text-ink">{teaser.value}</span>
          <span className="t-caption text-text-3">{teaser.caption}</span>
        </span>
      )}
      {extra}
      <span className="tile-go t-sub mt-auto pt-0.5 font-bold text-primary">
        열기 ›
      </span>
    </ToolLink>
  );
}

export const dynamic = "force-dynamic";

export default async function AnalysisHubPage({
  searchParams,
}: {
  searchParams: Promise<{ noteId?: string; complexId?: string; apt?: string }>;
}) {
  const { noteId, complexId, apt } = await searchParams;

  /* 카드별 실측 티저 + 12구간 추세선. 실패/없음이면 해당 키가 아예 없고,
     카드에서는 그 줄이 빠질 뿐이다(가짜 수치·"—" 채움 없음). */
  const teasers = await loadHubTeasers().catch(() => ({}));

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

  // 게스트: 공개 노트의 실제 AI 요약을 우선 — 없으면 empty + CTA
  let publicPreview: ReturnType<typeof pickPublicAiPreview> = null;
  if (!email) {
    try {
      publicPreview = pickPublicAiPreview(await listPublicNotes(24));
    } catch {
      publicPreview = null;
    }
  }

  const noteTeaser: HubTeaser | null =
    myNoteCount !== null && myNoteCount > 0
      ? {
          value: `${myNoteCount}건`,
          caption: "분석을 기다리는 내 임장노트",
          series: [],
        }
      : null;

  return (
    <PageShell>
      <HubPickedProvider>
        <div className="flex flex-col gap-6">
          {/* ── 히어로: 검색이 화면의 첫 요소 (UI-05·10) ── */}
          <HubHero
            initialComplexId={complexId ?? null}
            initialApt={apt ?? null}
          />

          {/* ── 계열 1 · 단지 하나를 깊게 (UI-01·03) ── */}
          <section
            id="tier-complex"
            className="rise-in-1 flex scroll-mt-24 flex-col gap-3"
          >
            <TierHead id="complex" count={AI_TOOL_COUNT} />
            <WorkbenchGrid />
          </section>

          {/* ── 계열 2 · 지역·시장 흐름 (UI-09 실측 티저 + 추세선) ── */}
          <section
            id="tier-market"
            className="rise-in-2 flex scroll-mt-24 flex-col gap-3"
          >
            <TierHead id="market" count={MARKET_LIVE.length} />
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {MARKET_LIVE.map((t) => (
                <ToolCard
                  key={t.href}
                  t={t}
                  teaser={
                    t.teaser && t.teaser in teasers
                      ? (teasers as Record<string, HubTeaser>)[t.teaser]
                      : null
                  }
                />
              ))}
            </div>
          </section>

          {/* ── 계열 3 · 내가 쓴 기록 ── */}
          <section
            id="tier-record"
            className="rise-in-2 flex scroll-mt-24 flex-col gap-3"
          >
            <TierHead id="record" count={RECORD_LIVE.length} />

            {/* 시작 지점: 로그인=내 노트 실카운트 / 게스트=공개 노트 실 요약 */}
            {email ? (
              <div className="card tile flex flex-col gap-3 rounded-[14px] p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="t-section text-ink">
                    {myNoteCount !== null
                      ? myNoteCount > 0
                        ? `내 노트 ${myNoteCount}건이 분석을 기다려요`
                        : "아직 작성한 임장노트가 없어요"
                      : "내 노트로 바로 분석할 수 있어요"}
                  </span>
                  <span className="t-sub text-text-3">
                    {myNoteCount === 0
                      ? "첫 임장노트를 남기면 AI 분석이 열려요"
                      : "기록을 점수화하고 강점·약점·체크 제안을 정리해 드려요"}
                  </span>
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
              <div className="card flex flex-col gap-2.5 rounded-[14px] p-4">
                <span className="t-section text-ink">공개 노트 AI 정리 미리보기</span>
                <div className="ai-panel flex flex-col gap-1.5 rounded-[11px] p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="t-caption inline-flex items-center rounded border border-line px-1.5 py-px font-semibold text-ai-muted">
                      {publicPreview.badge}
                    </span>
                    <span className="t-sub font-extrabold text-ai-text">
                      {publicPreview.title}
                    </span>
                  </div>
                  <p className="t-sub text-ai-text">
                    {publicPreview.teaser}
                    {publicPreview.teaser.length >= 160 ? "…" : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <span className="t-sub text-text-3">
                    실제 공개 임장노트의 정리 결과예요. 로그인하면 내 노트도 같은
                    방식으로 정리해요
                  </span>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/notes/${publicPreview.id}`}
                      className="btn-primary btn-md no-underline"
                    >
                      전체 AI 요약 보기
                    </Link>
                    <Link href="/notes/new" className="btn-soft btn-md no-underline">
                      내 노트 쓰기
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card flex flex-col gap-2.5 rounded-[14px] p-4">
                {/* 공개 AI 미리보기 0건 — 샘플 리포트로 채우지 않는다 */}
                <span className="t-section text-ink">
                  아직 공개된 AI 정리가 없어요
                </span>
                <p className="t-body text-text-2">
                  샘플 리포트로 채우지 않아요. 임장노트를 남기면 같은 방식으로
                  장단점·시세 맥락을 정리해 드려요.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/notes/new" className="btn-primary btn-md no-underline">
                    임장노트 쓰고 AI 받기
                  </Link>
                  <Link href="/notes" className="btn-soft btn-md no-underline">
                    공개 노트 보기
                  </Link>
                  <Link href="/login" className="btn-soft btn-md no-underline">
                    로그인
                  </Link>
                </div>
              </div>
            )}

            {/* 도구 2장 + 노트 AI 실행 카드를 한 그리드에 둔다. 따로 두면
                데스크톱에서 도구 카드가 화면 절반씩 늘어나 텅 비어 보였다. */}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {RECORD_LIVE.map((t) => (
                <ToolCard
                  key={t.href}
                  t={t}
                  teaser={t.teaser === "notes" ? noteTeaser : null}
                  extra={
                    t.teaser === "compare" ? <CompareTrayCount /> : undefined
                  }
                />
              ))}
              {/* 히어로에서 고른 단지를 컨텍스트로 받는다 */}
              <HubNoteAnalysis
                noteId={noteId ?? null}
                loggedIn={Boolean(email)}
                className="col-span-2"
              />
            </div>
          </section>

          {/* ── 계열을 가로지르는 하나: 에이전트 ──
              예전엔 도구 카드 8장 사이에 끼어 있어 "9번째 도구"처럼 보였다.
              하는 일이 다르다 — 도구는 한 대상을 깊게, 에이전트는 여러 데이터를
              검색·조합해 질문에 답한다. 그래서 자리를 따로 준다. */}
          <Link
            href="/agent"
            className="ai-panel tile rise-in-3 flex flex-col gap-2.5 rounded-[18px] p-5 no-underline md:flex-row md:items-center md:gap-5"
          >
            <span className="ai-chip tile-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]">
              <Icon name="bot" size={20} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="t-section text-ai-text">
                셋 다 아닌가요? 에이전트에게 그냥 물어보세요
              </span>
              <span className="t-sub text-ai-text">
                “내 노트 중 점수가 가장 높았던 단지, 지금 실거래는 어때?” — 내
                임장노트·실거래를 직접 조회해 답하고, 무엇을 봤는지 목록으로
                같이 보여 줍니다 (현재 수도권 실거래 기준)
              </span>
            </span>
            <span className="tile-go t-sub shrink-0 font-bold text-ai-accent">
              에이전트 열기 ›
            </span>
          </Link>

          {/* ── 체험 구역 (UI-04) — 실데이터와 섞지 않는다. 기본 접힘 ── */}
          <details className="hub-sim card rise-in-3 rounded-[14px] p-4">
            <summary className="flex flex-wrap items-center gap-2">
              <span className="t-section text-ink">
                예시 계산으로 먼저 감 잡기
              </span>
              <span className="t-caption rounded border border-line px-1.5 py-px font-bold text-text-3">
                실데이터 아님 · {SIM_TOOLS.length}종
              </span>
              <span className="t-sub ml-auto font-bold text-primary">
                <span className="hub-sim-closed">펼치기</span>
                <span className="hub-sim-open">접기</span>{" "}
                <span className="hub-sim-caret" aria-hidden="true">
                  ▾
                </span>
              </span>
            </summary>
            <p className="t-sub mt-2 text-text-3">
              아래 넷은 아직 실연동 전이라 예시 수치로 계산합니다. 위 도구들과
              달리 결과를 의사결정에 그대로 쓰면 안 됩니다.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {SIM_TOOLS.map((t) => (
                <ToolCard
                  key={t.href}
                  t={t}
                  teaser={
                    t.teaser && t.teaser in teasers
                      ? (teasers as Record<string, HubTeaser>)[t.teaser]
                      : null
                  }
                  extra={
                    <span className="t-caption w-fit rounded border border-line px-1.5 py-px font-bold text-text-3">
                      예시 계산
                    </span>
                  }
                />
              ))}
            </div>
          </details>
        </div>
      </HubPickedProvider>
    </PageShell>
  );
}
