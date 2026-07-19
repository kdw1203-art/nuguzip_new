"use client";

import { useState } from "react";
import Link from "next/link";
import { HoloAvatar, TopScoutBadge } from "../../components/TopScoutBadge";

/* 시안 22e(#51–60) 내 콘텐츠 성과 + 23c(#16–25) 탑 임장러 현황 — 탭 전환 */

const TABS = ["콘텐츠 성과", "탑 임장러 현황"] as const;
type Tab = (typeof TABS)[number];

const STATS = [
  { label: "조회", value: "12.4k" },
  { label: "저장", value: "1,180" },
  { label: "SNS 공유", value: "214" },
  { label: "검색 노출", value: "3.1k" },
];

/* 23c 선정 기준 4항목 (분기 심사 · 구매 불가) */
const CRITERIA = [
  { label: "90일 팔로워", value: "500+ ✓ (1,204)" },
  { label: "노트 저장률", value: "상위 5% ✓" },
  { label: "유입 기여 (가입)", value: "20명+ ✓ (34)" },
  { label: "품질 점수 (충실도)", value: "충족 ✓" },
];

/* 23c 인센티브 5종 */
const INCENTIVES = [
  { name: "1 프로 구독 무료", desc: "활동 유지 조건부 · 분기 갱신" },
  { name: "2 리포트 수수료 7%", desc: "전문가 구독과 동일 요율" },
  { name: "3 노출 부스트", desc: "추천 가중 + 새 노트 24h 피처링" },
  { name: "4 월간 성과 리포트 + 1:1 채널", desc: "운영팀 직통" },
  { name: "5 모임 수수료 5% + 챌린지 우선", desc: "모임 요율표 준용" },
];

function PerformanceTab() {
  return (
    <div className="flex flex-col gap-3">
      {/* 상단 글래스 바 — 최근 30일 + 레벨 (22e #51) */}
      <div className="glass rise-in flex flex-wrap items-center gap-3 rounded-[14px] px-4 py-3">
        <span className="text-[14px] font-extrabold text-ink">
          내 콘텐츠 성과
        </span>
        <span className="text-[12px] text-text-3">최근 30일</span>
        <span className="ml-auto rounded-full bg-primary-soft px-[10px] py-1 text-[11px] font-extrabold text-primary">
          로컬 전문가 Lv.3 · 다음 레벨까지 노트 5
        </span>
      </div>

      {/* 지표 4종 */}
      <div className="rise-in-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="card px-3 py-[10px]">
            <div className="text-[10px] text-text-3">{s.label}</div>
            <div className="mt-[2px] text-[17px] font-extrabold tabular-nums text-ink">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* 유입 기여 보상 (22e #53) */}
      <div className="rise-in-3 card flex items-center justify-between px-4 py-3">
        <span className="text-[12px] text-text-1">
          <b className="text-[#1a7f4e]">내 노트로 가입 34명</b> — 유입 기여 보상
        </span>
        <span className="text-[12px] font-extrabold text-primary">
          +AI 크레딧 17회 받기
        </span>
      </div>

      {/* 유입 채널 어트리뷰션 (22d #50) */}
      <div className="rise-in-4 card flex items-center justify-between px-4 py-3">
        <span className="text-[12px] text-text-1">
          유입 채널: 인스타 48% · 검색 31% · 카톡 14% · 기타
        </span>
        <span className="text-[11px] text-text-3">채널별 보기 ›</span>
      </div>

      {/* 유료 리포트 승격 제안 (22e #55) — 잉크 패널 */}
      <div className="rise-in-5 flex items-center justify-between rounded-[14px] bg-ink/[0.96] px-4 py-3">
        <span className="text-[12px] text-[#e2e8f2]">
          공작 302동 노트가 저장 200 돌파 —{" "}
          <b className="text-[#f2c94c]">유료 리포트로 승격</b>해 보세요
        </span>
        <Link
          href="/library"
          className="shrink-0 text-[12px] font-extrabold text-[#7ea2ff]"
        >
          시작 ›
        </Link>
      </div>

      {/* 시즌 챌린지 (22e #57) */}
      <div className="rise-in-6 card flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-[13px] font-extrabold text-ink">
            시즌 챌린지 — 3주 3노트
          </div>
          <div className="mt-[2px] text-[11px] text-text-3">
            참여 배지 + 노출 가중 · 현재 1/3 완료
          </div>
        </div>
        <Link href="/notes/new" className="btn-soft btn-sm shrink-0">
          이어서 쓰기
        </Link>
      </div>

      {/* 협찬 라벨 원칙 (22e #59) */}
      <div className="rise-in-6 rounded-[12px] bg-primary-soft px-4 py-[10px] text-[11px] font-bold leading-[1.6] text-primary">
        협찬·제공 받은 임장은 반드시 &quot;광고&quot; 라벨을 켜야 해요 — 미표시
        확인 시 노출 제한
      </div>
    </div>
  );
}

function TopScoutTab() {
  return (
    <div className="flex flex-col gap-3">
      {/* 배지 상태 — 잉크 패널 (23c) */}
      <div className="rise-in rounded-[20px] bg-ink/[0.96] p-5">
        <div className="flex items-center gap-3">
          <HoloAvatar size={52} label="임장러버 — 탑 임장러" />
          <div>
            <div className="flex items-center gap-[6px]">
              <span className="text-[15px] font-extrabold text-white">
                임장러버
              </span>
              <TopScoutBadge />
            </div>
            <div className="mt-[2px] text-[10px] text-[#9aa6b8]">
              홀로그램 링 = 시그니처 · 프로필·피드 카드·댓글에 노출
            </div>
          </div>
        </div>
        <div className="mt-3 text-[10px] leading-[1.6] text-[#9aa6b8]">
          다음 재심사 10/1 · 조건 미달 시 강등 전 30일 유예 + 소명 · 광고
          미표시·허위 방문 확정 시 즉시 회수
        </div>
      </div>

      {/* 유지 조건 게이지 · 다음 심사 · 혜택 수령 */}
      <div className="rise-in-2 grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="card px-4 py-3">
          <div className="text-[11px] text-text-3">유지 조건 게이지</div>
          <div className="mt-2 h-[6px] overflow-hidden rounded-[3px] bg-line">
            <span className="block h-full w-[82%] rounded-[3px] bg-primary" />
          </div>
          <div className="mt-2 text-[12px] font-bold text-text-1">
            4/4 충족 · 여유 82%
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-[11px] text-text-3">다음 심사</div>
          <div className="mt-1 text-[20px] font-extrabold text-ink">D-42</div>
          <div className="text-[11px] text-text-3">분기 재심사 10/1</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-[11px] text-text-3">이번 분기 혜택 수령</div>
          <div className="mt-1 text-[13px] font-extrabold leading-[1.5] text-ink">
            구독 57,000원
            <br />+ 수수료 절감 31,200원
          </div>
        </div>
      </div>

      {/* 선정 기준 4항목 카드 */}
      <div className="rise-in-3 card px-4 py-4">
        <div className="text-[13px] font-extrabold text-ink">
          선정 기준 (분기 심사 · 구매 불가)
        </div>
        <div className="mt-2 grid grid-cols-1 gap-[6px] md:grid-cols-2">
          {CRITERIA.map((c) => (
            <div
              key={c.label}
              className="flex items-center justify-between rounded-[9px] bg-bg px-3 py-[9px]"
            >
              <span className="text-[12px] text-text-1">{c.label}</span>
              <b className="text-[12px] text-primary">{c.value}</b>
            </div>
          ))}
        </div>
      </div>

      {/* 인센티브 5종 표 */}
      <div className="rise-in-4 card px-4 py-4">
        <div className="text-[13px] font-extrabold text-ink">인센티브 5종</div>
        <div className="mt-2 flex flex-col gap-1">
          {INCENTIVES.map((it) => (
            <div
              key={it.name}
              className="flex flex-col justify-between gap-[2px] rounded-[9px] bg-bg px-3 py-[9px] md:flex-row md:items-center"
            >
              <span className="text-[12px] font-bold text-text-1">
                {it.name}
              </span>
              <span className="text-[11px] text-text-3">{it.desc}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 rounded-[10px] bg-primary-soft px-3 py-[9px] text-[11px] font-bold leading-[1.6] text-primary">
          원칙: 인센티브는 노출·수수료·도구 — 현금 지급 없음 · 배지가
          데이터·랭킹을 왜곡하지 않음 (품질 점수와 분리)
        </div>
      </div>
    </div>
  );
}

export function CreatorClient() {
  const [tab, setTab] = useState<Tab>("콘텐츠 성과");

  return (
    <div>
      <div className="mb-4 flex gap-[6px]">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={tab === t ? "chip-active" : "chip"}
          >
            {t === "탑 임장러 현황" ? "◈ 탑 임장러 현황" : t}
          </button>
        ))}
      </div>
      {tab === "콘텐츠 성과" ? <PerformanceTab /> : <TopScoutTab />}
    </div>
  );
}
