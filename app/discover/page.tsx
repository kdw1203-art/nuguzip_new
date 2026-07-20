import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { DiscoverClient, type DiscoverCard } from "./discover-client";
import { resolveComplexHref } from "@/lib/newui/complex-link";

/* 시안 22a — 발견 피드 "오늘의 임장" (하단 내비 2번째 슬롯 · 비로그인 열람 허용)
   실데이터: inspection_notes(is_public) → listPublicNotes, 0건일 때만 예시 목업 */

export const revalidate = 120;

/* 더미데이터 정책(더미 1개 원칙): 테스트용 샘플은 단 1건 — "예시" 배지와 함께
   실데이터 0건일 때만 노출 */
const MOCK_CARDS: DiscoverCard[] = [
  {
    id: "mock-d1",
    title: "채광은 확실, 주차가 관건 — 공작 302동",
    aptName: "공작아파트",
    region: "관양동",
    author: "임장러버",
    saves: 214,
    visited: true,
    size: "tall",
    ratings: [
      { icon: "☀", grade: "상" },
      { icon: "🔊", grade: "중" },
      { icon: "🅿", grade: "하" },
      { icon: "🚇", grade: "상" },
    ],
    createdAt: 0,
    isReal: false,
    complexHref: "/complex/mock-1",
  },
];

function grade(v: number): "상" | "중" | "하" {
  if (v >= 4) return "상";
  if (v >= 3) return "중";
  return "하";
}

function maskAuthor(n: InspectionNote): string {
  if (n.authorLabel && n.authorLabel.trim()) return n.authorLabel.trim();
  const local = n.authorEmail.split("@")[0] ?? "이웃";
  return `${local.slice(0, 2) || "이웃"}** 이웃`;
}

const SIZES: DiscoverCard["size"][] = ["tall", "short", "mid", "short", "mid", "tall"];

function toCard(
  n: InspectionNote,
  i: number,
  complexHref: string | null,
): DiscoverCard {
  const oneLiner =
    n.summary?.trim() || n.sections.pros?.trim() || n.title;
  return {
    id: n.id,
    title: oneLiner.length > 34 ? `${oneLiner.slice(0, 34)}…` : oneLiner,
    aptName: n.aptName?.trim() || null,
    region: n.region,
    author: maskAuthor(n),
    saves: Math.round(inspectionAverageScore(n.scores) * 40) + (n.checklist.filter((c) => c.done).length || 0),
    visited: Boolean(n.visitDate),
    size: SIZES[i % SIZES.length],
    ratings: [
      { icon: "☀", grade: grade(n.scores.location) },
      { icon: "🔊", grade: grade(n.scores.school) },
      { icon: "🅿", grade: grade(n.scores.facility) },
      { icon: "🚇", grade: grade(n.scores.transport) },
    ],
    createdAt: Date.parse(n.createdAt) || 0,
    isReal: true,
    // 실 단지 id를 찾은 경우에만 /complex/[id], 못 찾으면 null → 링크 숨김 (mock-1로 보내지 않음)
    complexHref,
  };
}

export default async function DiscoverPage() {
  let cards: DiscoverCard[] = [];
  try {
    const rows = await listPublicNotes(40);
    // 아파트명(+지역)으로 complexes 실 id 조회 — 요청당 React cache로 중복 방지
    cards = await Promise.all(
      rows.map(async (n, i) =>
        toCard(n, i, await resolveComplexHref(n.aptName, n.region)),
      ),
    );
  } catch {
    cards = [];
  }
  // 더미데이터 정책: 실데이터가 1건이라도 있으면 목업 보강 없이 실데이터만 노출.
  // 실데이터 0건일 때만 목업(카드에 "예시" 라벨 표시, isReal=false) 노출.
  if (cards.length === 0) {
    cards = MOCK_CARDS;
  }

  return <DiscoverClient cards={cards} />;
}
