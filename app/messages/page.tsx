"use client";

import { useState } from "react";
import { PageShell } from "../components/PageShell";

/* ============================================================
   쪽지함 (8q) + 쪽지 보내기 (8r) — 닉네임 기반 쪽지
   ============================================================ */

type View = "inbox" | "compose";
type Box = "received" | "sent";

const RECEIVED = [
  {
    name: "김OO 중개사",
    verified: true,
    time: "10분 전",
    preview: "문의하신 급매(7.9억) 아직 있습니다. 주말 방문 가능…",
    unread: true,
    avatar: "linear-gradient(135deg,#e2e8f2,#eef2f8)",
  },
  {
    name: "과천러버",
    verified: false,
    time: "어제",
    preview: "토요일 모임 관련해서 노트 양식 여쭤봐요!",
    unread: true,
    avatar: "#dfe5ef",
  },
  {
    name: "마포이웃",
    verified: false,
    time: "7.15",
    preview: "공개 노트 잘 봤어요. 302동 저층 어떤가요?",
    unread: false,
    avatar: "#cfd8e6",
  },
] as const;

const SENT = [
  {
    name: "김OO 중개사",
    verified: true,
    time: "10분 전",
    preview: "안녕하세요, 공작아파트 급매(7.9억) 관련 문의드려요…",
    unread: false,
    avatar: "linear-gradient(135deg,#e2e8f2,#eef2f8)",
  },
] as const;

const QUICK_PHRASES = ["댓글 자주 쓰는 문구", "방문 일정 문의", "가격 협상 문의"] as const;

export default function MessagesPage() {
  const [view, setView] = useState<View>("inbox");
  const [box, setBox] = useState<Box>("received");

  const list = box === "received" ? RECEIVED : SENT;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[480px]">
        {view === "inbox" ? (
          <>
            {/* ===== 쪽지함 (8q) ===== */}
            <div className="rise-in flex items-center justify-between">
              <h1 className="text-[22px] font-extrabold text-ink">쪽지함</h1>
              <button
                type="button"
                onClick={() => setView("compose")}
                className="text-[13px] font-bold text-primary"
              >
                ✎ 쓰기
              </button>
            </div>

            <div className="rise-in-1 mt-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => setBox("received")}
                className={`chip px-[13px] py-1.5 text-xs ${
                  box === "received"
                    ? "chip-active"
                    : "border border-[#e2e7ee] bg-surface text-text-2"
                }`}
              >
                받은 쪽지 3
              </button>
              <button
                type="button"
                onClick={() => setBox("sent")}
                className={`chip px-[13px] py-1.5 text-xs ${
                  box === "sent"
                    ? "chip-active"
                    : "border border-[#e2e7ee] bg-surface text-text-2"
                }`}
              >
                보낸 쪽지
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {list.map((m, i) => (
                <div
                  key={`${m.name}-${m.time}`}
                  className={`rise-in-${Math.min(i + 1, 6)} card flex gap-2.5 rounded-[14px] px-4 py-3.5 ${
                    m.unread ? "" : "opacity-70"
                  }`}
                  style={m.unread ? { borderLeft: "3px solid #1d4fd8" } : undefined}
                >
                  <div
                    className="h-9 w-9 shrink-0 rounded-full"
                    style={{ background: m.avatar }}
                  />
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span
                        className={`text-[13px] ${
                          m.unread ? "font-extrabold text-ink" : "font-bold text-text-1"
                        }`}
                      >
                        {m.name}{" "}
                        {m.verified && (
                          <span className="rounded bg-primary-soft px-[5px] py-px text-[9px] font-extrabold text-primary">
                            인증
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-text-3">{m.time}</span>
                    </div>
                    <div
                      className={`mt-[3px] text-xs ${
                        m.unread ? "font-semibold text-text-1" : "text-text-2"
                      }`}
                    >
                      {m.preview}
                    </div>
                  </div>
                </div>
              ))}
              <div className="mt-1.5 text-center text-[11px] text-[#adb5bd]">
                쪽지는 닉네임으로만 오가요 · 연락처 요구는 신고해 주세요
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ===== 쪽지 보내기 (8r) ===== */}
            <div className="rise-in flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView("inbox")}
                aria-label="닫기"
                className="text-base text-text-1"
              >
                ✕
              </button>
              <h1 className="text-[15px] font-extrabold text-ink">쪽지 보내기</h1>
              <button
                type="button"
                onClick={() => setView("inbox")}
                className="text-[13px] font-bold text-primary"
              >
                보내기
              </button>
            </div>

            <div className="mt-3.5 flex flex-col gap-3">
              <div className="rise-in-1 card flex items-center gap-2.5 rounded-[14px] px-4 py-3">
                <span className="w-10 text-xs text-text-3">받는 이</span>
                <span className="chip bg-primary-soft px-3 py-[5px] text-xs text-primary">
                  김OO 중개사 ✕
                </span>
              </div>
              <div className="rise-in-2 card flex items-center gap-2.5 rounded-[14px] px-4 py-3">
                <span className="w-10 text-xs text-text-3">첨부</span>
                <span className="chip bg-[#f2f4f8] px-3 py-[5px] text-xs font-bold text-text-1">
                  노트 공작 302동 노트 ✕
                </span>
                <span className="text-xs text-text-3">＋</span>
              </div>
              <div className="rise-in-3 min-h-[150px] rounded-2xl border-[1.5px] border-primary bg-surface p-4 text-sm leading-[1.6] text-text-1">
                안녕하세요, 공작아파트 급매(7.9억) 관련 문의드려요. 첨부한 제 임장노트
                보시고 5층 채광이 실제로 어떤지, 협상 여지가 있을지 의견 부탁드립니다.
                <span className="text-primary">|</span>
              </div>
              <div className="rise-in-4 flex flex-wrap gap-1.5">
                {QUICK_PHRASES.map((p) => (
                  <span
                    key={p}
                    className="chip border border-[#e2e7ee] bg-surface px-3 py-1.5 text-[11px] text-text-2"
                  >
                    {p}
                  </span>
                ))}
              </div>
              <div className="rise-in-5 text-[11px] leading-[1.5] text-[#adb5bd]">
                개인정보(전화번호·계좌)는 자동으로 가려져요 · 첫 쪽지는 상대가 수락해야
                대화가 이어집니다
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
