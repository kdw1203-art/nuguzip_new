import type { Metadata } from "next";
import Link from "next/link";
import { getMeeting } from "@/lib/meetings/store-db";
import { findImjangRegionForLabel } from "@/lib/imjang/guide";
import { safeAuth } from "@/lib/safe-auth";
import { PageShell } from "../../../components/PageShell";
import { ShareButton } from "./ShareButton";
import { LocationMap } from "../../LocationMap";
import { Icon } from "@/app/components/Icon";

/* 시안 8o(모임 상세) 고도화 — 모임 정보 카드(일정·장소·정원·참여자) + 공유 +
   참여 상태별 CTA. "채팅방 입장"은 /town/groups/[id]/chat 로 분리(실채팅 유지). */

export const dynamic = "force-dynamic";

/* 동적 metadata — 예전에는 제목·설명이 루트 기본값으로 나가 공유·검색에서 모든
   모임이 똑같이 보였다. 실제 모임명·지역을 제목에 싣는다.
   + 네이버 SEO 가이드 반영(2026-08-16): 없는 모임·조회 실패의 "찾을 수 없어요"
   화면에는 noindex 를 단다 — 빈 안내 문서가 색인 가능한 상태로 수집되고 있었다
   (가이드의 불용문서 케이스). HTTP 상태는 상위 loading.tsx 스트리밍이 200 을
   먼저 커밋해 notFound() 로도 404 로 바꿀 수 없음을 실측 확인 — 완전한
   소프트404 해소는 loading 경계 위 존재확인이 필요한 구조 변경(워크오더).
   실재 모임은 색인 허용(원안 유지). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meeting = await getMeeting(id).catch(() => null);
  if (!meeting) {
    return {
      title: "임장 모임 | 내집나우",
      robots: { index: false, follow: false },
    };
  }
  const region = meeting.region || "";
  const title = `${meeting.title}${region ? ` · ${region}` : ""} 임장 모임 | 내집나우`;
  const desc =
    (meeting.description || "같은 단지를 함께 돌아볼 이웃을 찾는 임장 모임입니다.")
      .replace(/\s+/g, " ")
      .slice(0, 150);
  return {
    title,
    description: desc,
    openGraph: { title, description: desc },
  };
}

function formatSchedule(iso: string | null): string {
  if (!iso) return "일정 미정";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "일정 미정";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TownGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /* 이 모임이 이 페이지의 존재 이유다. 예전에는 `.catch(() => null)` 로 조회
     실패를 삼켜서 "모임을 찾을 수 없어요"(삭제된 모임과 똑같은 화면)를 200 으로
     내보냈다. 못 읽은 것과 없는 것은 다른 사실이다 — 조회가 실패하면 던져서
     5xx("지금은 못 준다")가 되게 두고, 아래 안내 화면은 **정말로 없을 때만**
     그린다. 세션은 곁다리라 실패해도 비로그인으로 계속 그린다. */
  const [meeting, session] = await Promise.all([getMeeting(id), safeAuth()]);

  if (!meeting) {
    return (
      <PageShell breadcrumb="동네이야기 › 임장 모임">
        <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 py-20 text-center">
          <div className="text-[19px] font-extrabold text-ink">모임을 찾을 수 없어요</div>
          <p className="text-[13px] leading-[1.6] text-text-2">
            삭제되었거나 잘못된 링크일 수 있어요.
          </p>
          <Link
            href="/town/groups"
            className="btn-primary rounded-xl px-5 py-2.5 text-[13px] no-underline"
          >
            모임 목록으로
          </Link>
        </div>
      </PageShell>
    );
  }

  /* 크루 도구(전략 §5 회로 4) — 모임 지역이 임장 가이드 지역과 맞으면 잇는다.
     곁다리 강화라 실패는 삼키고 링크만 생략한다(모임 본문 존재 판정과 무관). */
  const imjangRegion = meeting.region
    ? await findImjangRegionForLabel(meeting.region).catch(() => null)
    : null;

  const myEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  const remaining = meeting.maxMembers - meeting.currentMembers;
  const isFull = remaining <= 0;
  /* [2026-08-22] 지난 모임 판정 — 목록(GroupsClient.deriveStatus)은 날짜를 보고
     "일정 종료"라고 말하는데 이 상세는 정원만 봐서, 어제 끝난 모임이 "모집 중 ·
     참여하기"로 나갔다(목록 주석이 금지한 바로 그 화면). 같은 판정을 쓴다. */
  const scheduledTs = Date.parse(meeting.scheduledAt ?? "");
  const isPast = Number.isFinite(scheduledTs) && scheduledTs < Date.now();
  const statusLabel = isPast
    ? "일정 종료"
    : isFull
      ? "모집 마감"
      : remaining <= 1
        ? "마감 임박"
        : "모집 중";
  const statusStyle =
    isPast || isFull
      ? "bg-bg text-text-3"
      : remaining <= 1
        ? "bg-warning-soft text-warning"
        : "bg-primary-soft text-primary";
  const isOrganizer = myEmail !== null && meeting.organizerEmail?.trim().toLowerCase() === myEmail;
  const fillPct = Math.min(100, Math.round((meeting.currentMembers / Math.max(1, meeting.maxMembers)) * 100));

  return (
    <PageShell breadcrumb="동네이야기 › 임장 모임">
      <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        {/* ---------- 모임 정보 카드 ---------- */}
        <div className="flex flex-col gap-4">
          <div className="rise-in card flex flex-col gap-3 rounded-[18px] p-6">
            <div className="flex items-center justify-between">
              <span className={`rounded-md chip-pad text-[12px] font-extrabold ${statusStyle}`}>
                {statusLabel} {meeting.currentMembers}/{meeting.maxMembers}
              </span>
              <span className="text-[12px] text-text-3">
                {meeting.category}
                {meeting.fee > 0 ? ` · 참가비 ${meeting.fee.toLocaleString("ko-KR")}원` : " · 무료"}
              </span>
            </div>

            <h1 className="text-[21px] font-extrabold leading-[1.35] text-ink">{meeting.title}</h1>

            <div className="flex flex-col gap-2 text-[13px] text-text-1">
              <div className="flex gap-2">
                <span className="w-5 text-center"><Icon name="📅" size={16} className="inline align-middle" /></span>
                <span>{formatSchedule(meeting.scheduledAt)}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-5 text-center"><Icon name="📍" size={16} className="inline align-middle" /></span>
                <span>{meeting.region || [meeting.city, meeting.district].filter(Boolean).join(" ") || "장소 미정"}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-5 text-center"><Icon name="👤" size={16} className="inline align-middle" /></span>
                <span>모임장 · {meeting.organizerLabel || meeting.hostLabel}</span>
              </div>
              {meeting.checklist.length > 0 && (
                <div className="flex gap-2">
                  <span className="w-5 text-center"><Icon name="🚶" size={16} className="inline align-middle" /></span>
                  <span>{meeting.checklist.slice(0, 4).join(" → ")}</span>
                </div>
              )}
            </div>

            {meeting.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {meeting.tags.slice(0, 6).map((t) => (
                  <span key={t} className="rounded-full bg-bg px-2.5 py-1 text-[12px] text-text-2">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <p className="whitespace-pre-wrap rounded-xl bg-bg px-4 py-3.5 text-[13px] leading-[1.7] text-text-2">
              {meeting.description || "모임 소개가 아직 없어요."}
            </p>
          </div>

          {/* 참여자 카드 */}
          <div className="rise-in-1 card flex flex-col gap-3 rounded-[18px] p-5">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-extrabold text-ink">
                참여자 {meeting.currentMembers}
                <span className="text-text-3"> / {meeting.maxMembers}</span>
              </div>
              <div className="text-[12px] text-text-3">{isFull ? "정원이 찼어요" : `${remaining}자리 남음`}</div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full bg-primary" style={{ width: `${fillPct}%` }} />
            </div>
            {/* 목록(/town/groups)에서 같은 이유로 이미 걷어낸 가짜 아바타 원을 여기서도
                지운다. 참여자 프로필을 읽지 않고 색만 다른 원을 currentMembers 수만큼
                그리던 것이라, 정원이 0명일 때도 원이 하나 떠서 "누군가 있다"고 보였다.
                실제로 아는 사실은 인원수뿐이므로 인원수만 남긴다. */}
            <p className="text-[12px] leading-[1.5] text-text-3">
              참여 확정 시 채팅방에서 멤버들과 일정·체크리스트를 나눌 수 있어요 · 연락처는 공개되지 않아요
            </p>
          </div>
        </div>

        {/* ---------- 사이드: 위치 + 공유 + CTA ---------- */}
        <div className="flex flex-col gap-3">
          <div className="rise-in-1 card flex flex-col gap-2 rounded-[18px] p-5">
            <div className="text-[13px] font-extrabold text-ink">모임 장소</div>
            {/* 지역명을 좌표로 해석해 네이버 지도로 표시(정확 집결지는 채팅방 안내) */}
            <LocationMap
              region={meeting.region}
              city={meeting.city}
              district={meeting.district}
              label={meeting.region || meeting.city || "모임 장소"}
            />
            <p className="text-[12px] leading-[1.5] text-text-3">
              지역 기준 지도예요 · 정확한 집결 장소는 모임 채팅방에서 안내돼요.
            </p>
          </div>

          {/* 크루 도구 — 답사 전 준비를 내집나우 안에서 끝내게 한다 */}
          <div className="rise-in-1 card flex flex-col gap-2 rounded-[18px] p-5">
            <div className="text-[13px] font-extrabold text-ink">임장 준비</div>
            <p className="text-[12px] leading-[1.6] text-text-2">
              가기 전에 데이터 브리핑과 현장 체크포인트를 훑고, 다녀와서는 각자
              노트로 남겨 비교해 보세요.
            </p>
            <div className="flex flex-col gap-1.5">
              {imjangRegion && (
                <Link
                  prefetch={false}
                  href={`/imjang/${encodeURIComponent(imjangRegion.slug)}`}
                  className="text-[13px] font-extrabold text-primary no-underline"
                >
                  {imjangRegion.name} 임장 가이드 ›
                </Link>
              )}
              <Link href="/notes/templates" className="text-[13px] font-bold text-text-2 no-underline hover:text-primary">
                노트 템플릿 보기 ›
              </Link>
              <Link href="/notes/new" className="text-[13px] font-bold text-text-2 no-underline hover:text-primary">
                임장노트 쓰기 ›
              </Link>
            </div>
          </div>

          <div className="flex gap-2">
            <ShareButton title={meeting.title} />
            <Link
              href="/town/groups"
              className="btn-secondary flex-1 rounded-xl p-3 text-center text-[13px] no-underline"
            >
              목록
            </Link>
          </div>

          {myEmail ? (
            <>
              {/* [2026-08-22] "대기 참여" 문구 제거 — 대기 명단 기능은 어디에도
                  없다. 정원이 찬 모임의 신규 입장은 채팅에서 정원 오류가 나므로,
                  약속 없이 사실만 말한다(기존 참여자 재입장은 항상 허용됨). */}
              <Link
                href={`/town/groups/${id}/chat`}
                className={`${
                  isPast || (isFull && !isOrganizer) ? "btn-secondary" : "btn-primary"
                } rise-in-2 rounded-2xl p-3.5 text-center text-[15px] no-underline`}
                style={
                  isPast || (isFull && !isOrganizer)
                    ? undefined
                    : { boxShadow: "0 10px 26px rgba(29,79,216,.35)" }
                }
              >
                {isOrganizer
                  ? "모임 채팅방 관리"
                  : isPast
                    ? "일정 종료 · 모임 채팅 보기"
                    : isFull
                      ? "모집 마감 · 참여했다면 채팅방 입장"
                      : "참여하기 → 채팅방 입장"}
              </Link>
              <p className="rise-in-3 text-center text-[12px] text-text-3">
                {isOrganizer
                  ? "내가 만든 모임이에요"
                  : isPast
                    ? "일정이 지난 모임이에요 — 후기·정리는 채팅에서 나눌 수 있어요"
                    : isFull
                      ? "정원이 차서 새로 참여할 수는 없어요"
                      : "채팅방 입장 시 모임 참여로 확정돼요"}
              </p>
            </>
          ) : (
            <>
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(`/town/groups/${id}`)}`}
                className="btn-primary rise-in-2 rounded-2xl p-3.5 text-center text-[15px] no-underline"
                style={{ boxShadow: "0 10px 26px rgba(29,79,216,.35)" }}
              >
                로그인하고 참여하기
              </Link>
              <p className="rise-in-3 text-center text-[12px] text-text-3">
                로그인하면 모임 채팅에 참여할 수 있어요
              </p>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
