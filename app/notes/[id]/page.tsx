import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";
import { ReportButton } from "../../components/ReportButton";
import { NextActions } from "../../components/NextActions";
import {
  getNote,
  hasInspectionScores,
  inspectionAverageScore,
  listNotesByAuthorForApt,
  listNotesByAuthorForComplex,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { NotePhotoCarousel } from "./NotePhotoCarousel";
import { safeAuth } from "@/lib/safe-auth";
import { monthlyPrice } from "@/lib/subscriptions/billing-periods";
import { resolveComplexHref } from "@/lib/newui/complex-link";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { NoteDetailActions } from "./note-actions";
import { AiRetryButton } from "./ai-retry-button";
import { AiFeedbackButtons } from "@/app/components/AiFeedbackButtons";
import DeepDivePanel from "./DeepDivePanel";
import { Icon } from "@/app/components/Icon";
import { JsonLd } from "@/app/components/JsonLd";
import { seoAlternates } from "@/lib/seo/alternates";

/* 시안 6c(노트 상세 + AI) + 10f(AI 노트 분석) + 20a(공개 임장노트 표준 11항목) + 20b(SEO)
   실데이터: inspection_notes → getNote(id) — 공개 노트만 index, 비공개·목업은 noindex */

export const dynamic = "force-dynamic";

const BASE_URL = "https://nuguzip.com";

/* ---------- 뷰 모델 ---------- */

type AxisLevel = "상" | "중" | "하";
type Axis = { icon: string; label: string; level: AxisLevel };
type Visit = { label: string; summary: string; latest: boolean };
type ScoreBar = { label: string; value: number; bad: boolean };

type NoteView = {
  breadcrumb: string;
  chips: string[]; // 지역 › 단지 › 평형 칩 (20a ①)
  oneLiner: string; // 한 줄 총평 = 제목 (20a ③)
  directVisit: boolean; // 직접 방문 배지 (20a ①)
  visitMeta: string; // 방문일·작성자 (20a ②)
  axes: Axis[]; // 채광·소음·주차·교통 4축 (20a ④)
  body: string;
  photos: string[];
  visits: Visit[];
  goodPoints: string[]; // 좋았던 점 (20a ⑤)
  cautionPoints: string[]; // 주의할 점 (20a ⑥)
  evidenceNote: string;
  aiInline: string; // 본문 내 AI 요약 (20a ⑨ — AIPanel로 구분)
  aiBadge: string; // 저장된 AI 분석 vs 규칙 기반 문구 구분 배지
  aiSummary: string;
  /** 입력 축이 없으면 null — 0점을 "종합 점수"로 보여 주지 않는다 */
  totalScore: number | null;
  scoreBars: ScoreBar[];
  scoredAxisCount: number;
  checklistDone: number;
  checklistTotal: number;
  sourceLabel: string; // 출처 각주 (20a ⑦)
  baseDate: string; // 데이터 기준일 (20a ⑧)
  regionLabel: string;
  complexLabel: string;
};

/* G10: 예전에는 조회 실패·미존재 시 MOCK_VIEW(허구의 "공작아파트 3차 임장" 노트)를
   실제 URL 로 그대로 내보냈다. 존재하지 않는 임장 기록을 사실처럼 읽히게 하므로 삭제하고,
   아래 loadNote() 의 3분기(정상·미존재·조회실패)로 대체한다. */

type LoadResult =
  | { kind: "ok"; note: InspectionNote }
  | { kind: "missing" }
  | { kind: "error"; message: string };

async function loadNote(id: string): Promise<LoadResult> {
  try {
    const note = await getNote(id);
    return note ? { kind: "ok", note } : { kind: "missing" };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ---------- 실데이터 → 표준 뷰 변환 ---------- */

function axisToneClass(level: AxisLevel): string {
  if (level === "상") return "text-success";
  if (level === "하") return "text-danger";
  return "text-text-1";
}

function levelFromScore(score: number): AxisLevel {
  if (score >= 4) return "상";
  if (score > 0 && score <= 2) return "하";
  return "중";
}

function detectAxisLevel(
  keywords: string[],
  pros: string,
  cons: string,
  fallbackScore: number,
): AxisLevel {
  const hit = (text: string) => keywords.some((k) => text.includes(k));
  if (hit(cons)) return "하";
  if (hit(pros)) return "상";
  return levelFromScore(fallbackScore);
}

function retryDefaultIntent(
  note: InspectionNote,
): "실거주" | "투자" | "전월세" {
  const m = (note.metadata ?? {}) as Record<string, unknown>;
  const p = m.visitPurpose ?? m.intent;
  if (p === "투자" || p === "전월세" || p === "실거주") return p;
  return "실거주";
}

function splitLines(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n|·|,|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${y}.${Number(m)}.${Number(day)}`;
}

function toView(n: InspectionNote, visitsOverride?: Visit[]): NoteView {
  const s = n.scores;
  const scored = hasInspectionScores(s);
  const avg = inspectionAverageScore(s);
  const total = scored ? Math.round(avg * 20) : null;
  const scoredAxisCount = [s.location, s.school, s.transport, s.facility, s.future].filter(
    (v) => v > 0,
  ).length;
  const displayTitle = n.aptName?.trim() || n.title;
  const pros = n.sections.pros ?? "";
  const cons = n.sections.cons ?? "";

  const goodPoints = splitLines(n.sections.pros);
  const cautionPoints = splitLines(n.sections.cons);
  const scoreEntries: [string, number][] = [
    ["입지", s.location],
    ["학군", s.school],
    ["교통", s.transport],
    ["시설", s.facility],
    ["미래가치", s.future],
  ];
  if (goodPoints.length === 0) {
    scoreEntries
      .filter(([, v]) => v >= 4)
      .forEach(([label, v]) => goodPoints.push(`${label} 우수 (${v}/5)`));
  }
  if (cautionPoints.length === 0) {
    scoreEntries
      .filter(([, v]) => v > 0 && v <= 2)
      .forEach(([label, v]) => cautionPoints.push(`${label} 취약 (${v}/5)`));
  }
  if (goodPoints.length === 0) goodPoints.push("기록된 확정 강점이 아직 없어요");
  if (cautionPoints.length === 0)
    cautionPoints.push("기록된 확정 약점이 아직 없어요");

  // 20a ④ 4축: 텍스트 키워드 우선, 없으면 점수 축으로 근사
  const axes: Axis[] = [
    {
      icon: "☀",
      label: "채광",
      level: detectAxisLevel(["채광", "햇빛", "일조", "남향"], pros, cons, s.facility),
    },
    {
      icon: "🔊",
      label: "소음",
      level: detectAxisLevel(["소음", "시끄", "조용"], pros, cons, s.location),
    },
    {
      icon: "🅿",
      label: "주차",
      level: detectAxisLevel(["주차", "이중주차"], pros, cons, s.facility),
    },
    { icon: "🚇", label: "교통", level: levelFromScore(s.transport) },
  ];

  const doneCount = n.checklist.filter((c) => c.done).length;
  const meta: string[] = [`방문 ${n.visitDate}`];
  if (n.weather) meta.push(n.weather);
  meta.push(n.authorLabel?.trim() || "누구집 스카우트");

  const chips = [n.region, displayTitle].filter(Boolean);
  const weakest = scoreEntries
    .filter(([, v]) => v > 0)
    .sort((a, b) => a[1] - b[1])[0];

  /* AI 요약 — 저장된 note.aiAnalysis(실호출 결과)를 우선 표시.
     없을 때만 규칙 기반 문구로 폴백하고, 배지로 출처를 구분한다. */
  const ai = (n.aiAnalysis ?? null) as Record<string, unknown> | null;
  const storedAiText = [ai?.narrativeSummary, ai?.summary, ai?.detailedConclusion].find(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  const aiEngine = typeof ai?.engine === "string" ? ai.engine : "";
  const ruleInline = scored
    ? `입력 ${scoredAxisCount}개 축 평균 ${avg.toFixed(1)}/5점 — ${
        weakest
          ? `${weakest[0]} 축(${weakest[1]}/5)이 감점 요인입니다.`
          : "축별 점수를 참고하세요."
      }`
    : "현장 축 점수가 아직 없어 종합 점수를 내지 않았어요. 노트에서 평가를 채우면 표시됩니다.";
  const aiBadge = storedAiText
    ? aiEngine.startsWith("rule-based")
      ? "규칙 기반 분석"
      : "AI 생성"
    : "규칙 기반 요약";

  return {
    breadcrumb: `공개 임장노트 › ${displayTitle}`,
    chips,
    oneLiner: n.title,
    directVisit: Boolean(n.visitDate),
    visitMeta: meta.join(" · "),
    axes,
    body:
      n.summary?.trim() ||
      n.sections.memo?.trim() ||
      "본문 메모 없이 점수·체크리스트만 기록된 노트입니다.",
    photos: n.photos,
    visits:
      visitsOverride && visitsOverride.length > 0
        ? visitsOverride
        : [
            {
              label: `1차 · ${n.visitDate}`,
              summary: scored
                ? `평점 ${avg.toFixed(1)}/5 · 체크 ${doneCount}/${n.checklist.length}`
                : `점수 미입력 · 체크 ${doneCount}/${n.checklist.length}`,
              latest: true,
            },
          ],
    goodPoints: goodPoints.slice(0, 4),
    cautionPoints: cautionPoints.slice(0, 4),
    evidenceNote: scored
      ? `입력 ${scoredAxisCount}개 축 + 체크 ${n.checklist.length}건 기준`
      : `점수 미입력 · 체크 ${n.checklist.length}건`,
    aiInline: storedAiText ?? ruleInline,
    aiBadge,
    aiSummary: scored
      ? `${n.region} ${displayTitle} 방문 기록 기준 — 입력 축 평균 ${avg.toFixed(1)}점입니다. ${
          goodPoints[0] && !goodPoints[0].includes("아직")
            ? `강점은 ${goodPoints[0]}, `
            : ""
        }${
          cautionPoints[0] && !cautionPoints[0].includes("아직")
            ? `약점은 ${cautionPoints[0]} 입니다.`
            : "축별 점수를 참고해 다음 방문 계획을 세워보세요."
        }`
      : `${n.region} ${displayTitle} 방문 기록 — 축 점수가 없어 종합 점수는 표시하지 않아요. 체크·메모를 보강하면 판단 근거가 쌓입니다.`,
    totalScore: total,
    scoredAxisCount,
    // 값이 기록되지 않은 축(0점)은 막대에서 생략 — 없는 기록을 있는 것처럼 그리지 않는다
    scoreBars: scoreEntries
      .filter(([, v]) => v > 0)
      .map(([label, v]) => ({
        label,
        value: Math.round(v * 20),
        bad: v <= 2,
      })),
    checklistDone: doneCount,
    checklistTotal: n.checklist.length,
    // 이 화면의 수치는 전부 작성자가 직접 남긴 방문 기록에서 나온다 —
    // 실거래가를 근거로 쓰지 않으므로 출처에 적지 않는다.
    sourceLabel: "작성자 직접 방문 기록",
    baseDate: formatDate(n.updatedAt) || n.visitDate,
    regionLabel: n.region,
    complexLabel: displayTitle,
  };
}

/* ---------- SEO (20b): generateMetadata — 공개 노트만 index ---------- */

async function fetchPublicNote(id: string): Promise<InspectionNote | null> {
  try {
    const note = await getNote(id);
    return note && note.isPublic ? note : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const note = await fetchPublicNote(id);

  if (!note) {
    // 비공개 노트·목업 폴백은 색인 금지 (20b 색인 정책)
    return {
      title: "임장노트 — 누구집",
      robots: { index: false, follow: false },
    };
  }

  const displayTitle = note.aptName?.trim() || note.title;
  const title = `${note.title} — ${note.region} 임장노트 | 누구집`;
  const description = (
    note.summary?.trim() ||
    note.sections.memo?.trim() ||
    `${note.region} ${displayTitle} 직접 방문 임장 기록 — 채광·소음·주차·교통 평가와 좋았던 점·주의할 점.`
  ).slice(0, 150);
  const canonical = `${BASE_URL}/notes/${note.id}`;

  // 동적 OG 이미지 — 실데이터(제목·점수·4축)를 URL 인코딩 (metadataBase 기준 절대화)
  const view = toView(note);
  const ogQuery = new URLSearchParams({
    title: note.title,
    score: view.totalScore != null ? String(view.totalScore) : "",
    badges: view.axes.map((a) => `${a.label} ${a.level}`).join(","),
  });
  // 좌표가 있으면 OG 카드에 네이버 Static Map 썸네일 노출(키 있을 때). 없으면 지도 없이 폴백.
  {
    const m = (note.metadata ?? {}) as Record<string, unknown>;
    const lat = Number(m.lat ?? m.latitude);
    const lng = Number(m.lng ?? m.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      ogQuery.set("lat", String(lat));
      ogQuery.set("lng", String(lng));
    }
  }

  return {
    title,
    description,
    alternates: seoAlternates(`/notes/${note.id}`),
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "누구집",
      locale: "ko_KR",
      type: "article",
      publishedTime: note.createdAt,
      modifiedTime: note.updatedAt,
      images: [
        {
          url: `/api/og/note?${ogQuery.toString()}`,
          width: 1200,
          height: 630,
          alt: `${note.title} 임장노트 카드`,
        },
      ],
    },
  };
}

/* ---------- JSON-LD (Article) — 공개 노트만 ---------- */

/* 문자열이 아니라 **객체**를 돌려준다. 예전에는 여기서 JSON.stringify 한 결과를 그대로
   dangerouslySetInnerHTML 에 넣었는데, note.title·authorLabel 은 사용자가 적는 값이라
   `</script><script>…` 를 넣으면 문서에 실행 가능한 스크립트가 그대로 박혔다(저장형 XSS).
   직렬화와 `<` 이스케이프는 공용 <JsonLd>(lib/seo/jsonld.ts jsonLdScript 와 같은 규칙)에
   맡긴다 — 이 파일의 다른 JSON-LD(noteJsonLd)도 이미 그 경로를 쓴다. */
function articleJsonLd(note: InspectionNote): Record<string, unknown> {
  const displayTitle = note.aptName?.trim() || note.title;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: note.title,
    description:
      note.summary?.trim() ||
      `${note.region} ${displayTitle} 직접 방문 임장 기록`,
    datePublished: note.createdAt,
    dateModified: note.updatedAt,
    author: {
      "@type": "Person",
      name: note.authorLabel?.trim() || "누구집 스카우트",
    },
    publisher: {
      "@type": "Organization",
      name: "누구집",
      url: BASE_URL,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}/notes/${note.id}`,
    },
    articleSection: note.region,
    about: {
      "@type": "ApartmentComplex",
      name: displayTitle,
      address: note.region,
    },
  };
}

/* ---------- JSON-LD (항목 H37) — 공유 JsonLd 헬퍼용 오브젝트 빌더 ----------
   점수(0~100)가 있으면 Review, 없으면 Article. 존재하는 필드만 채워 반환한다. */
function noteJsonLd(
  note: InspectionNote,
  view: NoteView,
): Record<string, unknown> {
  const apt = note.aptName?.trim() || undefined;
  const author = note.authorLabel?.trim() || "누구집 스카우트";
  const datePublished = note.createdAt || undefined;
  const score = view.totalScore;

  if (score != null && score > 0) {
    return {
      "@context": "https://schema.org",
      "@type": "Review",
      headline: note.title,
      author: { "@type": "Person", name: author },
      reviewRating: {
        "@type": "Rating",
        ratingValue: score,
        bestRating: 100,
      },
      ...(apt ? { itemReviewed: { "@type": "Residence", name: apt } } : {}),
      ...(datePublished ? { datePublished } : {}),
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: note.title,
    author: { "@type": "Person", name: author },
    ...(apt ? { about: apt } : {}),
    ...(datePublished ? { datePublished } : {}),
  };
}

/* ---------- 페이지 ---------- */

export default async function NoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ai?: string; quota?: string }>;
}) {
  const { id } = await params;
  const { ai: aiStatusRaw, quota: quotaRaw } = await searchParams;
  /* NoteForm 이 저장 리다이렉트에 quota=1 을 실어 보낸다 — AI 월간 한도에
     걸린 채 저장된 경우다. 예전엔 이 값을 버려서, 가치가 전달된 바로 그
     화면(정리된 노트)에서 업그레이드 안내가 나갈 기회가 사라졌다(항목 38).
     /map 의 WelcomeHandoff 는 같은 값을 이미 읽고 있다. */
  const quotaHit = quotaRaw === "1";
  const aiStatus =
    aiStatusRaw === "ok" || aiStatusRaw === "rule" || aiStatusRaw === "fail"
      ? aiStatusRaw
      : undefined;

  // 뷰어 세션 — 소유자면 비공개 노트도 열람 + 공개/비공개 토글 제공
  const session = await safeAuth();
  const viewerEmail = session?.user?.email?.trim().toLowerCase() ?? null;

  const loaded = await loadNote(id);

  // 조회 실패 — "노트가 없다"고 말하면 거짓이므로 실패 그대로 알린다.
  if (loaded.kind === "error") {
    return (
      <PageShell breadcrumb="임장노트">
        <ErrorState
          title="노트를 불러오지 못했어요"
          desc="일시적인 조회 오류예요. 잠시 뒤 새로고침하면 대부분 정상으로 돌아옵니다."
          cause={loaded.message}
          action={{ label: "임장노트 목록", href: "/notes" }}
        />
      </PageShell>
    );
  }

  // 미존재 노트는 404. 비공개 노트는 소유자가 아니면 존재 여부까지 숨긴다.
  if (loaded.kind === "missing") notFound();
  const realNote = loaded.note;
  const isOwner = Boolean(
    viewerEmail && realNote.authorEmail.toLowerCase() === viewerEmail,
  );
  /* 무료 소유자 판정 — 인라인 업그레이드 카드용(항목 38). 세션 plan 클레임만
     본다: 여기서 DB 를 또 읽을 만큼 중요한 판정이 아니고, 유료인데 무료로
     보이는 최악의 경우에도 카드 한 장이 더 보일 뿐이다. */
  const viewerPlanRaw = ((session?.user as { plan?: string } | undefined)?.plan ?? "free")
    .toLowerCase()
    .trim();
  const isFreeViewer = viewerPlanRaw === "free" || viewerPlanRaw === "basic" || viewerPlanRaw === "";
  if (!realNote.isPublic && !isOwner) notFound();

  // 아파트명(+지역)으로 실 단지 id 조회 — 못 찾으면 링크 숨김
  let complexHref: string | null = null;
  try {
    complexHref = await resolveComplexHref(realNote.aptName, realNote.region);
  } catch {
    complexHref = null;
  }

  // 방문 기록 비교 — complexId 우선, 없으면 aptName. 비소유자는 공개 회차만.
  let visits: Visit[] | undefined;
  const visitComplexId =
    typeof realNote.metadata?.complexId === "string"
      ? realNote.metadata.complexId.trim()
      : "";
  const visitApt = realNote.aptName?.trim() ?? "";
  if (visitComplexId || visitApt) {
    try {
      const grouped = visitComplexId
        ? await listNotesByAuthorForComplex(realNote.authorEmail, visitComplexId)
        : await listNotesByAuthorForApt(realNote.authorEmail, visitApt);
      let visible = isOwner ? grouped : grouped.filter((x) => x.isPublic);
      if (!visible.some((x) => x.id === realNote.id)) visible = [...visible, realNote];
      visits = visible.map((x, i) => {
        const scored = hasInspectionScores(x.scores);
        const avg = inspectionAverageScore(x.scores);
        const checks = `${x.checklist.filter((c) => c.done).length}/${x.checklist.length}`;
        return {
          label: `${i + 1}차 · ${x.visitDate}`,
          summary: scored ? `평점 ${avg.toFixed(1)}/5 · 체크 ${checks}` : `점수 미입력 · 체크 ${checks}`,
          latest: x.id === realNote.id,
        };
      });
    } catch {
      visits = undefined;
    }
  }

  const v = toView(realNote, visits);
  const hasLlmAi = v.aiBadge === "AI 생성";
  const complexIdFromHref =
    complexHref && complexHref.startsWith("/complex/")
      ? complexHref.slice("/complex/".length)
      : null;
  const mapCompareParams = new URLSearchParams();
  if (realNote.region.trim()) {
    mapCompareParams.set("region", realNote.region.trim());
  }
  if (complexIdFromHref) mapCompareParams.set("complexId", complexIdFromHref);
  mapCompareParams.set("noteId", id);
  if (realNote.aptName?.trim()) {
    mapCompareParams.set("apt", realNote.aptName.trim());
  }
  const mapCompareHref = `/map?${mapCompareParams.toString()}`;

  return (
    <PageShell breadcrumb={v.breadcrumb}>
      {/* JSON-LD(Article) — 공개 실데이터 노트만 삽입 (20b). 이스케이프는 <JsonLd> 가 한다. */}
      <JsonLd data={articleJsonLd(realNote)} />
      {/* 항목 H37 — 공유 JsonLd 헬퍼로 Article/Review 구조화 데이터 삽입 */}
      <JsonLd data={noteJsonLd(realNote, v)} />

      {/* AI 한도 도달 안내 — 노트는 저장됐다는 사실을 먼저, 다음 행동(구독)을
          가격과 함께. 가격은 billing-periods 단일 출처. */}
      {isOwner && quotaHit && (
        <div className="rise-in mb-3 rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3 text-[13px] text-text-1">
          노트는 저장됐어요. 이번 달 AI 정리 한도에 도달해 이번 건은 AI 없이
          저장됐어요 —{" "}
          <Link href="/subscription" className="font-extrabold text-primary">
            PRO(월 {monthlyPrice("pro").toLocaleString("ko-KR")}원)로 이어서 쓰기 ›
          </Link>
        </div>
      )}
      {/* 저장 직후 루프 안내 — LLM / 규칙 폴백 / 실패를 구분 */}
      {isOwner && aiStatus === "ok" && hasLlmAi && (
        <div className="rise-in mb-3 rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3 text-[13px] text-text-1">
          AI 정리가 반영됐어요.{" "}
          <Link href={mapCompareHref} className="font-extrabold text-primary">
            지도에서 이 단지와 비교 ›
          </Link>
          {/* 항목 22 — 완료 직후 두 번째 행동: 같은 단지 시세 (단지 매칭 시에만) */}
          {complexHref && (
            <>
              {" · "}
              <Link href={complexHref} className="font-extrabold text-primary">
                이 단지 시세 보기 ›
              </Link>
            </>
          )}
        </div>
      )}
      {isOwner && (aiStatus === "rule" || (aiStatus === "ok" && !hasLlmAi)) && (
        <div className="rise-in mb-3 rounded-2xl border border-line bg-bg px-4 py-3 text-[13px] text-text-2">
          노트는 저장됐고 규칙 기반 요약만 있어요 — AI 정리는 아래에서 다시 시도할 수
          있어요.{" "}
          {/* 항목 22 — AI 성패와 무관하게 저장 완료 후 다음 행동은 있어야 한다 */}
          <Link href={mapCompareHref} className="font-bold text-primary">
            지도에서 비교 ›
          </Link>
          {complexHref && (
            <>
              {" · "}
              <Link href={complexHref} className="font-bold text-primary">
                단지 시세 ›
              </Link>
            </>
          )}
        </div>
      )}
      {isOwner && aiStatus === "fail" && (
        <div className="rise-in mb-3 rounded-2xl border border-line bg-bg px-4 py-3 text-[13px] text-text-2">
          노트는 저장됐어요. AI 정리는 반영되지 않았어요 — 아래에서 다시 시도할 수
          있어요.{" "}
          <Link href={mapCompareHref} className="font-bold text-primary">
            지도에서 비교 ›
          </Link>
          {complexHref && (
            <>
              {" · "}
              <Link href={complexHref} className="font-bold text-primary">
                단지 시세 ›
              </Link>
            </>
          )}
        </div>
      )}

      {/* 상단 액션 — 공유(클립보드)·공개 토글(소유자) 실동작 */}
      <div className="rise-in mb-4 flex flex-wrap items-center justify-end gap-2">
        <NoteDetailActions
          noteId={id}
          isOwner={isOwner}
          initialIsPublic={realNote.isPublic}
        />
        {/* 카드 덱 — 노트 원문과 저장된 AI 분석을 카드 레이아웃으로 다시 그린 화면.
            공개·비공개 모두 열리며, 열람 권한은 이 페이지와 같은 관문을 쓴다. */}
        <Link
          href={`/notes/${id}/deck`}
          className="btn-soft px-3.5 py-2 text-[13px] no-underline"
        >
          카드로 보기
        </Link>
        {isOwner && !hasLlmAi && (
          <Link
            href={`/analysis?noteId=${encodeURIComponent(id)}`}
            className="btn-soft px-3.5 py-2 text-[13px] no-underline"
          >
            AI 분석 허브
          </Link>
        )}
        {/* 지역 컨텍스트를 넘겨 지도 비교 루프가 끊기지 않게 한다 */}
        <Link
          href={mapCompareHref}
          className="btn-primary btn-cta px-3.5 py-2 text-[13px]"
        >
          지도에서 비교
        </Link>
      </div>

      {/* `1fr` 은 `minmax(auto, 1fr)` 이라 왼쪽 트랙이 min-content 아래로 안 줄었다.
          사진 썸네일 10장(가로 1172px)이 트랙을 밀어 올려, 400px 사이드바(판단
          근거·점수 축)가 통째로 컨테이너 밖으로 나가 있었다 — 실측: 뷰포트 1296
          에서 문서 scrollWidth 1690, 왼쪽 칼럼 1222px, aside 오른쪽 끝 1690.
          minmax(0,1fr) + min-w-0 로 고치면 왼쪽 780 / aside 848~1248 로 붙는다. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* ===== 좌측: 노트 본문 (20a 표준 구조) ===== */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* 노트 카드 — 20a 표준 11항목 */}
          <div className="rise-in card flex flex-col gap-3.5 rounded-[20px] p-6">
            {/* ① 지역·단지 칩 */}
            <div className="flex flex-wrap items-center gap-1.5">
              {v.chips.map((c, i) => (
                <span
                  key={c}
                  className={
                    i === v.chips.length - 1
                      ? "rounded-full bg-ink px-2.5 py-1 text-[11px] font-extrabold text-white"
                      : "rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-text-2"
                  }
                >
                  {c}
                </span>
              ))}
            </div>

            {/* ② 한 줄 총평 (= 제목) */}
            <h1 className="text-[19px] font-extrabold leading-[1.4] text-ink md:text-[21px]">
              {v.oneLiner}
            </h1>

            {/* ③ 직접 방문 배지 + 방문일·작성자 */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {v.directVisit ? (
                <span className="rounded-md bg-success-soft chip-pad text-[11px] font-extrabold text-success">
                  ✓ 직접 방문
                </span>
              ) : (
                <span className="rounded-md bg-bg chip-pad text-[11px] font-extrabold text-text-3">
                  자료 조사
                </span>
              )}
              <span className="text-text-3">{v.visitMeta}</span>
            </div>

            {/* ④ 4축 항목 평가 — 채광·소음·주차·교통 상중하 */}
            <div className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-surface p-3.5">
              <div className="text-[11px] font-extrabold text-text-3">항목 평가</div>
              <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                {v.axes.map((a) => (
                  <div
                    key={a.label}
                    className="flex items-center justify-between rounded-lg bg-bg px-3 py-2 text-xs text-text-1"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Icon name={a.icon} size={16} /> {a.label}
                    </span>
                    <b className={`font-extrabold ${axisToneClass(a.level)}`}>
                      {a.level}
                    </b>
                  </div>
                ))}
              </div>
            </div>

            {/* 현장 사진 — 큰 무대 + 좌우 클릭 전환. 예전에는 110×78 썸네일을
                가로로 늘어놓기만 해서 차트가 섞인 사진을 읽을 수 없었다.
                본문 글은 사진 아래로 내린다(요청). slice(0,10) 로 조용히 잘라
                내던 것도 없앴다 — 캐러셀은 장수에 상관없이 다 보여 준다. */}
            {v.photos.length > 0 && <NotePhotoCarousel photos={v.photos} />}

            <p className="text-sm leading-[1.7] text-text-1">{v.body}</p>

            {/* ⑤⑥ 좋았던 점 · 주의할 점 */}
            <div className="rounded-[14px] border border-line bg-surface p-3.5 text-xs leading-[1.7] text-text-1">
              <div>
                <b className="text-success">좋았던 점</b> —{" "}
                {v.goodPoints.join(" · ")}
              </div>
              <div className="mt-1">
                <b className="text-danger">주의할 점</b> —{" "}
                {v.cautionPoints.join(" · ")}
              </div>
            </div>

            {/* ⑨ AI 작성부 구분 표시 — 저장된 aiAnalysis 우선, 없으면 규칙 기반 문구 + 배지 구분 */}
            <AIPanel
              title="AI 요약"
              cta={
                hasLlmAi
                  ? { href: mapCompareHref, label: "지도에서 비교" }
                  : undefined
              }
            >
              <span
                className={`mb-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                  v.aiBadge.startsWith("규칙")
                    ? "border border-amber-400/50 bg-amber-500/15 text-amber-100"
                    : "border border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                }`}
              >
                {v.aiBadge}
                {v.aiBadge.startsWith("규칙") ? " · LLM 아님" : " · LLM"}
              </span>
              <p className="text-[13px] leading-[1.7]">{v.aiInline}</p>
              {isOwner && !hasLlmAi && (
                <AiRetryButton
                  noteId={id}
                  defaultIntent={retryDefaultIntent(realNote)}
                />
              )}
            </AIPanel>
            {isOwner && (
              <div className="mt-2">
                <AiFeedbackButtons
                  targetType="note_ai"
                  targetId={id}
                  context={{
                    mode: hasLlmAi ? "llm" : "rule",
                    badge: v.aiBadge,
                  }}
                />
              </div>
            )}

            {/* ⑦⑧⑩ 출처·데이터 기준일 각주 + 지역·단지 실 내부 링크 */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-line pt-3 text-[11px] text-text-3">
              <span className="h-[5px] w-[5px] rounded-full bg-success" />
              <span>
                {v.sourceLabel} · 기준일 {v.baseDate}
              </span>
              <span>·</span>
              {/* 예전엔 "OO 시세"가 `/town/market` 으로 갔다. 그 경로는 모임
                  리다이렉트 경유지라 시세와 아무 상관이 없었고, 어느 지역인지도
                  전해지지 않았다. 지도가 ?region= 을 받게 됐으니 그리로 보낸다. */}
              <Link
                href={`/map?region=${encodeURIComponent(v.regionLabel)}`}
                className="font-bold text-primary"
              >
                {v.regionLabel} 시세
              </Link>
              {/* 단지 링크 — 실 단지 id를 찾은 경우에만 (mock-1로 보내지 않음) */}
              {complexHref && (
                <>
                  <span>·</span>
                  <Link href={complexHref} className="font-bold text-primary">
                    {v.complexLabel} 홈
                  </Link>
                  <span>·</span>
                  <Link href={complexHref} className="font-bold text-primary">
                    이 단지 노트 더 보기
                  </Link>
                </>
              )}
              {/* 연동(#224): 노트 → 단지 Q&A. 단지명을 q 로 넘겨 그 단지 관련
                  질문만 좁혀 보여준다. 결과가 0이어도 /qna 가 "없다"고 단정하지
                  않고 "최근 100건 안에서 못 찾았다"고 쓴다. */}
              {realNote.aptName?.trim() && (
                <>
                  <span>·</span>
                  <Link
                    href={`/qna?q=${encodeURIComponent(realNote.aptName.trim())}`}
                    className="font-bold text-primary"
                  >
                    이 단지 Q&amp;A
                  </Link>
                </>
              )}
              {/* 신고 연결(#81) — 타인의 노트만, POST /api/moderation/content-report */}
              {!isOwner && (
                <>
                  <span>·</span>
                  <ReportButton postId={realNote.id} />
                </>
              )}
            </div>
          </div>

          {/* AI 심화 분석 8축 — 저장된 것이 없으면 아무것도 그리지 않는다.
              (분석 실행 전 노트에 "분석 없음" 껍데기를 띄우지 않기 위해서다.) */}
          <DeepDivePanel
            analysis={(realNote.aiAnalysis ?? null) as Record<string, unknown> | null}
          />

          {/* 방문 기록 비교 */}
          <div className="rise-in-1 card flex flex-col gap-3 rounded-[20px] p-6">
            <div className="flex items-center justify-between">
              <div className="text-base font-extrabold text-ink">방문 기록 비교</div>
              <Link
                href={`/notes/compare?noteId=${encodeURIComponent(id)}`}
                className="text-xs font-bold text-primary"
              >
                회차 전체 비교 ›
              </Link>
            </div>
            <div className="flex flex-col">
              {v.visits.map((visit, i) => (
                <div
                  key={visit.label}
                  className={`flex justify-between py-2.5 text-[13px] ${
                    i < v.visits.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <span
                    className={visit.latest ? "font-bold text-primary" : "text-text-2"}
                  >
                    {visit.label}
                  </span>
                  <span
                    className={`font-bold ${
                      visit.latest ? "text-primary" : "text-text-1"
                    }`}
                  >
                    {visit.summary}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 좋았던 점 · 주의할 점 상세 (10f) */}
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[20px] p-6">
            <div className="text-[15px] font-extrabold text-ink">
              좋았던 점 · 주의할 점{" "}
              <span className="text-[11px] font-medium text-text-3">
                {v.evidenceNote}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <div className="flex flex-col gap-1.5 rounded-xl bg-success-soft px-4 py-3">
                <div className="text-xs font-extrabold text-success">좋았던 점</div>
                <div className="text-xs leading-[1.6] text-text-1">
                  {v.goodPoints.map((s, i) => (
                    <span key={s}>
                      {i > 0 && <br />}· {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 rounded-xl bg-danger-soft px-4 py-3">
                <div className="text-xs font-extrabold text-danger">주의할 점</div>
                <div className="text-xs leading-[1.6] text-text-1">
                  {v.cautionPoints.map((s, i) => (
                    <span key={s}>
                      {i > 0 && <br />}· {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {/* 다음 단계 제안 — 예전엔 같은 카드의 진짜 링크들과 똑같이 primary·굵게·꺾쇠(›)로
                꾸며 놓고 실제로는 href 도 onClick 도 없는 <span> 이었다. 눌러도 아무 일이
                일어나지 않는 가짜 액션이라, 실제로 데려갈 곳(재방문 기록 작성, 단지·지역
                프리필)이 있는 링크로 바꾼다. 프리필할 단지명이 없으면 꺾쇠와 primary 색을
                떼고 그냥 조언 문장으로 읽히게 둔다. */}
            <div className="flex items-center justify-between gap-3 rounded-xl bg-bg px-3.5 py-3">
              <span className="shrink-0 text-xs text-text-2">다음 단계 제안</span>
              {realNote.aptName?.trim() || realNote.region.trim() ? (
                <Link
                  href={`/notes/new?${new URLSearchParams({
                    ...(realNote.aptName?.trim()
                      ? { apt: realNote.aptName.trim() }
                      : {}),
                    ...(realNote.region.trim()
                      ? { region: realNote.region.trim() }
                      : {}),
                  }).toString()}`}
                  className="text-right text-xs font-extrabold text-primary"
                >
                  시간대를 바꿔 재방문 기록하기 ›
                </Link>
              ) : (
                <span className="text-right text-xs text-text-2">
                  관심 단지라면 시간대를 바꿔 다시 방문해 보세요
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ===== 우측: AI 분석 ===== */}
        <aside className="flex flex-col gap-4">
          {/* AI 판단 근거 정리 (6c) */}
          <div className="rise-in-1">
            <AIPanel title="판단 근거 정리">
              <p className="text-[13px] leading-[1.7]">{v.aiSummary}</p>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between rounded-[10px] bg-[rgba(255,255,255,.07)] px-3 py-2.5">
                  <span className="text-xs">기록 종합 점수</span>
                  <span className="text-sm font-extrabold text-white">
                    {v.totalScore != null ? `${v.totalScore} / 100` : "미입력"}
                  </span>
                </div>
                {/* 실기록 기반 수치만 노출 (허위 수치 금지) */}
                <div className="flex items-center justify-between rounded-[10px] bg-[rgba(255,255,255,.07)] px-3 py-2.5">
                  <span className="text-xs">체크 항목 완료</span>
                  <span className="text-sm font-extrabold text-white">
                    {v.checklistDone}/{v.checklistTotal}
                  </span>
                </div>
              </div>
              <Link
                href="/analysis/compare"
                className="btn-primary mt-3 block rounded-xl p-3 text-center text-sm text-white"
                style={{ boxShadow: "0 8px 20px rgba(29,79,216,.4)" }}
              >
                대안 단지와 나란히 비교
              </Link>
            </AIPanel>
          </div>

          {/* 기록 축 점수 — 입력된 축만 평균. 미입력이면 링을 그리지 않는다 */}
          <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[20px] p-6">
            {v.totalScore != null ? (
              <div
                className="relative h-[110px] w-[110px] rounded-full"
                style={{
                  background: `conic-gradient(#1d4fd8 0% ${v.totalScore}%, rgba(29,79,216,.12) ${v.totalScore}% 100%)`,
                }}
              >
                <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-surface">
                  <span className="text-[30px] font-extrabold leading-none text-primary">
                    {v.totalScore}
                  </span>
                  <span className="text-[10px] text-text-3">/ 100</span>
                </div>
              </div>
            ) : (
              <div className="flex h-[110px] w-[110px] flex-col items-center justify-center rounded-full bg-[#eef1f6]">
                <span className="text-[18px] font-extrabold text-text-3">—</span>
                <span className="mt-0.5 text-[10px] text-text-3">미입력</span>
              </div>
            )}
            <div className="text-center text-xs text-text-2">
              {v.totalScore != null ? (
                <>
                  입력 {v.scoredAxisCount}개 축 평균{" "}
                  <b className="text-primary">{v.totalScore}점</b> · 이 노트 기록 기준
                </>
              ) : (
                <>축 점수가 없어 종합 점수를 표시하지 않아요</>
              )}
            </div>
            <div className="flex w-full flex-col gap-[7px]">
              {v.scoreBars.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="w-11 shrink-0 text-[11px] text-text-2">
                    {b.label}
                  </span>
                  <div className="relative h-2 flex-1 rounded bg-[#eef1f6]">
                    <div
                      className={`absolute left-0 h-2 rounded ${
                        b.bad ? "bg-danger" : "bg-primary"
                      }`}
                      style={{ width: `${b.value}%` }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-extrabold ${
                      b.bad ? "text-danger" : "text-ink"
                    }`}
                  >
                    {b.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-text-3">
              점수 = 입력된 축(입지·학군·교통·시설·미래가치)만 평균 × 20 · 미입력
              축은 평균·막대에서 제외합니다
            </div>
          </div>

          {/* 기록 완성도 (10f) */}
          <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">기록 완성도</div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">체크 항목</span>
              <span className="font-extrabold text-primary">
                {v.checklistDone}/{v.checklistTotal} 완료
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">시간대 커버리지</span>
              <span className="font-extrabold text-primary">
                {v.visits.length}회 방문 기록
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">미확인 항목</span>
              <span className="font-extrabold text-danger">
                {Math.max(v.checklistTotal - v.checklistDone, 0)}건
              </span>
            </div>
          </div>

          {/* G10: '판단 편향 감지'·'체크 제안' 패널은 실제 분석 없이 문구만 고정돼 있던
              허구 패널이라 제거했다. 편향 분석이 실제로 붙으면 그때 되살린다. */}
        </aside>
      </div>

      {/* 항목 38 — 가치를 받은 화면의 상주 안내. AI 정리가 실제로 반영된
          노트를 보는 무료 소유자에게만 보인다(한도 문구가 아니라 가치 문구). */}
      {isOwner && isFreeViewer && hasLlmAi && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3">
          <p className="text-[13px] leading-[1.6] text-text-1">
            이 AI 정리가 도움이 됐다면 — PRO(월{" "}
            {monthlyPrice("pro").toLocaleString("ko-KR")}원)에서는 매 노트마다
            제한 없이 받을 수 있어요.
          </p>
          <Link href="/subscription" className="btn-primary btn-sm no-underline">
            요금제 보기
          </Link>
        </div>
      )}

      {/* 15h-43 노트→AI→지도 루프: 다음 행동을 퍼널 순서로 */}
      <div className="mt-5">
        <NextActions
          actions={[
            ...(hasLlmAi
              ? [
                  {
                    label: "지도에서 비교",
                    href: mapCompareHref,
                    primary: true as const,
                  },
                  {
                    label: "심화 AI 분석",
                    href: `/analysis?noteId=${encodeURIComponent(id)}`,
                  },
                ]
              : [
                  {
                    label: "AI 분석 실행",
                    href: `/analysis?noteId=${encodeURIComponent(id)}`,
                    primary: true as const,
                  },
                  { label: "지도에서 비교", href: mapCompareHref },
                ]),
            ...(complexHref
              ? [{ label: "단지 허브 보기", href: complexHref }]
              : []),
            ...(realNote.aptName?.trim()
              ? [
                  {
                    label: "이 단지 Q&A",
                    href: `/qna?q=${encodeURIComponent(realNote.aptName.trim())}`,
                  },
                ]
              : []),
          ]}
        />
      </div>

      {/* A9 공개노트 전환 훅 — 비로그인 열람자에게 관심단지·알림 로그인 유도 */}
      {!viewerEmail && complexHref && (
        <div className="mt-4 rounded-2xl bg-[rgba(29,79,216,.05)] p-5 text-center">
          <div className="text-[15px] font-extrabold text-ink">이 단지가 궁금하신가요?</div>
          <p className="mx-auto mt-1 max-w-[440px] text-[13px] leading-[1.7] text-text-3">
            로그인하면 {realNote.aptName?.trim() || "이 단지"}를 관심 단지로 저장하고, 실거래·시세
            변동 알림을 받을 수 있어요.
          </p>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(complexHref)}`}
            className="btn-primary btn-md mt-3 inline-block no-underline"
          >
            로그인하고 시세 알림 받기
          </Link>
        </div>
      )}
    </PageShell>
  );
}
