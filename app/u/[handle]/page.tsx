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
import { FollowButton } from "../../components/FollowButton";

/* 공개 프로필 · 팔로우 (/@닉네임 · ProfilePage 구조화 데이터 대상)
   실데이터(스키마 변경 없음, 읽기 전용):
   1) profiles.handle 일치(대소문자 무시 — lower unique)
   2) 없으면 profiles.full_name(닉네임) 일치 폴백
   프로필 매칭 시 해당 사용자의 공개 노트(inspection_notes · is_public)를 그리드에 표시.
   사실 우선: 등급·오차·배지·스토리·시리즈 등 산정 근거 없는 수치·라벨은 표시하지 않는다. */

export const dynamic = "force-dynamic";

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

/** profiles 조회: handle 일치(대소문자 무시) → full_name(닉네임) 폴백. env 미설정·오류 시 null */
const findProfile = cache(async (input: string): Promise<PublicProfile | null> => {
  const q = input.trim();
  if (!q) return null;
  try {
    const sb = getServiceSupabase();
    if (!sb) return null;
    const cols = "email, full_name, handle, region, bio";

    // 1) handle 일치 (lower unique — 대소문자 무시)
    const byHandle = await sb
      .from("profiles")
      .select(cols)
      .ilike("handle", escapeLike(q))
      .limit(1);
    let row = byHandle.error ? null : (byHandle.data?.[0] ?? null);

    // 2) nickname(full_name) 일치 폴백 — 대소문자 무시
    if (!row) {
      const byName = await sb
        .from("profiles")
        .select(cols)
        .ilike("full_name", escapeLike(q))
        .limit(1);
      row = byName.error ? null : (byName.data?.[0] ?? null);
    }
    if (!row) return null;
    return {
      email: String(row.email ?? ""),
      name: (row.full_name as string | null)?.trim() || q,
      handle: (row.handle as string | null)?.trim() || null,
      region: (row.region as string | null)?.trim() || null,
      bio: (row.bio as string | null)?.trim() || null,
    };
  } catch {
    return null;
  }
});

/** 프로필 사용자의 공개 노트 (author_email 기준 · is_public만) */
async function listAuthorPublicNotes(email: string): Promise<InspectionNote[]> {
  if (!email) return [];
  try {
    const rows = await listNotes(email);
    return rows.filter((n) => n.isPublic);
  } catch {
    return [];
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
  const profile = await findProfile(input);
  const name = profile?.name ?? resolveDisplayName(input);
  return {
    title: `${name}님의 임장 프로필 — 누구집`,
    description: `${name}님이 직접 다녀온 공개 임장노트를 모아 봅니다 — 누구집`,
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
  const profile = await findProfile(input);
  const displayName = profile?.name ?? resolveDisplayName(input);

  // 프로필 매칭 시 그 사용자의 공개 노트 · 미매칭 시 공개 노트 작성자 라벨 매칭 시도
  let authored: InspectionNote[] = [];
  if (profile) {
    authored = await listAuthorPublicNotes(profile.email);
  } else {
    try {
      const rows = await listPublicNotes(100);
      authored = rows.filter(
        (n) => (n.authorLabel ?? "").trim() === displayName,
      );
    } catch {
      authored = [];
    }
  }

  // P2-6: 프로필도 공개 노트도 없는 미존재 핸들 — 목업 폴백 대신 404 (SEO 안전)
  if (!profile && authored.length === 0) {
    notFound();
  }

  // 팔로워 수 실데이터 (user_follows) — 조회 실패 시 0
  const followEmail = profile?.email || authored[0]?.authorEmail || "";
  let followerCount = 0;
  try {
    followerCount = followEmail ? (await followCounts(followEmail)).followers : 0;
  } catch {
    followerCount = 0;
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
            <span className="h-[56px] w-[56px] shrink-0 rounded-full border-[3px] border-bg bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef]" />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-[6px]">
                <span className="text-[16px] font-extrabold text-ink">
                  {displayName}
                </span>
              </div>
              <div className="mt-[2px] text-[11px] text-text-3">
                nuguzip.com/@{handleLabel}
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
            <div className="rounded-[12px] border border-line bg-bg px-2 py-[10px] text-center">
              <div className="text-[16px] font-extrabold text-ink">
                {noteCount}
              </div>
              <div className="text-[10px] text-text-3">공개 노트</div>
            </div>
            <div className="rounded-[12px] border border-line bg-bg px-2 py-[10px] text-center">
              <div className="text-[16px] font-extrabold text-ink">
                {followerCount.toLocaleString("ko-KR")}
              </div>
              <div className="text-[10px] text-text-3">팔로워</div>
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
                  <span className="absolute inset-x-0 bottom-0 truncate bg-ink/70 px-2 py-1 text-[10px] font-bold text-white">
                    {g.title}
                  </span>
                  {i === grid.length - 1 && noteCount > grid.length && (
                    <span className="absolute right-[6px] top-[6px] rounded-[4px] bg-ink/85 px-[6px] py-[2px] text-[9px] font-extrabold text-white">
                      +{noteCount - grid.length}
                    </span>
                  )}
                </>
              );
              const cls =
                "relative block aspect-square overflow-hidden rounded-[10px] bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef]";
              return (
                <Link key={g.id} href={`/notes/${g.id}`} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>

        {/* 차단·숨기기 (22c #29) — 상대 미통지 */}
        <div className="rise-in-6 mt-5 text-center text-[11px] text-text-3">
          이 사용자 차단·숨기기 — 피드에서 제외되며 상대에게 알리지 않아요
        </div>
      </div>
    </PageShell>
  );
}
