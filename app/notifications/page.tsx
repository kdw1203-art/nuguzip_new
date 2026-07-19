import { PageShell } from "../components/PageShell";

/* ============================================================
   알림 센터 (11d) — 필터 칩 + 좌측 컬러 보더 알림 카드
   ============================================================ */

const FILTERS = [
  { label: "전체", active: true },
  { label: "시세·매물", active: false },
  { label: "청약", active: false },
  { label: "소셜", active: false },
] as const;

type Notification = {
  tag: string;
  tagColor: string;
  tagBg: string;
  border: string | null;
  title: string;
  meta: string;
  read: boolean;
};

const NOTIFICATIONS: Notification[] = [
  {
    tag: "급매",
    tagColor: "#d64545",
    tagBg: "#fdeeee",
    border: "#d64545",
    title: "공작아파트 급매 7.9억 등록 — 시세 대비 -6%",
    meta: "10분 전 · 관심 단지",
    read: false,
  },
  {
    tag: "AI",
    tagColor: "#1d4fd8",
    tagBg: "#edf2fe",
    border: "#1d4fd8",
    title: "매수 신호 68점 도달 — 알림 기준(70)까지 2점",
    meta: "2시간 전 · 관양동",
    read: false,
  },
  {
    tag: "청약",
    tagColor: "#c07a3a",
    tagBg: "#fdf3e7",
    border: "#c07a3a",
    title: "과천 S7 특별공급 접수 D-3",
    meta: "오늘 09:00 · 알림 신청 단지",
    read: false,
  },
  {
    tag: "모임",
    tagColor: "#6b7684",
    tagBg: "#f2f4f8",
    border: null,
    title: "과천 모임 채팅 — 투표가 시작됐어요",
    meta: "어제 · 읽음",
    read: true,
  },
  {
    tag: "소셜",
    tagColor: "#6b7684",
    tagBg: "#f2f4f8",
    border: null,
    title: "내 공개 노트에 댓글 2 · 저장 5",
    meta: "어제 · 읽음",
    read: true,
  },
];

export default function NotificationsPage() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[560px]">
        {/* 타이틀 + 모두 읽음 */}
        <div className="rise-in flex items-center justify-between">
          <h1 className="text-[22px] font-extrabold text-ink">알림</h1>
          <button type="button" className="text-xs font-bold text-primary">
            모두 읽음
          </button>
        </div>

        {/* 필터 칩 */}
        <div className="rise-in-1 mt-3 flex gap-1.5">
          {FILTERS.map((f) => (
            <span
              key={f.label}
              className={`chip px-[13px] py-1.5 text-xs ${
                f.active
                  ? "chip-active"
                  : "border border-[#e2e7ee] bg-surface text-text-2"
              }`}
            >
              {f.label}
            </span>
          ))}
        </div>

        {/* 알림 리스트 */}
        <div className="mt-3 flex flex-col gap-2">
          {NOTIFICATIONS.map((n, i) => (
            <div
              key={n.title}
              className={`rise-in-${Math.min(i + 1, 6)} card flex gap-2.5 rounded-[14px] px-[15px] py-[13px] ${
                n.read ? "opacity-75" : ""
              }`}
              style={n.border ? { borderLeft: `3px solid ${n.border}` } : undefined}
            >
              <div
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[11px] font-extrabold"
                style={{ background: n.tagBg, color: n.tagColor }}
              >
                {n.tag}
              </div>
              <div className="flex-1">
                <div
                  className={`text-xs font-bold leading-[1.45] ${
                    n.read ? "text-text-1" : "text-ink"
                  }`}
                >
                  {n.title}
                </div>
                <div className="mt-[3px] text-[10px] text-text-3">{n.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
