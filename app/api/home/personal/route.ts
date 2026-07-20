import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { listNotes } from "@/lib/inspection/store-db";
import { countWatchlist } from "@/lib/watchlist/store-db";
import { loadMeProfile } from "@/lib/me/profile";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { loadNewHomeData, type HomeRegionCard } from "@/lib/newui/home-data";
import {
  getOnboardingPersonalization,
  resolveRegions,
  type OnboardingBudget,
  type PurposeId,
  type ResolvedRegion,
} from "@/lib/onboarding/personalization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* S13-13a 홈 이원화 — 로그인 개인화 데이터 (조회 실패 항목은 null, 허위값 금지)
   비로그인 홈(app/page.tsx)은 ISR 정적 캐시 유지 — 개인화는 이 라우트로 지연 주입 */

type PersonalRecentNote = {
  id: string;
  title: string;
  region: string;
  aptName: string | null;
  createdAt: string;
  /** 최근 노트의 미완료 체크리스트 개수 (없으면 null) */
  pendingChecklist: number | null;
};

export type PersonalHomeData = {
  nickname: string | null;
  plan: string | null;
  noteCount: number | null;
  recentNote: PersonalRecentNote | null;
  /** 비교 후보 수 (user_watchlist) */
  compareCount: number | null;
  /** 관심지역 한 줄 (app_users.primary_region) */
  primaryRegion: string | null;
  /** 관심지역 목록 (온보딩 개인화) */
  regions: string[] | null;
  /** 최근 노트 3건 기준 미완료 체크 항목 합계 */
  todoCount: number | null;
  /** #43 관심지역 기반 지역 시세 1건 — loadNewHomeData().regions 에서 관심지역명 매칭, 실패 시 null */
  regionMarket: HomeRegionCard | null;
  /** 온보딩 개인화 — 관심 지역(허브 링크 포함)·예산·목적. 미설정 시 null → CTA */
  preferences: {
    regions: ResolvedRegion[];
    budget: OnboardingBudget | null;
    purpose: PurposeId | null;
  } | null;
};

async function guarded<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** #43 관심지역명(예: "서울 마포구")과 홈 시세 카드(예: "마포구")를 매칭해 1건 반환 */
async function loadRegionMarket(
  targets: Array<string | null | undefined>,
): Promise<HomeRegionCard | null> {
  const wanted = targets
    .map((t) => (t ?? "").trim())
    .filter((t) => t.length > 0);
  if (wanted.length === 0) return null;
  const home = await loadNewHomeData();
  if (home.regions.length === 0) return null;
  for (const t of wanted) {
    const hit = home.regions.find(
      (r) => t.includes(r.name) || r.name.includes(t),
    );
    if (hit) return hit;
  }
  return null;
}

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const [profile, notes, compareCount, appUser, personalization] = await Promise.all([
    guarded(() =>
      loadMeProfile(email, {
        name: session.user?.name,
        plan: (session.user as { plan?: string }).plan,
        role: (session.user as { role?: string }).role,
      }),
    ),
    guarded(() => listNotes(email)),
    guarded(() => countWatchlist(email)),
    guarded(() => fetchAppUserByEmail(email)),
    guarded(() => getOnboardingPersonalization(email)),
  ]);

  const regions =
    personalization && personalization.regions.length > 0
      ? personalization.regions
      : null;

  const regionMarket = await guarded(() =>
    loadRegionMarket([profile?.primaryRegion, ...(regions ?? [])]),
  );

  const preferences = personalization
    ? {
        regions: resolveRegions(personalization.regions),
        budget: personalization.budget,
        purpose: personalization.purpose,
      }
    : null;

  const recent = notes && notes.length > 0 ? notes[0] : null;
  const pendingOf = (checklist: { done: boolean }[] | undefined | null) =>
    Array.isArray(checklist) ? checklist.filter((c) => !c.done).length : 0;

  const body: PersonalHomeData = {
    nickname: profile?.name ?? session.user?.name ?? null,
    plan: appUser?.plan ?? profile?.plan ?? null,
    noteCount: notes ? notes.length : null,
    recentNote: recent
      ? {
          id: recent.id,
          title: recent.title,
          region: recent.region,
          aptName: recent.aptName ?? null,
          createdAt: recent.createdAt,
          pendingChecklist: pendingOf(recent.checklist),
        }
      : null,
    compareCount: compareCount ?? null,
    primaryRegion: profile?.primaryRegion ?? null,
    regions,
    todoCount: notes
      ? notes.slice(0, 3).reduce((sum, n) => sum + pendingOf(n.checklist), 0)
      : null,
    regionMarket,
    preferences,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
