import Link from "next/link";
import { getMeeting } from "@/lib/meetings/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { ChatRoom } from "../ChatRoom";

/* 시안 8p — 모임 그룹 채팅방 (+ 10c 메뉴)
   /api/groups/[id]/chat(입장·멱등) + /api/chat/rooms/[roomId]/messages 실배선 */

export const dynamic = "force-dynamic";

function formatSchedule(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TownGroupChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [meeting, session] = await Promise.all([
    getMeeting(id).catch(() => null),
    safeAuth(),
  ]);

  if (!meeting) {
    return (
      <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
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
    );
  }

  const myEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  const metaLine = [
    formatSchedule(meeting.scheduledAt),
    `멤버 ${meeting.currentMembers}/${meeting.maxMembers}`,
    meeting.region || null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (!myEmail) {
    return (
      <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-bg">
        <div className="glass mx-3.5 mt-3.5 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5">
          <Link href={`/town/groups/${id}`} aria-label="뒤로" className="text-base text-text-1">
            ‹
          </Link>
          <div className="flex-1">
            <div className="text-sm font-extrabold text-ink">{meeting.title}</div>
            <div className="text-[10px] text-text-3">{metaLine}</div>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-[15px] font-extrabold text-ink">
            로그인하면 모임 채팅에 참여할 수 있어요
          </div>
          <p className="text-[13px] leading-[1.6] text-text-2">
            {meeting.description || "모임 멤버들과 일정·체크리스트를 나눠 보세요."}
          </p>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/town/groups/${id}/chat`)}`}
            className="btn-primary rounded-xl px-6 py-3 text-[13px] no-underline"
          >
            로그인하고 참여하기
          </Link>
          <Link href={`/town/groups/${id}`} className="text-xs text-text-3 no-underline">
            모임 정보로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ChatRoom
      groupId={id}
      myEmail={myEmail}
      title={meeting.title}
      metaLine={metaLine}
      memberCount={meeting.currentMembers}
    />
  );
}
