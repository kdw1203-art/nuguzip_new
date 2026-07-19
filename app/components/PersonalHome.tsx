"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* S13-13a 홈 이원화 — 정적 CDN 셸 위에 로그인 개인화 지연 주입 (시안 9m 데스크탑 · 10g 모바일)
   마운트 후 /api/auth/session → 로그인일 때만 /api/home/personal 로드.
   비로그인·로딩·에러 시 null 반환 → 기존 정적 홈(ISR)이 그대로 보임.
   렌더 시 body[data-personal-active] 세팅 → page.tsx의 [data-static-hero] 요소 숨김 */

type PersonalRecentNote = {
  id: string;
  title: string;
  region: string;
  aptName: string | null;
  createdAt: string;
  pendingChecklist: number | null;
};

/** #43 관심지역 매칭 지역 시세 1건 (/api/home/personal → loadNewHomeData regions) */
type PersonalRegionMarket = {
  id: string;
  name: string;
  meta: string;
  price: string;
  delta: string;
  tone: "up" | "down" | "flat";
};

type PersonalHomeData = {
  nickname: string | null;
  plan: string | null;
  noteCount: number | null;
  recentNote: PersonalRecentNote | null;
  compareCount: number | null;
  primaryRegion: string | null;
  regions: string[] | null;
  todoCount: number | null;
  regionMarket: PersonalRegionMarket | null;
};

const DELTA_CLASS: Record<PersonalRegionMarket["tone"], string> = {
  up: "delta-up",
  down: "delta-down",
  flat: "delta-flat",
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 내집찾기 여정 5단계 — 노트 수 기반 (허위 수치 없이 실데이터로만 산정) */
function journeyOf(noteCount: number | null) {
  if (noteCount === null) return null;
  if (noteCount === 0)
    return { step: 1, label: "시작", next: "첫 노트 작성" };
  if (noteCount <= 2)
    return { step: 2, label: "후보 탐색", next: "후보 단지 노트 늘리기" };
  if (noteCount <= 5)
    return { step: 3, label: "후보 좁히기", next: "회차 비교로 좁히기" };
  return { step: 4, label: "판단 임박", next: "AI 분석으로 판단 정리" };
}

export function PersonalHome() {
  const [data, setData] = useState<PersonalHomeData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sRes = await fetch("/api/auth/session");
        if (!sRes.ok) return;
        const s = (await sRes.json().catch(() => null)) as {
          user?: { email?: string | null };
        } | null;
        if (!s?.user?.email) return; // 비로그인 → 정적 홈 유지
        const pRes = await fetch("/api/home/personal");
        if (!pRes.ok) return;
        const d = (await pRes.json()) as PersonalHomeData;
        if (!cancelled) setData(d);
      } catch {
        /* 에러 시 정적 홈 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    document.body.setAttribute("data-personal-active", "1");
    return () => {
      document.body.removeAttribute("data-personal-active");
    };
  }, [data]);

  if (!data) return null;

  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 ${DAY_LABELS[now.getDay()]}요일`;
  const name = data.nickname?.trim() || "회원";
  const journey = journeyOf(data.noteCount);
  const region =
    data.primaryRegion?.trim() ||
    (data.regions && data.regions.length > 0 ? data.regions[0] : null);
  const extraRegions =
    data.regions && data.regions.length > 1 ? data.regions.length - 1 : 0;
  /* #43 관심지역 칩 — 클릭 시 지도 탐색으로 이동 (/map 은 아직 ?region= 쿼리 미지원) */
  const regionChips = (
    data.regions && data.regions.length > 0 ? data.regions : region ? [region] : []
  ).slice(0, 3);
  const regionMarket = data.regionMarket;

  // 히어로 문구 — 실데이터 있으면 치환, 없으면 일반 안내 (허위 수치 금지)
  const heroSub = data.recentNote
    ? `최근 노트 ‘${data.recentNote.aptName || data.recentNote.title}’`
    : "3분 기록 → AI 정리 → 지도 비교";
  const heroTitle =
    data.noteCount !== null && data.noteCount > 0
      ? `임장노트 ${data.noteCount}개, 판단에 가까워지고 있어요`
      : "오늘 본 집, 지금 기록해 볼까요?";

  const chip = (v: number | null) => (v !== null ? String(v) : "—");

  /* 맞춤 제안 3종 — 실데이터 있으면 치환, 없으면 일반 안내 문구 */
  const noteCard = data.recentNote
    ? {
        title: `‘${data.recentNote.aptName || data.recentNote.title}’ 노트를 이어서 완성해 보세요`,
        desc:
          data.recentNote.pendingChecklist !== null &&
          data.recentNote.pendingChecklist > 0
            ? `체크리스트 ${data.recentNote.pendingChecklist}개 항목이 아직 미확인입니다. 다음 방문 전에 점검해 보세요.`
            : "체크리스트가 잘 채워져 있어요. 회차 비교로 판단 근거를 쌓아 보세요.",
        cta: "내 노트 보기 ›",
      }
    : {
        title: "첫 임장노트를 시작해 보세요",
        desc: "3분 기록이면 AI가 장단점과 시세 맥락을 정리해 드립니다.",
        cta: "노트 시작하기 ›",
      };

  const regionCard = {
    title: region
      ? `${region} 후보 단지를 비교해 보세요`
      : "관심지역 후보를 나란히 비교해 보세요",
    desc:
      data.compareCount !== null && data.compareCount > 0
        ? `비교 중인 후보가 ${data.compareCount}곳 있어요. 학군·연식·예산 조건별로 살펴보세요.`
        : "관심 단지를 비교함에 담으면 학군·연식·예산 조건별로 나란히 볼 수 있어요.",
    cta: "후보 비교 열기 ›",
  };

  const marketCard = {
    title: "매수 타이밍 신호 확인하기",
    desc: regionMarket
      ? `${regionMarket.name} 평균 ${regionMarket.price} (${regionMarket.delta}) — 거래량·시세 흐름을 타이밍 분석에서 확인해 보세요.`
      : region
        ? `${region} 거래량·시세 흐름을 타이밍 분석에서 확인해 보세요.`
        : "관심 지역의 거래량·시세 흐름을 타이밍 분석에서 확인해 보세요.",
    cta: "타이밍 분석 보기 ›",
  };

  const suggestions = [
    {
      badge: "맞춤 제안 · 노트 기반",
      badgeClass: "bg-primary-soft text-primary",
      emoji: "📝",
      href: "/notes",
      ...noteCard,
    },
    {
      badge: "맞춤 제안 · 지역 기반",
      badgeClass: "bg-[#fdf3e7] text-[#c07a3a]",
      emoji: "🗺",
      href: "/analysis/compare",
      ...regionCard,
    },
    {
      badge: "맞춤 제안 · 시장",
      badgeClass: "bg-[#f2f4f8] text-text-2",
      emoji: "⏱",
      href: "/analysis/timing",
      ...marketCard,
    },
  ];

  return (
    <>
      {/* 개인화 활성 시 정적 히어로 숨김 (page.tsx의 data-static-hero) */}
      <style>{`body[data-personal-active="1"] [data-static-hero]{display:none !important;}`}</style>

      {/* ===== 모바일 (10g 축약형) ===== */}
      <section className="mb-3 flex flex-col gap-3 md:hidden">
        <div
          className="rise-in relative flex flex-col gap-3 overflow-hidden rounded-[20px] p-[18px]"
          style={{
            background: "rgba(25,31,40,.96)",
            boxShadow: "0 14px 36px rgba(16,28,54,.22)",
          }}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-[130px] w-[130px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(29,79,216,.28), transparent 70%)",
            }}
          />
          <div className="text-[11px] text-[#9aa6b8]">
            {dateLabel} · 오늘도 좋은 임장 되세요
          </div>
          <div className="text-[19px] font-extrabold leading-[1.4] text-white">
            {name}님,{" "}
            {data.noteCount !== null && data.noteCount > 0 ? (
              <>
                임장노트 <span className="text-[#7ea2ff]">{data.noteCount}개</span>를
                쌓았어요
              </>
            ) : (
              <span className="text-[#7ea2ff]">첫 노트를 시작해 볼까요?</span>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              href={data.recentNote ? `/notes/${data.recentNote.id}` : "/notes/new"}
              className="flex-1 rounded-xl bg-primary p-3 text-center text-[13px] font-bold text-white"
              style={{ boxShadow: "0 8px 20px rgba(29,79,216,.4)" }}
            >
              {data.recentNote ? "이어서 하기" : "노트 쓰기"}
            </Link>
            <Link
              href="/map"
              className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-[13px] font-bold text-[#c9d2e0]"
            >
              지도
            </Link>
          </div>
          {regionChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-[#9aa6b8]">📍 관심지역</span>
              {regionChips.map((r) => (
                <Link
                  key={r}
                  href="/map"
                  className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-bold text-[#c9d2e0]"
                >
                  {r} ›
                </Link>
              ))}
            </div>
          )}
          {journey && (
            <div className="flex items-center gap-2 rounded-xl bg-white/[.06] px-3 py-2.5">
              <div className="flex-1">
                <div className="text-[9px] text-[#9aa6b8]">
                  내집찾기 여정 · {journey.step}/5 단계 — {journey.label}
                </div>
                <div className="relative mt-1 h-[5px] rounded-[3px] bg-white/10">
                  <div
                    className="absolute left-0 h-[5px] rounded-[3px] bg-primary"
                    style={{ width: `${(journey.step / 5) * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-[10px] font-extrabold text-[#7ea2ff]">
                다음: {journey.next}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ===== 데스크탑 (9m) ===== */}
      <section className="mb-4 hidden flex-col gap-4 md:flex">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
          {/* 잉크 다크 개인화 히어로 */}
          <div
            className="rise-in relative flex flex-col gap-4 overflow-hidden rounded-[22px] px-7 py-[26px]"
            style={{
              background: "rgba(25,31,40,.96)",
              boxShadow: "0 20px 50px rgba(16,28,54,.25)",
            }}
          >
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-[200px] w-[200px] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(29,79,216,.25), transparent 70%)",
              }}
            />
            <div className="text-[13px] text-[#9aa6b8]">
              {dateLabel} · 오늘도 좋은 임장 되세요
            </div>
            <div className="text-[26px] font-extrabold leading-[1.35] text-white">
              {name}님, {heroTitle}
              <br />
              <span className="text-[#7ea2ff]">{heroSub}</span>
            </div>
            <div className="flex gap-2.5">
              <Link
                href={data.recentNote ? `/notes/${data.recentNote.id}` : "/notes/new"}
                className="rounded-xl bg-primary px-[22px] py-3 text-[13px] font-bold text-white"
                style={{ boxShadow: "0 8px 22px rgba(29,79,216,.45)" }}
              >
                {data.recentNote ? "최근 노트 이어서 완성하기" : "임장노트 쓰기"}
              </Link>
              <Link
                href="/analysis"
                className="rounded-xl border border-white/10 bg-white/10 px-[22px] py-3 text-[13px] font-bold text-[#c9d2e0]"
              >
                AI 분석 열기
              </Link>
            </div>
            {/* 여정 트래커 + 통계 칩 3개 (실데이터, 없으면 —) */}
            <div className="mt-0.5 flex gap-2">
              <div className="flex-1 rounded-xl bg-white/[.06] px-3.5 py-3">
                <div className="text-[10px] text-[#9aa6b8]">내집찾기 여정</div>
                {journey ? (
                  <>
                    <div className="mt-[5px] flex items-center gap-2">
                      <div className="relative h-1.5 flex-1 rounded-[3px] bg-white/10">
                        <div
                          className="absolute left-0 h-1.5 rounded-[3px] bg-primary"
                          style={{ width: `${(journey.step / 5) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-extrabold text-[#7ea2ff]">
                        {journey.step}/5 단계
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-[#9aa6b8]">
                      {journey.label} →{" "}
                      <b className="text-white">다음: {journey.next}</b>
                    </div>
                  </>
                ) : (
                  <div className="mt-[5px] text-[11px] font-extrabold text-[#9aa6b8]">
                    —
                  </div>
                )}
              </div>
              {[
                { label: "노트", value: chip(data.noteCount), color: "text-white" },
                {
                  label: "비교 중",
                  value: chip(data.compareCount),
                  color: "text-[#7ea2ff]",
                },
                {
                  label: "할 일",
                  value: chip(data.todoCount),
                  color: "text-[#f2c94c]",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl bg-white/[.06] px-4 py-3 text-center"
                >
                  <div className="text-[10px] text-[#9aa6b8]">{s.label}</div>
                  <div className={`text-base font-extrabold ${s.color}`}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 관심지역 미니지도 자리 */}
          <div className="rise-in-1 relative min-h-[220px] overflow-hidden rounded-[22px] border border-line bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef]">
            <div className="glass absolute left-3.5 top-3.5 rounded-[10px] px-3 py-[7px] text-[11px] font-bold text-ink">
              📍 내 관심지역{region ? ` · ${region}` : " · 미설정"}
              {extraRegions > 0 ? ` 외 ${extraRegions}` : ""}
            </div>
            {/* #43 관심지역 칩 → 지도 탐색 */}
            {regionChips.length > 0 && (
              <div className="absolute left-3.5 top-[52px] flex flex-wrap gap-1.5">
                {regionChips.map((r) => (
                  <Link
                    key={r}
                    href="/map"
                    className="glass rounded-full px-2.5 py-1 text-[10px] font-extrabold text-primary"
                  >
                    {r} ›
                  </Link>
                ))}
              </div>
            )}
            {/* #43 관심지역 매칭 지역 시세 1건 */}
            {regionMarket && (
              <div className="glass absolute right-3.5 top-3.5 rounded-[10px] px-3 py-[7px] text-right">
                <div className="text-[10px] font-semibold text-text-2">
                  {regionMarket.name} · {regionMarket.meta}
                </div>
                <div className="text-xs font-extrabold text-ink">
                  {regionMarket.price}{" "}
                  <span className={DELTA_CLASS[regionMarket.tone]}>
                    {regionMarket.delta}
                  </span>
                </div>
              </div>
            )}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#7d8aa0]">
              네이버/카카오 지도 SDK 영역
            </div>
            <Link
              href="/map"
              className="glass absolute bottom-3.5 left-3.5 right-3.5 flex items-center justify-between rounded-xl px-3.5 py-2.5"
            >
              <span className="text-[11px] text-text-2">
                {region
                  ? `${region} 주변 실거래·노트를 지도에서 확인`
                  : "관심지역을 설정하고 지도에서 살펴보세요"}
              </span>
              <span className="text-[11px] font-extrabold text-primary">
                지도 열기 ›
              </span>
            </Link>
          </div>
        </div>

        {/* 맞춤 제안 카드 3종 */}
        <div className="rise-in-2 grid grid-cols-3 gap-3.5">
          {suggestions.map((c) => (
            <Link
              key={c.badge}
              href={c.href}
              className="card card-hover flex flex-col gap-[9px] rounded-[18px] p-5"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-md px-[9px] py-[3px] text-[11px] font-extrabold ${c.badgeClass}`}
                >
                  {c.badge}
                </span>
                <span className="text-sm">{c.emoji}</span>
              </div>
              <div className="text-[15px] font-extrabold leading-[1.4] text-ink">
                {c.title}
              </div>
              <div className="text-xs leading-[1.6] text-text-2">{c.desc}</div>
              <div className="mt-auto text-xs font-bold text-primary">{c.cta}</div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
