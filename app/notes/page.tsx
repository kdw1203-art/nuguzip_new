import { redirect } from "next/navigation";
import {
  listNotes,
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { NotesFeedClient, type FeedNote } from "./notes-feed-client";
import { resolveComplexHref } from "@/lib/newui/complex-link";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 시안 7a — 공개 임장노트 피드. 실데이터: inspection_notes(is_public) → listPublicNotes
   ?mine=1 — 세션 사용자의 노트(비공개 포함)를 서버에서 조회하는 내 노트 뷰.
   searchParams 분기 때문에 이 라우트는 동적 렌더(기존 revalidate=120 ISR 제거). */

export const metadata = buildPageMetadata({
  title: "임장노트",
  description:
    "직접 다녀온 사람이 남긴 공개 임장노트. 단지별 항목 점수와 현장 메모를 모아 봅니다.",
  path: "/notes",
});

export const dynamic = "force-dynamic";

/* 더미데이터 정책(더미 1개 원칙): 테스트용 샘플은 단 1건 —
   실데이터 0건일 때만 "예시" 배지와 함께 노출. 허수 지표(공감·댓글·저장 수) 없음. */
const MOCK_NOTES: FeedNote[] = [
  {
    id: "1",
    author: "관양동 이웃",
    meta: "예시",
    score: 78,
    scoreTone: "primary",
    title: "공작아파트 302동 84A",
    excerpt: "“오후 채광 좋음, 단지 뒤 도로 소음 약간. 주차는 저녁 이중주차…”",
    tags: [
      { label: "채광 좋음", tone: "pos" },
      { label: "초품아", tone: "pos" },
      { label: "이중주차", tone: "neg" },
    ],
    footer: [],
    popularity: 0,
    interested: true,
    // 사실 우선: 예시 카드는 존재하지 않는 단지(mock-1)로 링크하지 않음 (404 방지)
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

/* 파생 태그 — 작성자가 직접 입력한 축(입지·교통·시설)만 사용.
   학군·미래가치는 과거 만족도 슬라이더에서 파생되던 값이라 태그로 만들지 않는다. */
function deriveTags(n: InspectionNote): FeedNote["tags"] {
  const tags: FeedNote["tags"] = [];
  const s = n.scores;
  if (s.transport >= 4) tags.push({ label: "교통 좋음", tone: "pos" });
  if (s.location >= 4) tags.push({ label: "입지 좋음", tone: "pos" });
  if (s.facility <= 2) tags.push({ label: "시설 아쉬움", tone: "neg" });
  if (s.location > 0 && s.location <= 2)
    tags.push({ label: "입지 아쉬움", tone: "neg" });
  return tags.slice(0, 3);
}

function toFeedNote(
  n: InspectionNote,
  complexHref: string | null,
  opts?: { mine?: boolean },
): FeedNote {
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
    meta: opts?.mine
      ? `${n.isPublic ? "공개" : "비공개"} · ${relativeTime(n.createdAt)} · ${n.region}`
      : `${relativeTime(n.createdAt)} · ${n.region}`,
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
    region: n.region,
    // 인스타 피드형 커버 — 첫 사진(있으면). 없으면 클라이언트에서 그라디언트 타일 폴백.
    coverUrl: n.photos?.[0] ?? null,
    // 실 단지 id를 찾은 경우에만 /complex/[id] 연결, 못 찾으면 링크 숨김 (mock-1로 보내지 않음)
    complexHref: complexHref ?? undefined,
  };
}

export default async function NotesFeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const mine = sp.mine === "1";

  // 내 노트 뷰 — 세션 사용자의 노트(비공개 포함)를 동적 조회. 목업 보강 없음.
  if (mine) {
    const session = await safeAuth();
    const email = session?.user?.email ?? null;
    if (!email) {
      redirect(`/login?callbackUrl=${encodeURIComponent("/notes?mine=1")}`);
    }
    let notes: FeedNote[] = [];
    try {
      const rows = await listNotes(email);
      notes = await Promise.all(
        rows.map(async (n) =>
          toFeedNote(n, await resolveComplexHref(n.aptName, n.region), { mine: true }),
        ),
      );
    } catch {
      notes = [];
    }
    return <NotesFeedClient notes={notes} mine />;
  }

  let notes: FeedNote[] = [];
  let loadError: string | null = null;
  try {
    const rows = await listPublicNotes(50);
    // 아파트명(+지역)으로 complexes 실 id 조회 — 요청당 React cache로 중복 방지
    notes = await Promise.all(
      rows.map(async (n) =>
        toFeedNote(n, await resolveComplexHref(n.aptName, n.region)),
      ),
    );
  } catch (e) {
    /* 조회 실패를 빈 배열로 삼키면 아래 목업 보강이 작동해 "아직 공개된 노트가
       없어 샘플을 보여드려요" 가 뜬다 — DB 장애를 "노트가 없음" 으로 바꿔
       말하는 셈이다. 실패는 실패라고 화면에 적고, 목업도 붙이지 않는다. */
    loadError = e instanceof Error ? e.message : String(e);
    console.error("[/notes] 공개 임장노트 조회 실패:", loadError);
  }
  // 더미데이터 정책: 실데이터가 1건이라도 있으면 목업 보강 없이 실데이터만 노출.
  // 실데이터 0건일 때만 "예시" 표기가 붙은 목업 노출. (조회 실패 시에는 붙이지 않음)
  if (!loadError && notes.length === 0) {
    notes = MOCK_NOTES;
  }

  return <NotesFeedClient notes={notes} loadError={loadError} />;
}
