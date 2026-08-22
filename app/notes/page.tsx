import { redirect } from "next/navigation";
import {
  listNotes,
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { listAlertSubscriptions } from "@/lib/alerts/subscriptions";
import { NotesFeedClient, type FeedNote } from "./notes-feed-client";
import { complexHrefKey, resolveComplexHrefs } from "@/lib/newui/complex-link";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 시안 7a — 공개 임장노트 피드. 실데이터: inspection_notes(is_public) → listPublicNotes
   ?mine=1 — 세션 사용자의 노트(비공개 포함)를 서버에서 조회하는 내 노트 뷰.
   searchParams 분기 때문에 이 라우트는 동적 렌더(기존 revalidate=120 ISR 제거). */

export const metadata = buildPageMetadata({
  title: "임장노트",
  description:
    "직접 다녀온 사람이 남긴 공개 임장노트. 단지별 항목 점수와 현장 메모를 모아 봅니다.",
  path: "/notes",
  og: { badge: "임장노트", sub: "직접 걸어본 사람들의 공개 기록" },
});

export const dynamic = "force-dynamic";

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

/* 노트 지역 ↔ 구독 지역 매칭.
   구독값은 "서울" 처럼 넓게도, "안양시 동안구" 처럼 좁게도 들어오고 노트의 region 은
   "경기 안양시 동안구 관양동" 같은 전체 주소라, 공백을 지운 뒤 양방향 부분 포함으로 본다. */
function matchesInterest(region: string | null | undefined, interests: string[]): boolean {
  const r = (region ?? "").replace(/\s+/g, "");
  if (!r || interests.length === 0) return false;
  return interests.some((raw) => {
    const v = raw.replace(/\s+/g, "");
    return v.length > 0 && (r.includes(v) || v.includes(r));
  });
}

function toFeedNote(
  n: InspectionNote,
  complexHref: string | null,
  opts?: { mine?: boolean; interestRegions?: string[] },
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
      `자가체크 ${avg.toFixed(1)}/5`,
      `방문 ${n.visitDate}`,
      `체크 ${n.checklist.filter((c) => c.done).length}/${n.checklist.length}`,
    ],
    /* 전에는 모든 실노트에 interested:false 를 박아 넣어서 "내 관심 지역" 칩이
       구조적으로 0건만 돌려주고 "해당 필터에 맞는 노트가 아직 없어요"라고 말했다.
       이제 사용자의 실제 지역 알림 구독(listAlertSubscriptions)과 대조해 판정한다. */
    interested: matchesInterest(n.region, opts?.interestRegions ?? []),
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

  /* "내 관심 지역" 필터의 판정 근거 — 지역 알림 구독(user_watchlist 의 alert:region 행).
     구독 지역이 하나도 없으면(비로그인 포함) 그 칩은 무엇을 눌러도 0건이므로
     아예 렌더하지 않는다. 항상 빈 결과인 필터를 남겨 두면 "노트가 없다"는 거짓말이 된다. */
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  let interestRegions: string[] = [];
  if (email) {
    try {
      interestRegions = (await listAlertSubscriptions(email))
        .filter((s) => s.type === "region")
        .map((s) => s.value);
    } catch (e) {
      // 구독 조회 실패 — 칩을 숨겨 "관심 지역에 노트가 없다"고 단정하지 않는다
      console.error("[/notes] 관심 지역 구독 조회 실패:", e);
      interestRegions = [];
    }
  }

  // 내 노트 뷰 — 세션 사용자의 노트(비공개 포함)를 동적 조회. 목업 보강 없음.
  if (mine) {
    if (!email) {
      redirect(`/login?callbackUrl=${encodeURIComponent("/notes?mine=1")}`);
    }
    let notes: FeedNote[] = [];
    let mineError: string | null = null;
    try {
      const rows = await listNotes(email);
      /* 동시 상한 + 마감이 있는 일괄 해석 — 항목마다 동시 DB 왕복을 내던
         N+1 을 접는다(/qna 와 같은 판단, resolveComplexHrefs 주석 참고). */
      const hrefs = await resolveComplexHrefs(
        rows.map((n) => ({ name: n.aptName, region: n.region })),
      );
      notes = rows.map((n) =>
        toFeedNote(n, hrefs.get(complexHrefKey(n.aptName, n.region)) ?? null, {
          mine: true,
          interestRegions,
        }),
      );
    } catch (e) {
      /* 빈 배열로 삼키면 "아직 쓴 노트가 없어요"가 뜬다 — 내가 쓴 기록이
         사라진 것처럼 보이는 화면이다. 공개 피드와 같은 방식으로 실패를 적는다. */
      mineError = e instanceof Error ? e.message : String(e);
      console.error("[/notes?mine=1] 내 임장노트 조회 실패:", mineError);
    }
    return (
      <NotesFeedClient
        notes={notes}
        loadError={mineError}
        mine
        showInterestFilter={interestRegions.length > 0}
      />
    );
  }

  let notes: FeedNote[] = [];
  let loadError: string | null = null;
  try {
    const rows = await listPublicNotes(50);
    // 아파트명(+지역)으로 complexes 실 id 조회 — 중복 접기 + 동시 4개 + 3초 마감
    const hrefs = await resolveComplexHrefs(
      rows.map((n) => ({ name: n.aptName, region: n.region })),
    );
    notes = rows.map((n) =>
      toFeedNote(n, hrefs.get(complexHrefKey(n.aptName, n.region)) ?? null, {
        interestRegions,
      }),
    );
  } catch (e) {
    /* 조회 실패를 빈 배열로 삼키면 아래 목업 보강이 작동해 "아직 공개된 노트가
       없어 샘플을 보여드려요" 가 뜬다 — DB 장애를 "노트가 없음" 으로 바꿔
       말하는 셈이다. 실패는 실패라고 화면에 적고, 목업도 붙이지 않는다. */
    loadError = e instanceof Error ? e.message : String(e);
    console.error("[/notes] 공개 임장노트 조회 실패:", loadError);
  }
  /* 콜드스타트: 공작아파트 예시 카드를 넣지 않는다.
     0건이면 NotesFeedClient 의 empty+CTA(노트 쓰기 / 지도)로 정직하게 안내한다. */

  return (
    <NotesFeedClient
      notes={notes}
      loadError={loadError}
      showInterestFilter={interestRegions.length > 0}
    />
  );
}
