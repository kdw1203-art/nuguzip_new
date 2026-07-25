import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";
import { ReportButton } from "../../components/ReportButton";
import { NextActions } from "../../components/NextActions";
import {
  getNote,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { resolveComplexHref } from "@/lib/newui/complex-link";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { NoteDetailActions } from "./note-actions";
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
  photoCount: number;
  visits: Visit[];
  goodPoints: string[]; // 좋았던 점 (20a ⑤)
  cautionPoints: string[]; // 주의할 점 (20a ⑥)
  evidenceNote: string;
  aiInline: string; // 본문 내 AI 요약 (20a ⑨ — AIPanel로 구분)
  aiSummary: string;
  totalScore: number; // 0~100
  scoreBars: ScoreBar[];
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
  if (level === "상") return "text-[#1a7f4e]";
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

function toView(n: InspectionNote): NoteView {
  const avg = inspectionAverageScore(n.scores);
  const total = Math.round(avg * 20);
  const displayTitle = n.aptName?.trim() || n.title;
  const s = n.scores;
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
    photoCount: n.photos.length,
    visits: [
      {
        label: `1차 · ${n.visitDate}`,
        summary: `평점 ${avg.toFixed(1)}/5 · 체크 ${doneCount}/${n.checklist.length}`,
        latest: true,
      },
    ],
    goodPoints: goodPoints.slice(0, 4),
    cautionPoints: cautionPoints.slice(0, 4),
    evidenceNote: `점수 5개 축 + 체크 ${n.checklist.length}건 기준`,
    aiInline: `5개 축 평균 ${avg.toFixed(1)}/5점 — ${
      weakest ? `${weakest[0]} 축(${weakest[1]}/5)이 감점 요인입니다.` : "축별 점수를 참고하세요."
    }`,
    aiSummary: `${n.region} ${displayTitle} 방문 기록 기준 — 5개 축 평균 ${avg.toFixed(
      1,
    )}점입니다. ${
      goodPoints[0] && !goodPoints[0].includes("아직")
        ? `강점은 ${goodPoints[0]}, `
        : ""
    }${
      cautionPoints[0] && !cautionPoints[0].includes("아직")
        ? `약점은 ${cautionPoints[0]} 입니다.`
        : "축별 점수를 참고해 다음 방문 계획을 세워보세요."
    }`,
    totalScore: total,
    scoreBars: scoreEntries.map(([label, v]) => ({
      label,
      value: Math.round(v * 20),
      bad: v > 0 && v <= 2,
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
    score: String(view.totalScore),
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

function articleJsonLd(note: InspectionNote): string {
  const displayTitle = note.aptName?.trim() || note.title;
  return JSON.stringify({
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
  });
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

  if (score > 0) {
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
  if (!realNote.isPublic && !isOwner) notFound();

  // 아파트명(+지역)으로 실 단지 id 조회 — 못 찾으면 링크 숨김
  let complexHref: string | null = null;
  try {
    complexHref = await resolveComplexHref(realNote.aptName, realNote.region);
  } catch {
    complexHref = null;
  }

  const v = toView(realNote);

  return (
    <PageShell breadcrumb={v.breadcrumb}>
      {/* JSON-LD(Article) — 공개 실데이터 노트만 삽입 (20b) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: articleJsonLd(realNote) }}
      />
      {/* 항목 H37 — 공유 JsonLd 헬퍼로 Article/Review 구조화 데이터 삽입 */}
      <JsonLd data={noteJsonLd(realNote, v)} />

      {/* 상단 액션 — 공유(클립보드)·공개 토글(소유자) 실동작 */}
      <div className="rise-in mb-4 flex flex-wrap items-center justify-end gap-2">
        <NoteDetailActions
          noteId={id}
          isOwner={isOwner}
          initialIsPublic={realNote.isPublic}
        />
        <Link href="/notes/compare" className="btn-secondary px-3.5 py-2 text-[13px]">
          회차 비교
        </Link>
        <Link href="/map" className="btn-primary btn-cta px-3.5 py-2 text-[13px]">
          지도에서 비교
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]">
        {/* ===== 좌측: 노트 본문 (20a 표준 구조) ===== */}
        <div className="flex flex-col gap-4">
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
            <h1 className="text-[21px] font-extrabold leading-[1.4] text-ink">
              {v.oneLiner}
            </h1>

            {/* ③ 직접 방문 배지 + 방문일·작성자 */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {v.directVisit ? (
                <span className="rounded-md bg-[#e7f5ee] px-2 py-[3px] text-[11px] font-extrabold text-[#1a7f4e]">
                  ✓ 직접 방문
                </span>
              ) : (
                <span className="rounded-md bg-bg px-2 py-[3px] text-[11px] font-extrabold text-text-3">
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

            <p className="text-sm leading-[1.7] text-text-1">{v.body}</p>

            {/* 현장 사진 플레이스홀더 */}
            {v.photoCount > 0 && (
              <div className="flex gap-2">
                {Array.from({ length: Math.min(v.photoCount, 2) }, (_, i) => (
                  <div
                    key={i}
                    className="flex h-[78px] w-[110px] items-center justify-center rounded-[10px] bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef] font-mono text-[10px] text-text-3"
                  >
                    현장 사진
                  </div>
                ))}
                {v.photoCount > 2 && (
                  <div className="flex h-[78px] w-[110px] items-center justify-center rounded-[10px] bg-[#f2f4f8] text-xs font-bold text-text-2">
                    +{v.photoCount - 2}
                  </div>
                )}
              </div>
            )}

            {/* ⑤⑥ 좋았던 점 · 주의할 점 */}
            <div className="rounded-[14px] border border-line bg-surface p-3.5 text-xs leading-[1.7] text-text-1">
              <div>
                <b className="text-[#1a7f4e]">좋았던 점</b> —{" "}
                {v.goodPoints.join(" · ")}
              </div>
              <div className="mt-1">
                <b className="text-danger">주의할 점</b> —{" "}
                {v.cautionPoints.join(" · ")}
              </div>
            </div>

            {/* ⑨ AI 작성부 구분 표시 — 잉크 다크 AIPanel (16c 패턴) */}
            <AIPanel title="AI 요약">
              <p className="text-[13px] leading-[1.7]">{v.aiInline}</p>
            </AIPanel>

            {/* ⑦⑧⑩ 출처·데이터 기준일 각주 + 지역·단지 실 내부 링크 */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-line pt-3 text-[11px] text-text-3">
              <span className="h-[5px] w-[5px] rounded-full bg-[#1a7f4e]" />
              <span>
                {v.sourceLabel} · 기준일 {v.baseDate}
              </span>
              <span>·</span>
              <Link href="/town/market" className="font-bold text-primary">
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
              {/* 신고 연결(#81) — 타인의 노트만, POST /api/moderation/content-report */}
              {!isOwner && (
                <>
                  <span>·</span>
                  <ReportButton postId={realNote.id} />
                </>
              )}
            </div>
          </div>

          {/* 방문 기록 비교 */}
          <div className="rise-in-1 card flex flex-col gap-3 rounded-[20px] p-6">
            <div className="flex items-center justify-between">
              <div className="text-base font-extrabold text-ink">방문 기록 비교</div>
              <Link href="/notes/compare" className="text-xs font-bold text-primary">
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
              <div className="flex flex-col gap-1.5 rounded-xl bg-[#e7f5ee] px-4 py-3">
                <div className="text-xs font-extrabold text-[#1a7f4e]">좋았던 점</div>
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
            <div className="flex items-center justify-between rounded-xl bg-bg px-3.5 py-3">
              <span className="text-xs text-text-2">다음 단계 제안</span>
              <span className="text-xs font-extrabold text-primary">
                관심 단지라면 시간대를 바꿔 재방문 ›
              </span>
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
                    {v.totalScore} / 100
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

          {/* AI 점수 산출 (10f) */}
          <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[20px] p-6">
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
            <div className="text-center text-xs text-text-2">
              5개 축 평균 <b className="text-primary">{v.totalScore}점</b> · 이 노트
              기록 기준
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
              점수 = 내 기록 60% + 공공 데이터 40% 가중
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

      {/* 15h-43 노트→분석 상시 연결: 상세 하단 고정 다음 행동
          — 실노트는 노트 컨텍스트(?noteId=)를 /analysis 허브로 전달 */}
      <div className="mt-5">
        <NextActions
          actions={[
            {
              label: "AI 분석 실행",
              href: `/analysis?noteId=${encodeURIComponent(id)}`,
              primary: true,
            },
            { label: "회차 비교", href: "/notes/compare" },
            ...(complexHref
              ? [{ label: "단지 허브 보기", href: complexHref }]
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
