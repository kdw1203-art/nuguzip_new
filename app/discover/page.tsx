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
  {
    id: "mock-d2",
    title: "한가람 59, 신혼 눈높이 1차",
    aptName: "한가람아파트",
    region: "평촌동",
    author: "봄이네",
    saves: 38,
    visited: true,
    size: "short",
    ratings: [
      { icon: "☀", grade: "중" },
      { icon: "🔊", grade: "상" },
      { icon: "🅿", grade: "중" },
      { icon: "🚇", grade: "상" },
    ],
    createdAt: 0,
    isReal: false,
    complexHref: "/complex/mock-1",
  },
  {
    id: "mock-d3",
    title: "야간 소음 재확인 2차 — 은하수마을",
    aptName: "은하수마을",
    region: "관양동",
    author: "밤임장",
    saves: 96,
    visited: true,
    size: "mid",
    ratings: [
      { icon: "☀", grade: "중" },
      { icon: "🔊", grade: "하" },
      { icon: "🅿", grade: "중" },
      { icon: "🚇", grade: "중" },
    ],
    createdAt: 0,
    isReal: false,
    complexHref: "/complex/mock-1",
  },
  {
    id: "mock-d4",
    title: "학원가 도보 7분 실측 — 향촌현대",
    aptName: "향촌현대",
    region: "평촌동",
    author: "학군맘",
    saves: 152,
    visited: true,
    size: "mid",
    ratings: [
      { icon: "☀", grade: "상" },
      { icon: "🔊", grade: "중" },
      { icon: "🅿", grade: "중" },
      { icon: "🚇", grade: "상" },
    ],
    createdAt: 0,
    isReal: false,
    complexHref: "/complex/mock-1",
  },
  {
    id: "mock-d5",
    title: "관리비 실납부액 확인 — 목련우성",
    aptName: "목련우성",
    region: "평촌동",
    author: "가계부장",
    saves: 61,
    visited: false,
    size: "short",
    ratings: [
      { icon: "☀", grade: "중" },
      { icon: "🔊", grade: "중" },
      { icon: "🅿", grade: "상" },
      { icon: "🚇", grade: "중" },
    ],
    createdAt: 0,
    isReal: false,
    complexHref: "/complex/mock-1",
  },
  {
    id: "mock-d6",
    title: "역세권 전세 후보 비교 — 샛별한양",
    aptName: "샛별한양",
    region: "비산동",
    author: "전세유목민",
    saves: 87,
    visited: true,
    size: "tall",
    ratings: [
      { icon: "☀", grade: "중" },
      { icon: "🔊", grade: "중" },
      { icon: "🅿", grade: "하" },
      { icon: "🚇", grade: "상" },
    ],
    createdAt: 0,
    isReal: false,
    complexHref: "/complex/mock-1",
  },
  {
    id: "mock-d7",
    title: "유모차 동선은 후문만 가능 — 초원부영",
    aptName: "초원부영",
    region: "평촌동",
    author: "쌍둥이아빠",
    saves: 44,
    visited: true,
    size: "short",
    ratings: [
      { icon: "☀", grade: "상" },
      { icon: "🔊", grade: "상" },
      { icon: "🅿", grade: "중" },
      { icon: "🚇", grade: "하" },
    ],
    createdAt: 0,
    isReal: false,
    complexHref: "/complex/mock-1",
  },
  {
    id: "mock-d8",
    title: "리모델링 추진 현황 정리 — 귀인마을",
    aptName: "귀인마을현대",
    region: "평촌동",
    author: "임장러버",
    saves: 129,
    visited: false,
    size: "mid",
    ratings: [
      { icon: "☀", grade: "중" },
      { icon: "🔊", grade: "중" },
      { icon: "🅿", grade: "중" },
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
