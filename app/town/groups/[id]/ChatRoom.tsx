"use client";

import { useState } from "react";
import Link from "next/link";

/* 시안 8p(모임 그룹 채팅방 · 모바일) + 10c(채팅방 메뉴 — 회원) */

type Message =
  | { type: "other"; name: string; body: string; leader?: boolean }
  | { type: "attachment"; name: string; title: string; meta: string }
  | { type: "mine"; body: string }
  | { type: "system"; body: string };

const INITIAL_MESSAGES: Message[] = [
  {
    type: "other",
    name: "모임장 · 과천러버",
    body: "토요일 다들 가능하시죠? 체크리스트 미리 공유해요 📋",
    leader: true,
  },
  {
    type: "attachment",
    name: "평촌새댁",
    title: "공유 체크리스트",
    meta: "구축 40항목 · 누구집 마켓",
  },
  { type: "mine", body: "가능해요! S7 모델하우스도 지나가나요?" },
  {
    type: "system",
    body: "투표 · 모임장이 투표를 시작했어요 — “끝나고 카페 정리?” 찬성 3 · 반대 0",
  },
];

const MEMBERS = [
  {
    name: "과천러버",
    badge: "모임장",
    badgeStyle: "bg-[#fdf3e7] text-[#c07a3a]",
    meta: "노트 24 · 모임 8회",
    action: "쪽지",
    actionPrimary: true,
  },
  {
    name: "평촌새댁",
    badge: "✦",
    badgeStyle: "rounded-full bg-ink text-[#7ea2ff]",
    meta: "노트 12",
    action: "쪽지",
    actionPrimary: true,
  },
  {
    name: "나 (첫집준비중)",
    badge: "",
    badgeStyle: "",
    meta: "노트 7",
    action: "프로필",
    actionPrimary: false,
  },
];

const MEMBER_MENUS = [
  "내 체크리스트 공유하기",
  "모임 일정 캘린더에 추가",
  "신고하기",
];

export function ChatRoom() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [alarmOn, setAlarmOn] = useState(false);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { type: "mine", body: text }]);
    setDraft("");
  };

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-bg">
      {/* ---------- 채팅방 헤더 ---------- */}
      <div className="glass mx-3.5 mt-3.5 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5">
        <Link
          href="/town/groups"
          aria-label="뒤로"
          className="text-base text-text-1"
        >
          ‹
        </Link>
        <div className="flex-1">
          <div className="text-sm font-extrabold text-ink">
            과천지식정보타운 같이 봐요{" "}
            <span className="text-[11px] font-semibold text-text-3">5</span>
          </div>
          <div className="text-[10px] text-text-3">7.25 (토) 10:00 · D-6</div>
        </div>
        <button
          type="button"
          aria-label="채팅방 메뉴"
          onClick={() => setMenuOpen(true)}
          className="text-[15px] text-text-1"
        >
          ☰
        </button>
      </div>

      {/* 고정 공지 */}
      <div className="mx-5 mt-2.5 flex items-center justify-between rounded-xl bg-[rgba(29,79,216,.08)] px-3.5 py-2.5">
        <span className="text-[11px] font-bold text-primary">
          고정 · 집결: 지식정보타운역 2번 출구 · 코스 지도 첨부
        </span>
        <span className="text-[11px] text-primary">›</span>
      </div>

      {/* ---------- 메시지 ---------- */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-3.5">
        {messages.map((m, i) => {
          if (m.type === "system") {
            return (
              <div
                key={i}
                className="self-center rounded-full bg-[rgba(25,31,40,.08)] px-3.5 py-[5px] text-[10px] text-text-2"
              >
                {m.body}
              </div>
            );
          }
          if (m.type === "mine") {
            return (
              <div
                key={i}
                className="btn-primary max-w-[240px] self-end rounded-[14px] rounded-br-[4px] px-[13px] py-2.5 text-[13px] font-normal leading-[1.5]"
              >
                {m.body}
              </div>
            );
          }
          if (m.type === "attachment") {
            return (
              <div key={i} className="flex items-end gap-2">
                <div className="h-7 w-7 shrink-0 rounded-full bg-[#dfe5ef]" />
                <div>
                  <div className="mb-[3px] text-[10px] text-text-3">
                    {m.name}
                  </div>
                  <div className="flex max-w-[240px] items-center gap-2 rounded-[14px] border border-line bg-surface px-[13px] py-2.5">
                    <span className="text-sm">📝</span>
                    <div>
                      <div className="text-xs font-bold text-ink">
                        {m.title}
                      </div>
                      <div className="text-[10px] text-text-3">{m.meta}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={i} className="flex items-end gap-2">
              <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8]" />
              <div>
                <div className="mb-[3px] text-[10px] text-text-3">{m.name}</div>
                <div className="max-w-[240px] rounded-[14px] rounded-bl-[4px] border border-line bg-surface px-[13px] py-2.5 text-[13px] leading-[1.5] text-text-1">
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- 입력바 ---------- */}
      <div className="glass-strong mx-3.5 mb-[18px] flex items-center gap-2 rounded-[18px] px-3.5 py-2.5">
        <button type="button" aria-label="첨부" className="text-[15px] text-text-3">
          ＋
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="메시지 입력…"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-text-3"
        />
        <button
          type="button"
          aria-label="전송"
          onClick={send}
          className="btn-primary flex h-8 w-8 items-center justify-center rounded-full text-sm"
        >
          ↑
        </button>
      </div>

      {/* ---------- 10c 채팅방 메뉴 (회원) ---------- */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 z-40 bg-[rgba(16,24,40,.3)] backdrop-blur-[2px]"
          />
          <div
            className="absolute bottom-0 right-0 top-0 z-50 flex w-[300px] flex-col gap-3 rounded-l-3xl bg-surface px-[18px] py-5"
            style={{ boxShadow: "-16px 0 44px rgba(16,28,54,.2)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-ink">
                채팅방 메뉴{" "}
                <span className="rounded bg-[#f2f4f8] px-[7px] py-[2px] text-[9px] font-extrabold text-text-2">
                  회원
                </span>
              </span>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setMenuOpen(false)}
                className="text-[15px] text-text-3"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-1 rounded-xl bg-bg px-3.5 py-3">
              <div className="text-[13px] font-extrabold text-ink">
                과천지식정보타운 같이 봐요
              </div>
              <div className="text-[11px] text-text-3">
                7.25 (토) 10:00 · D-6 · 멤버 5/6
              </div>
            </div>

            <div className="flex flex-col">
              <div className="py-1.5 text-[10px] font-extrabold tracking-widest text-[#adb5bd]">
                멤버 5
              </div>
              {MEMBERS.map((m, i) => (
                <div
                  key={m.name}
                  className={`flex items-center gap-2.5 py-[9px] ${
                    i < MEMBERS.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <div className="h-[30px] w-[30px] rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8]" />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-ink">
                      {m.name}{" "}
                      {m.badge && (
                        <span
                          className={`rounded px-[5px] py-px text-[9px] font-extrabold ${m.badgeStyle}`}
                        >
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-text-3">{m.meta}</div>
                  </div>
                  <span
                    className={`text-[11px] ${
                      m.actionPrimary
                        ? "font-bold text-primary"
                        : "text-text-3"
                    }`}
                  >
                    {m.action}
                  </span>
                </div>
              ))}

              <div className="pb-1 pt-2.5 text-[10px] font-extrabold tracking-widest text-[#adb5bd]">
                회원 기능
              </div>
              {MEMBER_MENUS.map((label, i) => (
                <div
                  key={label}
                  className={`flex justify-between py-2.5 text-[13px] font-semibold text-text-1 ${
                    i < MEMBER_MENUS.length - 1
                      ? "border-b border-[#f0f3f8]"
                      : ""
                  }`}
                >
                  <span>{label}</span>
                  <span className="text-[#c3cad6]">›</span>
                </div>
              ))}
            </div>

            <div className="flex-1" />

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-text-1">
                <span>알림</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={alarmOn}
                  aria-label="알림"
                  onClick={() => setAlarmOn((v) => !v)}
                  className={`relative h-[22px] w-[38px] rounded-full transition-colors ${
                    alarmOn ? "bg-primary" : "bg-[#e2e7ee]"
                  }`}
                >
                  <span
                    className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all ${
                      alarmOn ? "left-[18px]" : "left-[2px]"
                    }`}
                  />
                </button>
              </div>
              <button
                type="button"
                className="text-left text-xs font-semibold text-danger"
              >
                모임 나가기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
