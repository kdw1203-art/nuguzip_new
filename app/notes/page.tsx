import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { NotesFeedClient, type FeedNote } from "./notes-feed-client";
import { resolveComplexHref } from "@/lib/newui/complex-link";

/* 시안 7a — 공개 임장노트 피드. 실데이터: inspection_notes(is_public) → listPublicNotes */

export const revalidate = 120;

/* 더미데이터 정책(더미 1개 원칙): 테스트용 샘플은 단 1건 —
   실데이터 0건일 때만 "예시" 배지와 함께 노출 */
const MOCK_NOTES: FeedNote[] = [
  {
    id: "1",
    author: "관양동 이웃",
    meta: "예시 · 3번째 방문",
    score: 78,
    scoreTone: "primary",
    title: "공작아파트 302동 84A",
    excerpt: "“오후 채광 좋음, 단지 뒤 도로 소음 약간. 주차는 저녁 이중주차…”",
    tags: [
      { label: "채광 좋음", tone: "pos" },
      { label: "초품아", tone: "pos" },
      { label: "이중주차", tone: "neg" },
    ],
    footer: ["공감 12", "댓글 5", "저장 8"],
    popularity: 12,
    interested: true,
    complexHref: "/complex/mock-1",
    isExample: true,
  },
];

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day === 1) return "어제";
  if (day < 31) return `${day}일 전`;
  return iso.slice(0, 10);
}

function maskAuthor(n: InspectionNote): string {
  if (n.authorLabel && n.authorLabel.trim()) return n.authorLabel.trim();
  const local = n.authorEmail.split("@")[0] ?? "이웃";
  const head = local.slice(0, 2) || "이웃";
  return `${head}** 이웃`;
}

function deriveTags(n: InspectionNote): FeedNote["tags"] {
  const tags: FeedNote["tags"] = [];
  const s = n.scores;
  if (s.transport >= 4) tags.push({ label: "교통 좋음", tone: "pos" });
  if (s.school >= 4) tags.push({ label: "학군 좋음", tone: "pos" });
  if (s.location >= 4) tags.push({ label: "입지 좋음", tone: "pos" });
  if (s.future >= 4) tags.push({ label: "미래가치", tone: "pos" });
  if (s.facility <= 2) tags.push({ label: "시설 아쉬움", tone: "neg" });
  if (s.location > 0 && s.location <= 2)
    tags.push({ label: "입지 아쉬움", tone: "neg" });
  return tags.slice(0, 3);
}

function toFeedNote(n: InspectionNote, complexHref: string | null): FeedNote {
  const avg = inspectionAverageScore(n.scores);
  const score = Math.round(avg * 20);
  const excerptSrc =
    n.summary?.trim() ||
    n.sections.memo?.trim() ||
    n.sections.pros?.trim() ||
    "현장 기록이 등록된 임장노트입니다.";
  const excerpt =
    excerptSrc.length > 60 ? `“${excerptSrc.slice(0, 60)}…”` : `“${excerptSrc}”`;
  return {
    id: n.id,
    author: maskAuthor(n),
    meta: `${relativeTime(n.createdAt)} · ${n.region}`,
    score,
    scoreTone: avg >= 3.5 ? "primary" : "muted",
    title: n.aptName ? `${n.aptName}` : n.title,
    excerpt,
    tags: deriveTags(n),
    footer: [
      `평점 ${avg.toFixed(1)}/5`,
      `방문 ${n.visitDate}`,
      `체크 ${n.checklist.filter((c) => c.done).length}/${n.checklist.length}`,
    ],
    popularity: score,
    interested: false,
    // 인스타 피드형 커버 — 첫 사진(있으면). 없으면 클라이언트에서 그라디언트 타일 폴백.
    coverUrl: n.photos?.[0] ?? null,
    // 실 단지 id를 찾은 경우에만 /complex/[id] 연결, 못 찾으면 링크 숨김 (mock-1로 보내지 않음)
    complexHref: complexHref ?? undefined,
  };
}

export default async function NotesFeedPage() {
  let notes: FeedNote[] = [];
  try {
    const rows = await listPublicNotes(50);
    // 아파트명(+지역)으로 complexes 실 id 조회 — 요청당 React cache로 중복 방지
    notes = await Promise.all(
      rows.map(async (n) =>
        toFeedNote(n, await resolveComplexHref(n.aptName, n.region)),
      ),
    );
  } catch {
    notes = [];
  }
  // 더미데이터 정책: 실데이터가 1건이라도 있으면 목업 보강 없이 실데이터만 노출.
  // 실데이터 0건일 때만 "예시" 표기가 붙은 목업 노출.
  if (notes.length === 0) {
    notes = MOCK_NOTES;
  }

  return <NotesFeedClient notes={notes} />;
}
