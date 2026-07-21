import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { listMeetings, type UserMeeting } from "@/lib/meetings/store-db";
import { CreateGroupCta } from "./CreateGroupCta";
import { Icon } from "@/app/components/Icon";

/* 시안 6q(지역별 임장 모임 목록) 고도화 — meetings 실데이터 연동.
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
  {
    id: null,
    title: "마포 구축 리모델링 스터디",
    desc: "리모델링 추진 단지 2곳 임장 + 카페 정리 1시간.",
    region: "서울 마포구",
    regionKey: "서울",
    whenLabel: "7.26 (일) 14:00",
    whenTs: 0,
    createdTs: 0,
    members: 2,
    max: 4,
    host: "마포지기",
    statusKey: "closing",
    tags: ["리모델링", "스터디"],
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

const STATUS_META: Record<GroupView["statusKey"], { label: string; style: string }> = {
  open: { label: "모집 중", style: "bg-[#edf2fe] text-primary" },
  closing: { label: "마감 임박", style: "bg-[#fdf3e7] text-[#c07a3a]" },
  full: { label: "모집 마감", style: "bg-[#f2f4f8] text-text-3" },
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

  return (
    <PageShell breadcrumb="동네이야기 › 임장 모임">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="rise-in text-[26px] font-extrabold text-ink">지역별 임장 모임</h1>
          <p className="mt-1.5 text-sm text-text-2">
            같은 단지를 함께 돌아볼 이웃을 찾아보세요 · 참여 확정 시 채팅방이 열려요
          </p>
        </div>
        <CreateGroupCta />
      </div>

      {/* 필터 바 */}
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex gap-1.5 overflow-x-auto text-[13px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href={qs(base, { region: "all" })}
            className={`chip shrink-0 px-3.5 py-1.5 ${region === "all" ? "chip-active" : "border border-line bg-surface text-text-2"}`}
          >
            전체 지역
          </Link>
          {regionKeys.map((r) => (
            <Link
              key={r}
              href={qs(base, { region: r })}
              className={`chip shrink-0 px-3.5 py-1.5 ${region === r ? "chip-active" : "border border-line bg-surface text-text-2"}`}
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
              className={`chip px-3 py-1.5 ${status === c.id ? "chip-active" : "border border-line bg-surface text-text-2"}`}
            >
              {c.label}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          {sortChips.map((c) => (
            <Link
              key={c.id}
              href={qs(base, { sort: c.id })}
              className={`chip px-3 py-1.5 ${sort === c.id ? "chip-active" : "border border-line bg-surface text-text-2"}`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 목록 */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {groups.map((g, i) => {
          const meta = STATUS_META[g.statusKey];
          return (
            <div
              key={g.id ?? g.title}
              className={`card card-hover rise-in-${Math.min(i + 1, 6)} flex flex-col gap-2.5 rounded-2xl p-4`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className={`rounded-[5px] px-2 py-[3px] text-[11px] font-extrabold ${meta.style}`}>
                    {meta.label} {g.members}/{g.max}
                  </span>
                  {listIsMock && <ExampleBadge />}
                </span>
                <span className="text-[11px] text-text-3">{g.whenLabel}</span>
              </div>

              <div className="text-[15px] font-extrabold text-ink">{g.title}</div>
              <p className="line-clamp-2 text-xs leading-[1.5] text-text-2">{g.desc}</p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-3">
                <span className="inline-flex items-center gap-1"><Icon name="📍" size={12} />{g.region}</span>
                <span className="inline-flex items-center gap-1"><Icon name="👤" size={12} />{g.host}</span>
              </div>

              {g.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {g.tags.map((t) => (
                    <span key={t} className="rounded-full bg-[#f2f4f8] px-2.5 py-1 text-[11px] text-text-2">
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-0.5 flex items-center justify-between">
                <div className="flex items-center">
                  {AVATAR_COLORS.slice(0, Math.min(Math.max(g.members, 1), 3)).map((c, j) => (
                    <div
                      key={c}
                      className={`h-6 w-6 rounded-full border-2 border-white ${j > 0 ? "-ml-2" : ""}`}
                      style={{ background: c }}
                    />
                  ))}
                  <span className="ml-2 text-[11px] text-text-3">멤버 {g.members}명</span>
                </div>
                {g.id ? (
                  <Link href={`/town/groups/${g.id}`} className="btn-primary rounded-full px-4 py-2 text-xs no-underline">
                    {g.statusKey === "full" ? "대기 참여" : "참여하기"}
                  </Link>
                ) : (
                  <span className="cursor-default rounded-full border border-line bg-bg px-4 py-2 text-xs font-semibold text-text-3">
                    예시 모임
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {groups.length === 0 && (
          <div className="card col-span-full rounded-2xl px-6 py-10 text-center text-sm text-text-3">
            조건에 맞는 모임이 아직 없어요.{" "}
            <Link href="/town/groups" className="font-semibold text-primary no-underline">
              필터를 초기화
            </Link>
            하거나 직접 모임을 만들어 보세요.
          </div>
        )}
      </div>
    </PageShell>
  );
}
