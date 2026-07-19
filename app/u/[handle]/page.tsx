import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { HoloAvatar, TopScoutBadge } from "../../components/TopScoutBadge";
import {
  listPublicNotes,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";

/* 시안 22c — 공개 프로필 · 팔로우 (/@닉네임 · ProfilePage 구조화 데이터 대상)
   실데이터(#36, 스키마 변경 없음): listPublicNotes 작성자 라벨 + profiles.nickname(읽기 전용) 매칭.
   매칭 실패 시 404 대신 "프로필을 찾을 수 없어요" 빈 상태 → 발견 피드 안내 */

export const dynamic = "force-dynamic";

/** profiles 테이블 nickname 일치 여부 (읽기 전용 · 테이블 없거나 env 미설정 시 false) */
async function matchProfileNickname(nickname: string): Promise<boolean> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return false;
    const { data, error } = await sb
      .from("profiles")
      .select("nickname")
      .eq("nickname", nickname)
      .maybeSingle();
    if (error || !data) return false;
    return true;
  } catch {
    return false;
  }
}

/** 피드 목업 카드에 등장하는 작성자 핸들 — 목업 카드에서의 진입만 목업 프로필 유지 */
const MOCK_HANDLES = new Set([
  "임장러버",
  "봄이네",
  "밤임장",
  "학군맘",
  "가계부장",
  "전세유목민",
  "쌍둥이아빠",
  "관양동 이웃",
  "마포 이웃",
  "과천 이웃",
]);

type GridNote = { id: string; title: string; isReal: boolean };

const MOCK_GRID: GridNote[] = [
  { id: "g1", title: "공작 302동 3차", isReal: false },
  { id: "g2", title: "한가람 59 저녁 재방문", isReal: false },
  { id: "g3", title: "은하수마을 주차 실측", isReal: false },
  { id: "g4", title: "목련우성 관리비 정리", isReal: false },
  { id: "g5", title: "귀인마을 학군 동선", isReal: false },
  { id: "g6", title: "샛별한양 전세 후보", isReal: false },
];

/* 22b #15 — 시리즈 묶기 목업 */
const SERIES = [
  { title: "공작아파트 정복기", progress: "3/5편", saves: 214 },
  { title: "평촌 학원가 도보 실측", progress: "2/4편", saves: 96 },
];

/* 22b #13 — 임장 스토리 (세로 스와이프 뷰) 목업 */
const STORIES = ["공작 302동", "한가람", "은하수", "귀인마을"];

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle);

  // 목업 기준: "임장러버"가 탑 임장러 (23c 배지 위계 최상위)
  const isTopScout = handle === "임장러버" || handle === "mock-1";
  const displayName = handle === "mock-1" ? "임장러버" : handle;

  let authored: InspectionNote[] = [];
  try {
    const rows = await listPublicNotes(100);
    authored = rows.filter(
      (n) => (n.authorLabel ?? "").trim() === displayName,
    );
  } catch {
    authored = [];
  }

  // 노트 작성자 라벨에 없으면 profiles.nickname과도 매칭 시도 (읽기 전용)
  const profileMatched =
    authored.length === 0 && (await matchProfileNickname(displayName));
  const isMockHandle = handle === "mock-1" || MOCK_HANDLES.has(displayName);

  // 매칭 실패 — 404 대신 빈 상태 + 발견 피드 안내
  if (authored.length === 0 && !profileMatched && !isMockHandle) {
    return (
      <PageShell breadcrumb={`발견 › @${displayName}`}>
        <div className="mx-auto max-w-[640px]">
          <div className="rise-in card flex flex-col items-center gap-2 px-5 py-12 text-center">
            <div className="text-[26px]">👤</div>
            <div className="text-[15px] font-extrabold text-ink">
              프로필을 찾을 수 없어요
            </div>
            <div className="text-[12px] leading-[1.6] text-text-3">
              @{displayName} 님의 공개 프로필이 아직 없거나
              <br />
              닉네임이 바뀌었을 수 있어요
            </div>
            <Link href="/discover" className="btn-primary btn-md mt-2">
              발견 피드 둘러보기
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const grid: GridNote[] =
    authored.length > 0
      ? authored.slice(0, 6).map((n) => ({
          id: n.id,
          title: n.aptName?.trim() || n.title,
          isReal: true,
        }))
      : isMockHandle
        ? MOCK_GRID
        : []; // 실 프로필(닉네임 매칭)인데 공개 노트 0건 — 목업 그리드로 채우지 않음
  const noteCount =
    authored.length > 0 ? authored.length : isMockHandle ? 47 : 0;
  const region =
    authored[0]?.region?.trim() || "관양동·평촌";

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
            {isTopScout ? (
              <span className="rounded-full border-[3px] border-bg">
                <HoloAvatar size={56} label={`${displayName} — 탑 임장러`} />
              </span>
            ) : (
              <span className="h-[56px] w-[56px] shrink-0 rounded-full border-[3px] border-bg bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef]" />
            )}
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-[6px]">
                <span className="text-[16px] font-extrabold text-ink">
                  {displayName}
                </span>
                <span className="rounded-[5px] bg-primary-soft px-[7px] py-[2px] text-[10px] font-extrabold text-primary">
                  로컬 전문가 Lv.3
                </span>
                {isTopScout && <TopScoutBadge />}
              </div>
              <div className="mt-[2px] text-[11px] text-text-3">
                nuguzip.com/@{displayName} · {region}
              </div>
            </div>
            {/* 팔로우 미연결 — 클릭 시 로그인 유도 (22c #22) */}
            <Link
              href="/login"
              className="mb-1 shrink-0 rounded-full bg-primary px-4 py-[7px] text-[12px] font-bold text-white"
            >
              팔로우
            </Link>
          </div>

          {/* 소개 + 테마 태그 (22c #24) */}
          <p className="mt-3 text-[13px] leading-[1.6] text-text-1">
            아이 둘, 학군 중심으로 봅니다. 주차·소음은 꼭 저녁에 재확인해요.{" "}
            <span className="font-bold text-primary">#학군 #구축리모델링</span>
          </p>

          {/* 통계 3종 */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-[12px] border border-line bg-bg px-2 py-[10px] text-center">
              <div className="text-[16px] font-extrabold text-ink">
                {noteCount}
              </div>
              <div className="text-[10px] text-text-3">공개 노트</div>
            </div>
            <div className="rounded-[12px] border border-line bg-bg px-2 py-[10px] text-center">
              <div className="text-[16px] font-extrabold text-ink">1,204</div>
              <div className="text-[10px] text-text-3">팔로워</div>
            </div>
            <div className="rounded-[12px] border border-line bg-bg px-2 py-[10px] text-center">
              <div className="text-[16px] font-extrabold text-[#1a7f4e]">
                3.2%
              </div>
              <div className="text-[10px] text-text-3">예상 오차</div>
            </div>
          </div>

          {/* 배지 진열장 (22c #25) */}
          <div className="mt-3 flex flex-wrap gap-[5px]">
            <span className="rounded-full border border-line bg-surface px-[9px] py-1 text-[10px] font-bold text-[#946200]">
              🏆 6월 베스트
            </span>
            <span className="rounded-full border border-line bg-surface px-[9px] py-1 text-[10px] font-bold text-text-1">
              🔥 12주 연속
            </span>
            <span className="rounded-full border border-line bg-surface px-[9px] py-1 text-[10px] font-bold text-text-1">
              앰배서더
            </span>
          </div>
        </div>

        {/* 임장 스토리 (목업) */}
        <div className="rise-in-3 mt-4">
          <div className="mb-2 text-[13px] font-extrabold text-ink">
            임장 스토리
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {STORIES.map((s) => (
              <div key={s} className="flex w-[64px] shrink-0 flex-col items-center gap-1">
                <span className="h-[56px] w-[56px] rounded-full border-2 border-primary bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef] p-[2px]" />
                <span className="w-full truncate text-center text-[10px] text-text-2">
                  {s}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 시리즈 (목업) */}
        <div className="rise-in-4 mt-4">
          <div className="mb-2 text-[13px] font-extrabold text-ink">시리즈</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {SERIES.map((s) => (
              <div
                key={s.title}
                className="card card-hover flex items-center justify-between px-4 py-3"
              >
                <div>
                  <div className="text-[13px] font-extrabold text-ink">
                    {s.title}
                  </div>
                  <div className="mt-[2px] text-[11px] text-text-3">
                    {s.progress} · 🔖 {s.saves}
                  </div>
                </div>
                <span className="text-[12px] font-bold text-primary">
                  보기 ›
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 노트 그리드 (22c #26) */}
        <div className="rise-in-5 mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-ink">
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
              return g.isReal ? (
                <Link key={g.id} href={`/notes/${g.id}`} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div key={g.id} className={cls}>
                  {inner}
                </div>
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
