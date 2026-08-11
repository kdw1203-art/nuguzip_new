import Link from "next/link";
import { getMeeting } from "@/lib/meetings/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { ChatRoom } from "../ChatRoom";

/* 시안 8p — 모임 그룹 채팅방 (+ 10c 메뉴)
   /api/groups/[id]/chat(입장·멱등) + /api/chat/rooms/[roomId]/messages 실배선 */

export const dynamic = "force-dynamic";

/* 비공개 모임 채팅방 — 참여자만 접근하는 화면이라 색인 금지. */
export const metadata = { robots: { index: false, follow: false } };

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
  /* 상세 페이지와 같은 이유로 `.catch(() => null)` 을 걷어냈다. 조회 실패를
     삼키면 "모임을 찾을 수 없어요"(삭제된 모임과 똑같은 화면)를 200 으로
     내보내게 된다 — 못 읽은 것과 없는 것은 다른 사실이다. 실패는 던져서
     5xx("지금은 못 준다")가 되게 두고, 아래 안내는 정말로 없을 때만 그린다.
     세션은 곁다리라 실패해도 비로그인으로 계속 그린다(safeAuth 가 흡수). */
  const [meeting, session] = await Promise.all([getMeeting(id), safeAuth()]);

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
    /* myEmail 을 더는 내리지 않는다 — "내 메시지" 판별은 서버가 isMine/isSelf 로
       해서 내려준다(가명 계약). 클라이언트 번들에 이메일 비교 로직이 없어야
       원본 이메일을 내려보낼 이유도 다시 생기지 않는다. */
    <ChatRoom
      groupId={id}
      title={meeting.title}
      metaLine={metaLine}
      memberCount={meeting.currentMembers}
    />
  );
}
