import Link from "next/link";
import { PageShell } from "../../components/PageShell";

/* 시안 6q(지역별 임장 모임 목록 · 모바일) + 8o(모임 상세 · 모바일) */

const REGION_FILTERS = ["전체", "안양·과천", "서울 서부"];

const GROUPS = [
  {
    id: "1",
    badge: "모집 중 4/6",
    badgeStyle: "bg-[#edf2fe] text-primary",
    date: "7.25 (토) 10:00",
    title: "과천지식정보타운 같이 봐요",
    desc: "S6·S7블록 중심 2시간 코스. 초보 환영, 체크리스트 공유해요.",
    avatars: ["#dfe5ef", "#cfd8e6", "#bfcbdd"],
  },
  {
    id: "2",
    badge: "마감 임박 2/4",
    badgeStyle: "bg-[#fdf3e7] text-[#c07a3a]",
    date: "7.26 (일) 14:00",
    title: "마포 구축 리모델링 스터디",
    desc: "리모델링 추진 단지 2곳 임장 + 카페 정리 1시간.",
    avatars: [],
  },
];

export default function TownGroupsPage() {
  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">
          지역별 임장 모임
        </h1>
        <button
          type="button"
          className="text-[13px] font-bold text-primary"
        >
          만들기
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_400px]">
        {/* ---------- 6q 모임 목록 ---------- */}
        <div className="flex flex-col gap-2.5">
          <div className="rise-in flex gap-1.5">
            {REGION_FILTERS.map((f, i) => (
              <span
                key={f}
                className={`chip px-[13px] py-1.5 text-xs ${
                  i === 0
                    ? "chip-active"
                    : "border border-[#e2e7ee] bg-surface text-text-2"
                }`}
              >
                {f}
              </span>
            ))}
          </div>

          {GROUPS.map((g, i) => (
            <div
              key={g.id}
              className={`card card-hover rise-in-${i + 1} flex flex-col gap-2 rounded-2xl p-4`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-[5px] px-2 py-[3px] text-[11px] font-extrabold ${g.badgeStyle}`}
                >
                  {g.badge}
                </span>
                <span className="text-[11px] text-text-3">{g.date}</span>
              </div>
              <div className="text-[15px] font-extrabold text-ink">
                {g.title}
              </div>
              <p className="text-xs leading-[1.5] text-text-2">{g.desc}</p>
              <div
                className={`flex items-center ${
                  g.avatars.length > 0 ? "justify-between" : "justify-end"
                }`}
              >
                {g.avatars.length > 0 && (
                  <div className="flex">
                    {g.avatars.map((c, j) => (
                      <div
                        key={c}
                        className={`h-6 w-6 rounded-full border-2 border-white ${
                          j > 0 ? "-ml-2" : ""
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                )}
                <Link
                  href={`/town/groups/${g.id}`}
                  className="btn-primary rounded-full px-4 py-2 text-xs"
                >
                  참여하기
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* ---------- 8o 모임 상세 ---------- */}
        <div className="flex flex-col gap-3">
          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="flex items-center justify-between">
              <span className="rounded-[5px] bg-[#edf2fe] px-2 py-[3px] text-[11px] font-extrabold text-primary">
                모집 중 4/6
              </span>
              <span className="text-[11px] text-text-3">62명이 봤어요</span>
            </div>
            <h2 className="text-lg font-extrabold leading-[1.35] text-ink">
              과천지식정보타운 같이 봐요
            </h2>
            <div className="flex flex-col gap-1.5 text-[13px] text-text-1">
              <div className="flex gap-2">
                <span>📅</span>7.25 (토) 10:00 ~ 12:00
              </div>
              <div className="flex gap-2">
                <span>📍</span>과천지식정보타운역 2번 출구
              </div>
              <div className="flex gap-2">
                <span>🚶</span>S6 → S7 → 상가권 도보 2시간
              </div>
            </div>
            <p className="rounded-xl bg-bg px-3.5 py-3 text-[13px] leading-[1.6] text-text-2">
              초보 환영! 제 체크리스트 공유해요. 끝나고 카페에서 노트 정리 같이
              하실 분은 30분 더.
            </p>
          </div>

          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] p-4">
            <div className="text-[13px] font-extrabold text-ink">참여자 4</div>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8]" />
              <div className="flex-1">
                <div className="text-[13px] font-bold text-ink">
                  모임장 · 과천러버
                </div>
                <div className="text-[11px] text-text-3">
                  임장노트 24 · 모임 8회 진행
                </div>
              </div>
              <span className="rounded-[5px] bg-[#fdf3e7] px-2 py-[3px] text-[10px] font-extrabold text-[#c07a3a]">
                열정 임장러
              </span>
            </div>
            <div className="flex items-center">
              <div className="h-7 w-7 rounded-full border-2 border-white bg-[#dfe5ef]" />
              <div className="-ml-2 h-7 w-7 rounded-full border-2 border-white bg-[#cfd8e6]" />
              <div className="-ml-2 h-7 w-7 rounded-full border-2 border-white bg-[#bfcbdd]" />
              <span className="ml-2 text-[11px] text-text-3">
                + 3명 참여 중
              </span>
            </div>
          </div>

          <Link
            href="/town/groups/1"
            className="btn-primary rise-in-3 rounded-2xl p-3.5 text-center text-[15px]"
            style={{ boxShadow: "0 10px 26px rgba(29,79,216,.35)" }}
          >
            참여하기 → 채팅방 입장
          </Link>
          <p className="rise-in-4 text-center text-[11px] text-[#adb5bd]">
            참여 확정 시 모임 채팅방이 열려요 · 연락처는 공개되지 않아요
          </p>
        </div>
      </div>
    </PageShell>
  );
}
