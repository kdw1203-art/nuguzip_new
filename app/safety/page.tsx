"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";

/* P0-5 목업 정직화: 특정 단지의 가짜 진단 "결과"를 통째로 보여주던 화면을
   입력 기반으로 전환. 자동 진단 엔진은 아직 없으므로 결과를 지어내지 않고
   "진단 준비 중" 상태 + 직접 확인용 체크리스트 안내만 제공한다. */

type Mode = "매매" | "전세" | "월세";

/* 실제 진단 시 대조하는 항목 안내 — 판정값 없이 항목만 (지어낸 결과 금지) */
const CHECK_ITEMS = [
  {
    label: "소유자 = 계약 상대방 일치",
    how: "등기부등본 갑구에서 소유자 확인 · 신분증 대조",
  },
  {
    label: "깡통전세 위험 (매매가 대비 보증금+선순위 채권)",
    how: "통상 80% 초과 시 위험 신호 · 실거래가와 비교",
  },
  {
    label: "선순위 근저당·가압류",
    how: "등기부등본 을구 확인 · 잔금일 말소 특약 필요 여부",
  },
  {
    label: "불법 건축물 여부",
    how: "건축물대장에서 위반건축물 표기 확인",
  },
  {
    label: "임대인 세금 체납",
    how: "계약 전 국세·지방세 완납증명 열람 동의 요청",
  },
  {
    label: "HUG·SGI 보증보험 가입 가능성",
    how: "보증금·주택 요건 충족 여부를 공사 홈페이지에서 조회",
  },
] as const;

export default function SafetyPage() {
  const [mode, setMode] = useState<Mode>("전세");
  const [address, setAddress] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const submit = () => {
    const q = address.trim();
    if (!q) return;
    setSubmitted(q);
  };

  return (
    <PageShell breadcrumb="전세·월세 모드 › 세입자 안전 분석" wide>
      {/* 상단 모드 전환 + 대상 입력 */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-line bg-surface p-[3px] text-xs">
          {(["매매", "전세", "월세"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3.5 py-1.5 ${
                mode === m ? "bg-ink font-bold text-white" : "text-text-3"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          }}
          placeholder="주소 또는 단지명을 입력하세요 (예: 관양동 ○○아파트)"
          className="min-w-[220px] flex-1 rounded-[10px] border border-line bg-surface px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!address.trim()}
          className="btn-primary rounded-[10px] px-4 py-2 text-[13px] disabled:opacity-50"
        >
          안전 진단
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-3.5">
          {/* 진단 상태 — 결과를 지어내지 않는다 */}
          {submitted ? (
            <div className="rise-in-1 card flex flex-col gap-2.5 rounded-[20px] p-[22px]">
              <div className="text-[15px] font-extrabold text-ink">
                “{submitted}” {mode} 안전 진단
              </div>
              <p className="text-[13px] leading-[1.7] text-text-2">
                등기부·건축물대장 자동 대조 진단은 <b className="text-ink">준비 중</b>
                이에요. 지금은 자동 판정 결과를 제공하지 않아요 — 아래 체크리스트로
                계약 전 직접 확인하시고, 기능이 열리면 알림으로 안내해 드릴게요.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href="/notifications"
                  className="btn-primary rounded-[10px] px-4 py-2.5 text-xs no-underline"
                >
                  오픈 알림 받기
                </Link>
                <Link
                  href="/notes/new"
                  className="btn-secondary rounded-[10px] px-4 py-2.5 text-xs no-underline"
                >
                  이 집 임장노트 쓰기
                </Link>
              </div>
            </div>
          ) : (
            <div className="rise-in-1 card flex flex-col gap-1.5 rounded-[20px] p-[22px]">
              <div className="text-[15px] font-extrabold text-ink">
                계약 전, 보증금을 지키는 6가지 확인
              </div>
              <p className="text-[13px] leading-[1.7] text-text-2">
                주소를 입력하면 해당 매물 기준으로 확인 항목을 정리해 드려요.
                등기부 자동 분석 진단 기능은 준비 중입니다.
              </p>
            </div>
          )}

          {/* 세입자 체크리스트 — 항목·확인 방법 안내 (판정값 없음) */}
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[20px] p-[22px]">
            <div className="text-[15px] font-extrabold text-ink">
              세입자 체크리스트{" "}
              <span className="text-[11px] font-medium text-text-3">
                직접 확인 가이드
              </span>
            </div>
            {CHECK_ITEMS.map((c, i) => (
              <div
                key={c.label}
                className={`flex flex-col gap-0.5 py-[9px] ${
                  i < CHECK_ITEMS.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <span className="text-[13px] font-bold text-text-1">{c.label}</span>
                <span className="text-[11px] text-text-3">{c.how}</span>
              </div>
            ))}
            <div className="text-[10px] text-[#adb5bd]">
              등기부등본은 인터넷등기소(iros.go.kr), 건축물대장은
              정부24(gov.kr)에서 열람할 수 있어요
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3.5">
          <div className="rise-in-3">
            <AIPanel title="계약 전 필수 3가지" className="rounded-[18px]">
              ① 잔금일에 <b className="text-[#7ea2ff]">근저당 말소 동시 진행</b>{" "}
              특약 ② 전입신고+확정일자 즉시 (대항력) ③ 임대인 국세 완납증명 요청 —
              거부 시 계약 재고
            </AIPanel>
          </div>
          <div className="rise-in-4 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">
              전세 vs 월세 vs 매수, 뭐가 유리할까
            </div>
            <p className="text-xs leading-[1.6] text-text-2">
              대출 금리·기회비용을 넣고 월 부담을 직접 비교해 보세요.
            </p>
            <Link
              href="/calculator"
              className="btn-soft mt-1 rounded-[10px] p-2.5 text-center text-xs no-underline"
            >
              대출·비용 계산기로 비교하기
            </Link>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
