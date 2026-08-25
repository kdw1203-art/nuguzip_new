import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { listMeetings, type UserMeeting } from "@/lib/meetings/store-db";
import { countRecentGroupMessages } from "@/lib/chat/store-db";
import { CreateGroupCta } from "./CreateGroupCta";
import { GroupsClient, type GroupView } from "./GroupsClient";
import { Icon } from "@/app/components/Icon";
import { TownCategoryNav } from "../TownCategoryNav";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 시안 6q(지역별 임장 모임 목록) 고도화 — meetings 실데이터 연동.
   지역·상태 필터 + 임박순/최신순 정렬 + 모임 만들기(POST /api/groups) 실배선.

   예시 목업 폴백은 제거했다 — "7.25 (토)" 같은 구체적 날짜가 박힌 가짜 모임은
   예시 배지가 붙어 있어도 진짜 모임처럼 읽힌다. 0건이면 0건이라고 말하고
   만들기 CTA 를 보여 주는 편이 정직하다. */

/* ── ISR 전환 (사용량 절감 12차, 2026-08-10) ────────────────────────────────
   예전에는 force-dynamic + ?region/?status/?sort 서버 필터였다. 로더는 원래도
   전량(상한 200)을 받아 메모리에서 걸렀다 — searchParams 읽기만이 동적 원인.
   실측: meetings 0행. 필터는 GroupsClient 가 마운트 후 location.search 로 처리.
   statusKey 는 시각 파생값이라 빌드 시각(builtAtMs)으로 하이드레이션을 맞춘 뒤
   클라이언트가 재계산한다 — "일정 지난 모임에 참여하기"는 거짓 안내다.
   24h 채팅 배지는 재생성 시각 실측값(최대 5분 낡음 — 배지 성격상 허용). */
export const revalidate = 300;

/* N7 — ?region=·?status=·?sort= 는 같은 목록을 자르는 값이라 조합마다 색인되면
   안 된다. canonical 을 파라미터 없는 경로로 고정한다. */
export const metadata = buildPageMetadata({
  title: "임장 모임 — 같이 다녀올 사람 찾기",
  description:
    "지역·일정별 임장 모임을 찾고, 직접 모임을 만들어 함께 다녀올 사람을 모읍니다. 등록된 모임이 없으면 없다고 표시합니다.",
  path: "/town/groups",
});

/* ---------- 헬퍼 ---------- */

function formatWhen(iso: string | null): { label: string; ts: number } {
  if (!iso) return { label: "일정 미정", ts: Number.MAX_SAFE_INTEGER };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { label: "일정 미정", ts: Number.MAX_SAFE_INTEGER };
  const week = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    label: `${d.getMonth() + 1}.${d.getDate()} (${week}) ${p(d.getHours())}:${p(d.getMinutes())}`,
    ts: d.getTime(),
  };
}

/** UserMeeting → 공개 뷰. organizerEmail 등 비공개 필드는 여기서 떨어진다 —
 *  ISR 공개 캐시(RSC 페이로드)에 개인정보를 싣지 않는다. statusKey 는 이 시각
 *  (재생성 시각) 기준 초기값이고 클라이언트가 마운트 후 재계산한다. */
function toView(m: UserMeeting, now: number): GroupView {
  const remaining = m.maxMembers - m.currentMembers;
  const when = formatWhen(m.scheduledAt);
  const isPast = when.ts !== Number.MAX_SAFE_INTEGER && when.ts < now;
  const statusKey: GroupView["statusKey"] = isPast
    ? "past"
    : remaining <= 0
      ? "full"
      : remaining <= 1
        ? "closing"
        : "open";
  const region = m.region || [m.city, m.district].filter(Boolean).join(" ") || "지역 미정";
  return {
    id: m.id,
    title: m.title,
    desc: m.description,
    region,
    regionKey: region.split(" ")[0] || region,
    whenLabel: when.label,
    whenTs: when.ts,
    createdTs: new Date(m.createdAt).getTime() || 0,
    members: m.currentMembers,
    max: m.maxMembers,
    host: m.organizerLabel || m.hostLabel || "주최자",
    fee: m.fee,
    statusKey,
    tags: (m.tags.length > 0 ? m.tags : [m.category]).filter(Boolean).slice(0, 3),
  };
}

/** listMeetings 상한(200)과 같은 값 — 전량이 이 안이어야 클라이언트 필터가 동치 */
const MEETINGS_FETCH_CAP = 200;

/* ---------- 페이지 ---------- */

export default async function TownGroupsPage() {
  let meetings: UserMeeting[] = [];
  /* 목록을 **못 읽은 것**과 목록이 **비어 있는 것**은 다른 사실이다.
     실패를 빈 배열로 삼키면 "모임이 없어요"가 ISR 캐시에 눌러앉는다.
     (페이지 자체는 200 — 목록을 못 읽었다고 URL 이 사라진 건 아니다.) */
  let loadFailed = false;
  try {
    // 이 화면은 "마감·종료된 모임" 섹션에 일정 지난 모임도 보여 주므로 includePast.
    meetings = await listMeetings({ includePast: true });
  } catch {
    loadFailed = true;
    meetings = [];
  }

  const now = Date.now();
  const views = meetings.map((m) => toView(m, now));

  /* 고도화 29 — 모임별 최근 24h 채팅 메시지 수(실측). 조회 실패면 배지 전체를
     접는다 — 0으로 그리면 "조용한 모임"이라는 거짓 주장이 된다. */
  let chat: Record<string, number> = {};
  try {
    const activity = await countRecentGroupMessages(views.map((g) => g.id));
    chat = Object.fromEntries(activity.entries());
  } catch {
    chat = {};
  }

  return (
    <PageShell breadcrumb="동네이야기 › 임장 모임">
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />
      {/* ---------- 페이지 헤더 ---------- */}
      <div className="rise-in mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="t-title text-ink">임장 모임</h1>
          <p className="mt-1 t-body text-text-2">
            같은 단지를 함께 돌아볼 이웃을 찾아보세요 · 참여 확정 시 채팅방이 열려요
          </p>
        </div>
        <div className="shrink-0">
          <CreateGroupCta />
        </div>
      </div>

      {loadFailed ? (
        <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[18px] px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="warning" size={22} />
          </div>
          <p className="text-sm font-bold text-ink">모임 목록을 불러오지 못했어요</p>
          <p className="max-w-xs text-xs leading-[1.6] text-text-3">
            일시적인 오류예요. 모임이 없는 게 아니라, 지금 목록을 읽지 못한
            상태입니다. 잠시 뒤 새로고침해 주세요.
          </p>
          <Link href="/town/groups" className="btn-soft rounded-lg px-4 py-2 text-xs no-underline">
            다시 불러오기
          </Link>
        </div>
      ) : (
        <GroupsClient
          views={views}
          chat={chat}
          builtAtMs={now}
          truncated={views.length >= MEETINGS_FETCH_CAP}
        />
      )}
    </PageShell>
  );
}
