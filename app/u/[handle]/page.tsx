import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PageShell } from "../../components/PageShell";
import {
  listNotes,
  listPublicNotes,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";
import { followCounts } from "@/lib/follows/store-db";
import { logger } from "@/lib/log";
import { FollowButton } from "../../components/FollowButton";
import { ErrorState } from "../../components/ui/EmptyState";

/* 공개 프로필 · 팔로우 (/@닉네임 · ProfilePage 구조화 데이터 대상)
   실데이터(스키마 변경 없음, 읽기 전용):
   1) profiles.handle 일치(대소문자 무시 — lower unique)
   2) 없으면 profiles.full_name(닉네임) 일치 폴백
   프로필 매칭 시 해당 사용자의 공개 노트(inspection_notes · is_public)를 그리드에 표시.
   사실 우선: 등급·오차·배지·스토리·시리즈 등 산정 근거 없는 수치·라벨은 표시하지 않는다. */

/* 비용 실측(2026-08-10): force-dynamic 이라 익명·크롤러 요청마다 오리진 함수가
   돌았다(x-vercel-cache: MISS, cache-control: private,no-store 실측). 이 화면의
   서버 렌더에는 사용자별 상태가 없다(auth·cookies 0건 — check-cache-policy 가
   회귀를 막는다). ISR 로 전환: 공개 프로필 — 사용자별 상태 없음(check-cache-policy 가 감시). 팔로워 수는 최대 15분 지연. */
export const revalidate = 900;
// 동적 세그먼트는 이게 없으면 "요청마다 서버 렌더"로 분류된다(2026-08 complex/[id] 실측)
export function generateStaticParams() {
  return [];
}

type PublicProfile = {
  email: string;
  name: string; // full_name = 서비스 닉네임
  handle: string | null;
  region: string | null;
  bio: string | null;
};

/** ilike 패턴 이스케이프 — %·_·\ 를 리터럴로 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/* 조회 실패를 null·[] 로 흘려보내면 아래 `!profile && authored.length === 0`
   가르마에서 notFound() 로 떨어진다 — 멀쩡히 존재하는 사람의 프로필에
   "그런 사용자는 없습니다"라고 답하는 화면이다. 못 읽은 것은 못 읽었다고
   구분해 두고, 404 대신 "지금은 불러올 수 없어요"를 그린다. */
type ProfileLookup =
  | { ok: true; profile: PublicProfile | null }
  | { ok: false; profile: null };

/** profiles 조회: handle 일치(대소문자 무시) → full_name(닉네임) 폴백. env 미설정 시 ok+null */
const findProfile = cache(async (input: string): Promise<ProfileLookup> => {
  const q = input.trim();
  if (!q) return { ok: true, profile: null };
  try {
    const sb = getServiceSupabase();
    if (!sb) return { ok: true, profile: null };
    const cols = "email, full_name, handle, region, bio";

    // 1) handle 일치 (lower unique — 대소문자 무시)
    const byHandle = await sb
      .from("profiles")
      .select(cols)
      .ilike("handle", escapeLike(q))
      .limit(1);
    if (byHandle.error) {
      logger.error(`[u/[handle]] profiles(handle) 조회 실패 (${q})`, byHandle.error);
      return { ok: false, profile: null };
    }
    let row = byHandle.data?.[0] ?? null;

    // 2) nickname(full_name) 일치 폴백 — 대소문자 무시
    if (!row) {
      const byName = await sb
        .from("profiles")
        .select(cols)
        .ilike("full_name", escapeLike(q))
        .limit(1);
      if (byName.error) {
        logger.error(`[u/[handle]] profiles(full_name) 조회 실패 (${q})`, byName.error);
        return { ok: false, profile: null };
      }
      row = byName.data?.[0] ?? null;
    }
    if (!row) return { ok: true, profile: null };
    return {
      ok: true,
      profile: {
        email: String(row.email ?? ""),
        name: (row.full_name as string | null)?.trim() || q,
        handle: (row.handle as string | null)?.trim() || null,
        region: (row.region as string | null)?.trim() || null,
        bio: (row.bio as string | null)?.trim() || null,
      },
    };
  } catch (e) {
    logger.error(`[u/[handle]] profiles 조회 실패 (${q})`, e);
    return { ok: false, profile: null };
  }
});

/** 프로필 사용자의 공개 노트 (author_email 기준 · is_public만) */
async function listAuthorPublicNotes(
  email: string,
): Promise<{ ok: boolean; notes: InspectionNote[] }> {
  if (!email) return { ok: true, notes: [] };
  try {
    const rows = await listNotes(email);
    return { ok: true, notes: rows.filter((n) => n.isPublic) };
  } catch (e) {
    logger.error(`[u/[handle]] 공개 노트 조회 실패 (${email})`, e);
    return { ok: false, notes: [] };
  }
}

type GridNote = { id: string; title: string };

function resolveDisplayName(rawInput: string): string {
  return rawInput;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle: rawHandle } = await params;
  const input = decodeURIComponent(rawHandle);
  const { profile } = await findProfile(input);
  const name = profile?.name ?? resolveDisplayName(input);
  return {
    title: `${name}님의 임장 프로필 — 내집나우`,
    description: `${name}님이 직접 다녀온 공개 임장노트를 모아 봅니다 — 내집나우`,
    // P2-10 색인 정책: 공개 프로필은 당분간 색인하지 않음
    robots: { index: false, follow: false },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: rawHandle } = await params;
  const input = decodeURIComponent(rawHandle);

  // 1) profiles.handle → 2) profiles.full_name(닉네임) 매칭
  const lookup = await findProfile(input);
  const profile = lookup.profile;
  const displayName = profile?.name ?? resolveDisplayName(input);
  let loadFailed = !lookup.ok;

  // 프로필 매칭 시 그 사용자의 공개 노트 · 미매칭 시 공개 노트 작성자 라벨 매칭 시도
  let authored: InspectionNote[] = [];
  if (profile) {
    const res = await listAuthorPublicNotes(profile.email);
    authored = res.notes;
    if (!res.ok) loadFailed = true;
  } else {
    try {
      const rows = await listPublicNotes(100);
      authored = rows.filter(
        (n) => (n.authorLabel ?? "").trim() === displayName,
      );
    } catch (e) {
      logger.error(`[u/[handle]] 공개 노트 목록 조회 실패 (${displayName})`, e);
      loadFailed = true;
    }
  }

  /* 조회가 실패해 아무것도 못 찾은 것을 404 로 답하면 "그런 사용자 없음"이 된다.
     못 읽었을 뿐이라고 말하고, 새로고침으로 되돌아올 수 있게 둔다. */
  if (!profile && authored.length === 0 && loadFailed) {
    return (
      <PageShell breadcrumb={`발견 › @${displayName}`}>
        <div className="mx-auto max-w-[640px] py-10">
          <ErrorState
            title="지금은 프로필을 불러올 수 없어요"
            desc="이 사용자가 없다는 뜻이 아니라, 조회 자체가 실패했다는 뜻입니다."
            cause="잠시 후 새로고침해 주세요."
          />
        </div>
      </PageShell>
    );
  }

  // P2-6: 프로필도 공개 노트도 없는 미존재 핸들 — 목업 폴백 대신 404 (SEO 안전)
  if (!profile && authored.length === 0) {
    notFound();
  }

  /* 팔로워 수 실데이터 (user_follows).
     조회에 실패하면 `0` 이 아니라 null 이다 — "팔로워 0명"은 사실 주장이고,
     못 셌다는 말과 바꿔 쓸 수 없다. 아래에서 null 은 "—"로 그린다.
     [2026-08-09 정정] 예전 주석은 "followEmail 없음 = 진짜 0" 이라고 적었는데
     틀렸다 — 익명 열람 경로에서는 author_email 이 가려져(20260806163853)
     이메일을 **못 읽는 것**이지 대상이 없는 게 아니다. 그동안 익명에게는
     팔로워가 있어도 0 으로 보였다. 못 읽으면 0 이 아니라 null(—) 이다. */
  const followEmail = profile?.email || authored[0]?.authorEmail || "";
  const followHidden = !followEmail; // 이메일이 가려져 셀 수 없는 경우 (실패와 구분)
  let followerCount: number | null = null;
  if (followEmail) {
    followerCount = await followCounts(followEmail).then(
      (c) => c.followers,
      (err: unknown) => {
        logger.error(`[u/[handle]] 팔로워 수 조회 실패 (${followEmail})`, err);
        return null;
      },
    );
  }

  const grid: GridNote[] = authored.slice(0, 6).map((n) => ({
    id: n.id,
    title: n.aptName?.trim() || n.title,
  }));
  const noteCount = authored.length;
  // 사실 우선: 지역·소개는 실데이터가 있을 때만 (허위 기본값 금지)
  const region = profile?.region || authored[0]?.region?.trim() || null;
  const handleLabel = profile?.handle ?? displayName;
  const bio = profile?.bio ?? null;

  return (
    <PageShell breadcrumb={`발견 › @${displayName}`}>
      <div className="mx-auto max-w-[640px]">
        {/* 커버 — 지적도 패턴 (14a) */}
        <div
          className="rise-in relative h-[110px] overflow-hidden rounded-t-[20px]"
          style={{ background: "linear-gradient(135deg,#1d4fd8,#16389c)" }}
        >
          <div
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg,#fff 1px, transparent 1px)",
              backgroundSize: "30px 22px, 36px 22px",
              transform: "rotate(-6deg) scale(1.3)",
            }}
          />
        </div>

        <div className="rise-in-2 card rounded-t-none border-t-0 px-5 pb-5">
          {/* 아바타 + 이름 + 팔로우 */}
          <div className="-mt-6 flex items-end gap-3">
            <span className="h-[56px] w-[56px] shrink-0 rounded-full border-[3px] border-bg bg-gradient-to-br from-line to-line-strong" />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-[6px]">
                <span className="text-[16px] font-extrabold text-ink">
                  {displayName}
                </span>
              </div>
              <div className="mt-[2px] text-[11px] text-text-3">
                naezipnow.com/@{handleLabel}
                {region ? ` · ${region}` : ""}
              </div>
            </div>
            {/* 팔로우 실배선 (user_follows) — 프로필 매칭 시에만, 미매칭은 로그인 유도 유지 */}
            {profile ? (
              <FollowButton handle={profile.handle ?? profile.name} />
            ) : (
              <Link
                href="/login"
                className="mb-1 shrink-0 rounded-full bg-primary px-4 py-[7px] text-[12px] font-bold text-white"
              >
                팔로우
              </Link>
            )}
          </div>

          {/* 소개 — 실데이터가 있을 때만 (허위 소개·태그 금지) */}
          {bio && (
            <p className="mt-3 text-[13px] leading-[1.6] text-text-1">{bio}</p>
          )}

          {/* 통계 2종 — 실데이터(공개 노트 수·팔로워)만 */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-[10px] border border-line bg-bg px-2 py-[10px] text-center">
              <div className="text-[16px] font-extrabold text-ink">
                {noteCount}
              </div>
              <div className="text-[10px] text-text-3">공개 노트</div>
            </div>
            <div className="rounded-[10px] border border-line bg-bg px-2 py-[10px] text-center">
              <div className="text-[16px] font-extrabold text-ink">
                {followerCount === null ? "—" : followerCount.toLocaleString("ko-KR")}
              </div>
              <div className="text-[10px] text-text-3">
                {followerCount === null
                  ? followHidden
                    ? "팔로워 (비공개)"
                    : "팔로워 (못 불러옴)"
                  : "팔로워"}
              </div>
            </div>
          </div>
        </div>

        {/* 노트 그리드 — 프로필 매칭 시 해당 사용자의 공개 노트 실데이터 */}
        <div className="rise-in-5 mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-[6px] text-[13px] font-extrabold text-ink">
              공개 노트
            </span>
            <Link href="/notes" className="text-[12px] font-bold text-primary">
              전체 보기 ›
            </Link>
          </div>
          {grid.length === 0 && (
            <div className="card px-5 py-8 text-center text-[12px] text-text-3">
              아직 공개한 임장노트가 없어요
            </div>
          )}
          <div className="grid grid-cols-3 gap-[6px]">
            {grid.map((g, i) => {
              const inner = (
                <>
                  <span className="absolute inset-x-0 bottom-0 truncate bg-brand-navy/70 px-2 py-1 text-[10px] font-bold text-surface">
                    {g.title}
                  </span>
                  {i === grid.length - 1 && noteCount > grid.length && (
                    <span className="absolute right-[6px] top-[6px] rounded-[4px] bg-brand-navy/85 chip-pad-tight text-[9px] font-extrabold text-surface">
                      +{noteCount - grid.length}
                    </span>
                  )}
                </>
              );
              const cls =
                "relative block aspect-square overflow-hidden rounded-[10px] bg-gradient-to-br from-line to-line-strong";
              return (
                <Link key={g.id} href={`/notes/${g.id}`} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>

        {/* 차단·숨기기 안내문을 지웠다. "이 사용자 차단·숨기기 — 피드에서 제외되며
            상대에게 알리지 않아요" 라고 적혀 있었는데, 두 가지가 사실이 아니었다:
            (1) 이 화면에는 차단할 수 있는 컨트롤이 없다(문구뿐이다),
            (2) 차단 기능 자체는 모임 채팅방 안에만 있고(/api/chat/blocks) 동네이야기
                피드는 차단 목록을 전혀 보지 않는다 — "피드에서 제외" 는 일어나지 않는다.
            사용자 단위 차단이 실제로 생기면 그때 버튼과 함께 다시 적는다. */}
      </div>
    </PageShell>
  );
}
