import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";
import {
  getNote,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";

/* 시안 6c(노트 상세 + AI) + 10f(AI 노트 분석) + 20a(공개 임장노트 표준 11항목) + 20b(SEO)
   실데이터: inspection_notes → getNote(id) — 공개 노트만 index, 비공개·목업은 noindex */

export const dynamic = "force-dynamic";

const BASE_URL = "https://nuguzip.com";
const COMPLEX_HREF = "/complex/mock-1";

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

const MOCK_VIEW: NoteView = {
  breadcrumb: "임장노트 › 공작아파트",
  chips: ["관양동", "공작아파트", "84A 노트"],
  oneLiner: "공작 302동 3차 임장 — 채광은 확실, 주차가 관건",
  directVisit: true,
  visitMeta: "방문 2026.7.12 (토) 14~16시 · 임장러버",
  axes: [
    { icon: "☀", label: "채광", level: "상" },
    { icon: "🔊", label: "소음", level: "중" },
    { icon: "🅿", label: "주차", level: "하" },
    { icon: "🚇", label: "교통", level: "상" },
  ],
  body: "남향이라 오후 채광 좋음. 단지 뒤 도로 소음 약간 있음. 초등학교 도보 5분. 주차는 세대당 0.9대로 저녁엔 이중주차 많음.",
  photoCount: 4,
  visits: [
    { label: "1차 · 2026.05.02 (오전)", summary: "채광 보통 · 소음 좋음", latest: false },
    { label: "2차 · 2026.06.14 (저녁)", summary: "주차 아쉬움 · 소음 보통", latest: false },
    { label: "3차 · 2026.07.12 (오후)", summary: "채광 좋음 · 학군 좋음", latest: true },
  ],
  goodPoints: ["오후 2시에도 거실 밝음", "초등학교 도보 7분", "재건축 여지 + 재개발 인접"],
  cautionPoints: ["저녁 7시 지상 만차, 지하 2층까지", "연식 38년 (관리비 +4만/월)"],
  evidenceNote: "기록 5건 + 실거래 36건 + 공개 노트 38건",
  aiInline:
    "최근 90일 실거래 4건 평균 4.82억 — 이 노트의 감점(주차) 반영 시 적정가 4.7억",
  aiSummary:
    "3회 방문 기록 기준 — 채광·학군은 일관되게 강점입니다. 소음은 시간대 편차가 있고, 주차(세대당 0.9대)는 구조적 약점입니다.",
  totalScore: 81,
  scoreBars: [
    { label: "입지", value: 86, bad: false },
    { label: "환경", value: 78, bad: false },
    { label: "단지", value: 62, bad: true },
    { label: "가격", value: 84, bad: false },
    { label: "미래가치", value: 80, bad: false },
  ],
  checklistDone: 9,
  checklistTotal: 10,
  sourceLabel: "국토부 실거래가",
  baseDate: "2026.7.19",
  regionLabel: "관양동",
  complexLabel: "공작아파트",
};

const SUGGESTIONS = [
  "평일 오전 등교 시간대 단지 앞 교통 확인",
  "302동 저층 채광 — 겨울 기준 재확인 필요",
  "관리비 내역(1988년 준공, 배관 이슈) 문의",
];

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
    sourceLabel: "국토부 실거래가 · 사용자 방문 기록",
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

  return {
    title,
    description,
    alternates: { canonical },
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

/* ---------- 페이지 ---------- */

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let view = MOCK_VIEW;
  let realNote: InspectionNote | null = null;
  try {
    const note = await getNote(id);
    if (note && note.isPublic) {
      view = toView(note);
      realNote = note;
    }
  } catch {
    // env 미설정·조회 실패 시 목업 유지
  }
  const isReal = realNote !== null;

  const v = view;

  return (
    <PageShell breadcrumb={v.breadcrumb}>
      {/* JSON-LD(Article) — 공개 실데이터 노트만 삽입 (20b) */}
      {realNote && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: articleJsonLd(realNote) }}
        />
      )}

      {/* 상단 액션 */}
      <div className="rise-in mb-4 flex items-center justify-end gap-2">
        <button type="button" className="btn-soft px-3.5 py-2 text-[13px]">
          공유 링크
        </button>
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
                    <span>
                      {a.icon} {a.label}
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
              <span>·</span>
              <Link href={COMPLEX_HREF} className="font-bold text-primary">
                {v.complexLabel} 홈
              </Link>
              <span>·</span>
              <Link href={COMPLEX_HREF} className="font-bold text-primary">
                이 단지 노트 {isReal ? "더 보기" : "38"}
              </Link>
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
                {isReal
                  ? "관심 단지라면 시간대를 바꿔 재방문 ›"
                  : "추가 방문 불필요 → 협상 단계 진행 ›"}
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
                <div className="flex items-center justify-between rounded-[10px] bg-[rgba(255,255,255,.07)] px-3 py-2.5">
                  <span className="text-xs">최근 3개월 실거래</span>
                  <span className="text-sm font-extrabold text-ai-accent">
                    ▼ 4.1% 하락 구간
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-[10px] bg-[rgba(255,255,255,.07)] px-3 py-2.5">
                  <span className="text-xs">예산 내 대안 단지</span>
                  <span className="text-sm font-extrabold text-white">2곳</span>
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
              {isReal ? (
                <>
                  5개 축 평균 <b className="text-primary">{v.totalScore}점</b> ·
                  공개 노트 기준
                </>
              ) : (
                <>
                  관양동 공개 노트 상위 <b className="text-primary">12%</b> · 기록
                  완성도 높음
                </>
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
            <div className="text-[10px] text-[#adb5bd]">
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
                {isReal ? "1회 방문 기록" : "오전·오후·저녁·우천 ✓"}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">미확인 항목</span>
              <span className="font-extrabold text-danger">
                {isReal
                  ? `${Math.max(v.checklistTotal - v.checklistDone, 0)}건`
                  : "겨울 채광 1건"}
              </span>
            </div>
          </div>

          {/* AI 판단 편향 감지 (10f) */}
          <div className="rise-in-4">
            <AIPanel title="판단 편향 감지">
              <p>
                기록 5건 중 4건이{" "}
                <b className="text-[#f2c94c]">긍정 표현 위주</b>입니다 — 이미
                마음이 기운 상태에서의 확증 편향 가능성이 있어요. 균형을 위해: ①
                이 단지의 <b className="text-white">부정 공개 노트 3건</b>을
                읽어보세요 ② 체크 항목 중 &apos;아쉬움&apos;이 2개 이상인
                항목(주차·연식)에 실제 월 비용을 붙여 다시 평가해 보세요.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1 rounded-[10px] p-2.5 text-center text-xs text-white"
                >
                  반대 관점 노트 3건 보기
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-[10px] bg-[rgba(255,255,255,.08)] p-2.5 text-center text-xs font-bold text-ai-text"
                >
                  약점 비용 환산
                </button>
              </div>
            </AIPanel>
          </div>

          {/* 체크 제안 (6c) */}
          <div className="rise-in-5 card flex flex-col gap-2.5 rounded-[20px] p-5">
            <div className="text-sm font-extrabold text-ink">체크 제안</div>
            {SUGGESTIONS.map((s) => (
              <div
                key={s}
                className="flex items-baseline gap-2 text-[13px] leading-[1.5] text-text-1"
              >
                <span className="font-extrabold text-primary">·</span>
                {s}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
