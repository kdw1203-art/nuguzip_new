import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { NotesFeedClient, type FeedNote } from "./notes-feed-client";

/* 시안 7a — 공개 임장노트 피드. 실데이터: inspection_notes(is_public) → listPublicNotes */

export const dynamic = "force-dynamic";

const MOCK_NOTES: FeedNote[] = [
  {
    id: "1",
    author: "관양동 이웃",
    meta: "2시간 전 · 3번째 방문",
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
  },
  {
    id: "2",
    author: "마포 이웃",
    meta: "5시간 전 · 첫 방문",
    score: 82,
    scoreTone: "primary",
    title: "마포래미안 115동 59A",
    excerpt: "“역까지 실측 도보 7분. 커뮤니티 시설이 기대 이상, 관리비는…”",
    tags: [
      { label: "역세권", tone: "pos" },
      { label: "커뮤니티", tone: "pos" },
    ],
    footer: ["공감 24", "댓글 11", "저장 19"],
    popularity: 24,
    interested: false,
  },
  {
    id: "3",
    author: "과천 이웃",
    meta: "어제 · 2번째 방문",
    score: 64,
    scoreTone: "muted",
    title: "과천 위버필드 204동",
    excerpt: "“경사가 생각보다 심함. 유모차 동선은 후문 쪽만 가능…”",
    tags: [
      { label: "경사 심함", tone: "neg" },
      { label: "신축감", tone: "pos" },
    ],
    footer: ["공감 7", "댓글 3", "저장 4"],
    popularity: 7,
    interested: true,
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

function toFeedNote(n: InspectionNote): FeedNote {
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
  };
}

export default async function NotesFeedPage() {
  let notes: FeedNote[] = [];
  try {
    const rows = await listPublicNotes(50);
    notes = rows.map(toFeedNote);
  } catch {
    notes = [];
  }
  // 공개 노트가 없거나 부족하면 목업 카드로 보강 (실데이터 우선 노출)
  if (notes.length === 0) {
    notes = MOCK_NOTES;
  } else if (notes.length < 3) {
    const ids = new Set(notes.map((n) => n.id));
    notes = [...notes, ...MOCK_NOTES.filter((m) => !ids.has(m.id))];
  }

  return <NotesFeedClient notes={notes} />;
}
