import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { listMeetings, type UserMeeting } from "@/lib/meetings/store-db";
import { CreateGroupCta } from "./CreateGroupCta";
import { Icon } from "@/app/components/Icon";

/* 시안 6q(지역별 임장 모임 목록) 고도화 — meetings 실데이터 연동.
   자료(#8) 섹션 포맷에 맞춰 재구성: 페이지 헤더 + 필터 칩 + 라벨 섹션(모집 중 / 마감된 모임).
   지역·상태 필터 + 임박순/최신순 정렬 + 모임 만들기(POST /api/groups) 실배선.
   실데이터 0건일 때만 "예시" 라벨 목업 폴백. */

export const dynamic = "force-dynamic";

type Params = Promise<{ region?: string; status?: string; sort?: string }>;

type GroupView = {
  id: string | null;
  title: string;
  desc: string;
  region: string;
  regionKey: string;
  whenLabel: string;
  whenTs: number;
  createdTs: number;
  members: number;
  max: number;
  host: string;
  statusKey: "open" | "closing" | "full";
  tags: string[];
};

/* ---------- 목업 폴백 (실데이터 0건일 때만) ---------- */

const FALLBACK_GROUPS: GroupView[] = [
  {
    id: null,
    title: "과천지식정보타운 같이 봐요",
    desc: "S6·S7블록 중심 2시간 코스. 초보 환영, 체크리스트 공유해요.",
    region: "경기 과천시",
    regionKey: "경기",
    whenLabel: "7.25 (토) 10:00",
    whenTs: 0,
    createdTs: 0,
    members: 4,
    max: 6,
    host: "과천러버",
    statusKey: "open",
    tags: ["임장", "초보환영"],
  },
];

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

function toView(m: UserMeeting): GroupView {
  const remaining = m.maxMembers - m.currentMembers;
  const statusKey: GroupView["statusKey"] =
    remaining <= 0 ? "full" : remaining <= 1 ? "closing" : "open";
  const when = formatWhen(m.scheduledAt);
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
    statusKey,
    tags: (m.tags.length > 0 ? m.tags : [m.category]).filter(Boolean).slice(0, 3),
  };
}

const STATUS_META: Record<
  GroupView["statusKey"],
  { label: string; style: string; dot: string }
> = {
  open: { label: "모집 중", style: "bg-primary-soft text-primary", dot: "bg-primary" },
  closing: { label: "마감 임박", style: "state-warning", dot: "bg-warning" },
  full: { label: "모집 마감", style: "bg-bg text-text-3", dot: "bg-text-3" },
};

const AVATAR_COLORS = ["#dfe5ef", "#cfd8e6", "#bfcbdd"];

function ExampleBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-line px-1 py-px text-[9px] font-semibold leading-[1.4] text-text-3">
      예시
    </span>
  );
}

function qs(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const merged = { ...base, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v && v !== "all") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `/town/groups?${s}` : "/town/groups";
}

/* ---------- 모임 카드 (지역·일정·모집인원·상태) ---------- */

function MeetingCard({ g, i, isMock }: { g: GroupView; i: number; isMock: boolean }) {
  const meta = STATUS_META[g.statusKey];
  const remaining = Math.max(g.max - g.members, 0);
  const pct = Math.min(100, Math.round((g.members / Math.max(g.max, 1)) * 100));
  return (
    <div
      className={`card card-hover press rise-in-${Math.min(i + 2, 8)} flex flex-col gap-3 rounded-[16px] p-4`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-extrabold ${meta.style}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          {isMock && <ExampleBadge />}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-3">
          <Icon name="calendar" size={12} />
          {g.whenLabel}
        </span>
      </div>

      <div>
        <h3 className="line-clamp-1 text-[15px] font-extrabold text-ink">{g.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-[1.55] text-text-2">{g.desc}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-3">
        <span className="inline-flex items-center gap-1">
          <Icon name="pin" size={12} />
          {g.region}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="user" size={12} />
          {g.host}
        </span>
      </div>

      {g.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {g.tags.map((t) => (
            <span key={t} className="chip-tag px-2.5 py-1 text-[11px]">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* 모집 인원 */}
      <div className="mt-auto">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1 text-text-3">
            <Icon name="users" size={12} />
            모집 인원
          </span>
          <span className="font-bold text-ink">
            {g.members}/{g.max}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
          <div
            className={`h-full rounded-full ${g.statusKey === "full" ? "bg-text-3" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 푸터 */}
      <div className="flex items-center justify-between border-t border-line pt-3">
        <div className="flex items-center">
          {AVATAR_COLORS.slice(0, Math.min(Math.max(g.members, 1), 3)).map((c, j) => (
            <div
              key={c}
              className={`h-6 w-6 rounded-full border-2 border-surface ${j > 0 ? "-ml-2" : ""}`}
              style={{ background: c }}
            />
          ))}
          <span className="ml-2 text-[11px] font-medium text-text-3">
            {remaining > 0 ? `${remaining}자리 남음` : "모집 마감"}
          </span>
        </div>
        {g.id ? (
          <Link
            href={`/town/groups/${g.id}`}
            className="btn-primary rounded-lg px-4 py-2 text-xs no-underline"
          >
            {g.statusKey === "full" ? "대기 참여" : "참여하기"}
          </Link>
        ) : (
          <span className="cursor-default rounded-lg border border-line bg-bg px-4 py-2 text-xs font-semibold text-text-3">
            예시 모임
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- 페이지 ---------- */

export default async function TownGroupsPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const region = sp.region ?? "all";
  const status = sp.status ?? "all";
  const sort = sp.sort ?? "soon";

  let meetings: UserMeeting[] = [];
  try {
    meetings = await listMeetings();
  } catch {
    meetings = [];
  }

  const realViews = meetings.map(toView);
  const listIsMock = realViews.length === 0;
  const all = listIsMock ? FALLBACK_GROUPS : realViews;

  /* 지역 칩 — 실데이터에서 도출 */
  const regionKeys = [...new Set(all.map((g) => g.regionKey))].slice(0, 6);

  /* 필터 */
  let groups = all.filter((g) => {
    if (region !== "all" && g.regionKey !== region) return false;
    if (status === "open" && g.statusKey === "full") return false;
    if (status === "full" && g.statusKey !== "full") return false;
    return true;
  });

  /* 정렬 */
  groups = [...groups].sort((a, b) =>
    sort === "new" ? b.createdTs - a.createdTs : a.whenTs - b.whenTs,
  );

  /* 자료 섹션 분류 — 모집 중 / 마감된 모임 */
  const recruiting = groups.filter((g) => g.statusKey !== "full");
  const closed = groups.filter((g) => g.statusKey === "full");

  const base = { region, status, sort };
  const statusChips = [
    { id: "all", label: "전체" },
    { id: "open", label: "모집 중" },
    { id: "full", label: "모집 마감" },
  ];
  const sortChips = [
    { id: "soon", label: "임박순" },
    { id: "new", label: "최신순" },
  ];
  const filtersActive = region !== "all" || status !== "all" || sort !== "soon";

  return (
    <PageShell breadcrumb="동네이야기 › 임장 모임">
      {/* ---------- 페이지 헤더 ---------- */}
      <div className="rise-in mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink">임장 모임</h1>
          <p className="mt-1 text-[13px] leading-[1.6] text-text-2">
            같은 단지를 함께 돌아볼 이웃을 찾아보세요 · 참여 확정 시 채팅방이 열려요
          </p>
        </div>
        <div className="shrink-0">
          <CreateGroupCta />
        </div>
      </div>

      {/* ---------- 필터 ---------- */}
      <div className="rise-in-1 mb-6 flex flex-col gap-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 text-[13px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href={qs(base, { region: "all" })}
            className={`chip press shrink-0 px-3.5 py-1.5 ${region === "all" ? "chip-active" : "border border-line bg-surface text-text-2"}`}
          >
            전체 지역
          </Link>
          {regionKeys.map((r) => (
            <Link
              key={r}
              href={qs(base, { region: r })}
              className={`chip press shrink-0 px-3.5 py-1.5 ${region === r ? "chip-active" : "border border-line bg-surface text-text-2"}`}
            >
              {r}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          {statusChips.map((c) => (
            <Link
              key={c.id}
              href={qs(base, { status: c.id })}
              className={`chip press px-3 py-1.5 ${status === c.id ? "chip-active" : "border border-line bg-surface text-text-2"}`}
            >
              {c.label}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          {sortChips.map((c) => (
            <Link
              key={c.id}
              href={qs(base, { sort: c.id })}
              className={`chip press px-3 py-1.5 ${sort === c.id ? "chip-active" : "border border-line bg-surface text-text-2"}`}
            >
              {c.label}
            </Link>
          ))}
          {filtersActive && (
            <Link
              href="/town/groups"
              className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-primary no-underline"
            >
              <Icon name="x" size={12} /> 필터 초기화
            </Link>
          )}
        </div>
      </div>

      {/* ---------- 섹션 ---------- */}
      {groups.length === 0 ? (
        <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[18px] px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="search" size={22} />
          </div>
          <p className="text-sm font-bold text-ink">조건에 맞는 모임이 아직 없어요</p>
          <p className="max-w-xs text-xs leading-[1.6] text-text-3">
            필터를 바꾸거나 직접 모임을 만들어 이웃을 모아보세요.
          </p>
          <Link href="/town/groups" className="btn-soft rounded-lg px-4 py-2 text-xs no-underline">
            필터 초기화
          </Link>
        </div>
      ) : (
        <>
          {/* 모집 중 모임 */}
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-extrabold text-ink">모집 중 모임</h2>
              <span className="text-[12px] font-semibold text-text-3">{recruiting.length}개</span>
            </div>
            {recruiting.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {recruiting.map((g, i) => (
                  <MeetingCard key={g.id ?? g.title} g={g} i={i} isMock={listIsMock} />
                ))}
              </div>
            ) : (
              <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Icon name="users" size={22} />
                </div>
                <div className="text-sm font-bold text-text-1">지금 모집 중인 모임이 없어요</div>
                <div className="max-w-xs text-xs leading-[1.6] text-text-3">
                  직접 모임을 만들어 이웃을 모아보세요.
                </div>
                <div className="mt-1">
                  <CreateGroupCta />
                </div>
              </div>
            )}
          </section>

          {/* 마감된 모임 */}
          {closed.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-extrabold text-ink">마감된 모임</h2>
                <span className="text-[12px] font-semibold text-text-3">{closed.length}개</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {closed.map((g, i) => (
                  <MeetingCard key={g.id ?? g.title} g={g} i={i} isMock={listIsMock} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}
