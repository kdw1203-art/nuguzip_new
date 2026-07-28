import Link from "next/link";
import { getMeeting } from "@/lib/meetings/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { PageShell } from "../../../components/PageShell";
import { ShareButton } from "./ShareButton";
import { LocationMap } from "../../LocationMap";
import { Icon } from "@/app/components/Icon";

/* 시안 8o(모임 상세) 고도화 — 모임 정보 카드(일정·장소·정원·참여자) + 공유 +
   참여 상태별 CTA. "채팅방 입장"은 /town/groups/[id]/chat 로 분리(실채팅 유지). */

export const dynamic = "force-dynamic";

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
          <div className="text-lg font-extrabold text-ink">모임을 찾을 수 없어요</div>
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

  const myEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  const remaining = meeting.maxMembers - meeting.currentMembers;
  const isFull = remaining <= 0;
  const statusLabel = isFull ? "모집 마감" : remaining <= 1 ? "마감 임박" : "모집 중";
  const statusStyle = isFull
    ? "bg-[#f2f4f8] text-text-3"
    : remaining <= 1
      ? "bg-[#fdf3e7] text-warning"
      : "bg-[#edf2fe] text-primary";
  const isOrganizer = myEmail !== null && meeting.organizerEmail?.trim().toLowerCase() === myEmail;
  const fillPct = Math.min(100, Math.round((meeting.currentMembers / Math.max(1, meeting.maxMembers)) * 100));

  return (
    <PageShell breadcrumb="동네이야기 › 임장 모임">
      <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
        {/* ---------- 모임 정보 카드 ---------- */}
        <div className="flex flex-col gap-4">
          <div className="rise-in card flex flex-col gap-3 rounded-[20px] p-6">
            <div className="flex items-center justify-between">
              <span className={`rounded-[5px] px-2 py-[3px] text-[11px] font-extrabold ${statusStyle}`}>
                {statusLabel} {meeting.currentMembers}/{meeting.maxMembers}
              </span>
              <span className="text-[11px] text-text-3">
                {meeting.category}
                {meeting.fee > 0 ? ` · 참가비 ${meeting.fee.toLocaleString("ko-KR")}원` : " · 무료"}
              </span>
            </div>

            <h1 className="text-[22px] font-extrabold leading-[1.35] text-ink">{meeting.title}</h1>

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
                  <span key={t} className="rounded-full bg-[#f2f4f8] px-2.5 py-1 text-[11px] text-text-2">
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
              <div className="text-[11px] text-text-3">{isFull ? "정원이 찼어요" : `${remaining}자리 남음`}</div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full bg-primary" style={{ width: `${fillPct}%` }} />
            </div>
            {/* 목록(/town/groups)에서 같은 이유로 이미 걷어낸 가짜 아바타 원을 여기서도
                지운다. 참여자 프로필을 읽지 않고 색만 다른 원을 currentMembers 수만큼
                그리던 것이라, 정원이 0명일 때도 원이 하나 떠서 "누군가 있다"고 보였다.
                실제로 아는 사실은 인원수뿐이므로 인원수만 남긴다. */}
            <p className="text-[11px] leading-[1.5] text-text-3">
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
            <p className="text-[11px] leading-[1.5] text-text-3">
              지역 기준 지도예요 · 정확한 집결 장소는 모임 채팅방에서 안내돼요.
            </p>
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
              <Link
                href={`/town/groups/${id}/chat`}
                className="btn-primary rise-in-2 rounded-2xl p-3.5 text-center text-[15px] no-underline"
                style={{ boxShadow: "0 10px 26px rgba(29,79,216,.35)" }}
              >
                {isOrganizer ? "모임 채팅방 관리" : isFull ? "대기 참여 · 채팅방 입장" : "참여하기 → 채팅방 입장"}
              </Link>
              <p className="rise-in-3 text-center text-[11px] text-text-3">
                {isOrganizer
                  ? "내가 만든 모임이에요"
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
              <p className="rise-in-3 text-center text-[11px] text-text-3">
                로그인하면 모임 채팅에 참여할 수 있어요
              </p>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
