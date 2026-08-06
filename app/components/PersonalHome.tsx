"use client";

import { getSessionLite } from "@/lib/client/session-lite";
import { getHomePersonal } from "@/lib/client/home-personal";
import { isDeltaUnknown } from "@/lib/newui/delta-label";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { HomeResumePanel } from "./HomeResumePanel";
import {
  HOME_CTA_AI,
  HOME_CTA_MAP,
  HOME_CTA_NOTE,
  HOME_HERO_SUBLINE,
} from "@/lib/brand/home-copy";

/* S13-13a 홈 이원화 — 정적 CDN 셸 위에 로그인 개인화 지연 주입 (시안 9m 데스크탑 · 10g 모바일)
   마운트 후 /api/auth/session → 로그인일 때만 /api/home/personal 로드.
   비로그인·에러 시 정적 홈으로 되돌린다 — 조기 숨김 플래그(data-personal-active)를
   같이 풀어야 한다(revertToStatic). 풀지 않으면 스켈레톤이 영구히 남고,
   이 플래그를 보고 스스로를 감추는 다른 컴포넌트(JourneyBanner)도 계속 숨는다.
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

/** 온보딩 개인화 — 관심 지역(허브 링크)·예산·목적 */
type PurposeId = "live" | "invest" | "jeonse";
type ResolvedRegion = { name: string; regionId: string | null; gu: string };
type PersonalPreferences = {
  regions: ResolvedRegion[];
  budget: {
    type: "sale" | "jeonse";
    min: number | null;
    max: number | null;
    label: string | null;
  } | null;
  purpose: PurposeId | null;
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
  /** 캡처 개선(2026-08-04) — regionId → 지역 시세 칩. 없는 지역은 키 없음 */
  regionChips?: Record<
    string,
    { price: string; delta: string; tone: "up" | "down" | "flat" }
  > | null;
  regionMarket: PersonalRegionMarket | null;
  preferences: PersonalPreferences | null;
  /** preferences=null 이 "조회 실패"였는지. 서버가 아직 안 내려주는 배포가
      섞여 있을 수 있어 optional 로 받는다(없으면 예전대로 미설정 취급). */
  preferencesUnavailable?: boolean;
};

const PURPOSE_META: Record<
  PurposeId,
  { label: string; emoji: string; rec: string }
> = {
  live: {
    label: "실거주",
    emoji: "🏠",
    rec: "실거주 관점에서 학군·생활환경이 좋은 단지를 우선 살펴보세요.",
  },
  invest: {
    label: "투자",
    emoji: "📈",
    rec: "투자 관점에서 시세 흐름·개발 호재를 먼저 확인해 보세요.",
  },
  jeonse: {
    label: "전세",
    emoji: "🔑",
    rec: "전세 매물과 전세가율 흐름을 함께 확인해 보세요.",
  },
};

/** 예산 구간 라벨 (억 단위) */
function budgetRangeLabel(
  b: NonNullable<PersonalPreferences["budget"]>,
): string {
  if (b.label) return b.label;
  if (b.min != null && b.max != null) return `${b.min}~${b.max}억`;
  if (b.max != null) return `${b.max}억 이하`;
  if (b.min != null) return `${b.min}억 이상`;
  return "예산 미설정";
}

/** 웰컴 예산·지역 → 지도 필터 프리필 (`/map?type=&priceMin=&priceMax=&region=`) */
function budgetMapHref(
  region: string | null | undefined,
  budget: PersonalPreferences["budget"] | null | undefined,
): string {
  const params = new URLSearchParams();
  if (region?.trim()) params.set("region", region.trim());
  if (budget) {
    params.set("type", budget.type === "jeonse" ? "jeonse" : "sale");
    if (budget.min != null && Number.isFinite(budget.min)) {
      params.set("priceMin", String(budget.min));
    }
    if (budget.max != null && Number.isFinite(budget.max)) {
      params.set("priceMax", String(budget.max));
    }
  }
  const q = params.toString();
  return q ? `/map?${q}` : "/map";
}

const DELTA_CLASS: Record<PersonalRegionMarket["tone"], string> = {
  up: "delta-up",
  down: "delta-down",
  flat: "delta-flat",
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 내집찾기 여정 4단계 — 노트→AI→지도 루프 (허위 수치 없이 실데이터로만 산정).
    고도화 23 — next 는 문구가 아니라 행동이다. 눌러서 그 단계로 가는 href 를 함께 든다. */
const JOURNEY_TOTAL = 4;
function journeyOf(noteCount: number | null) {
  if (noteCount === null) return null;
  if (noteCount === 0)
    return { step: 1, label: "시작", next: "첫 노트 작성", nextHref: "/notes/new" };
  if (noteCount <= 2)
    return { step: 2, label: "기록 쌓기", next: "AI로 판단 정리", nextHref: "/analysis" };
  if (noteCount <= 5)
    return { step: 3, label: "AI 정리", next: "지도에서 후보 비교", nextHref: "/map" };
  return { step: 4, label: "비교·판단", next: "지도에서 후보 좁히기", nextHref: "/map" };
}

export function PersonalHome() {
  const [data, setData] = useState<PersonalHomeData | null>(null);
  // 이전 방문에서 로그인 개인화가 활성이었으면(플래그) 정적 히어로를 즉시 숨겨
  // "옛 정적 화면이 잠깐 보였다 사라지는" 플래시를 방지한다.
  const [primed, setPrimed] = useState(false);

  useEffect(() => {
    let flagged = false;
    try {
      flagged = window.localStorage.getItem("nz_home_personal") === "1";
    } catch {
      /* 프라이빗 모드 등 — 플래그 없이 진행 */
    }
    if (flagged) {
      setPrimed(true);
      document.body.setAttribute("data-personal-active", "1");
    }
  }, []);

  /* 개인화를 못 그리게 됐을 때 정적 홈으로 되돌리는 한 곳.
     실측(로컬 프로덕션 빌드 + /api/home/personal 500): 이걸 안 하면
     `data-personal-active=1` 이 걸린 채 스켈레톤이 계속 렌더된다. */
  const revertToStatic = useCallback(() => {
    setPrimed(false);
    document.body.removeAttribute("data-personal-active");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 최적화 26 — 공유 세션 조회로 수렴
        const s = await getSessionLite();
        if (!s?.user?.email) {
          // 비로그인 → 정적 홈 복귀 + 조기 숨김 해제 + 플래그 정리
          if (!cancelled) {
            try {
              window.localStorage.removeItem("nz_home_personal");
            } catch {
              /* noop */
            }
            revertToStatic();
          }
          return;
        }
        /* 최적화 — 같은 라우트를 미니지도(모바일·데스크탑 2벌)도 부른다.
           공유 프라미스로 한 번만 나가게 모은다. */
        const d = await getHomePersonal<PersonalHomeData>();
        if (!d) {
          if (!cancelled) revertToStatic();
          return;
        }
        if (!cancelled) {
          setData(d);
          try {
            window.localStorage.setItem("nz_home_personal", "1");
          } catch {
            /* noop */
          }
        }
      } catch {
        /* 개인화를 못 가져왔으면 정적 홈으로 되돌린다.
           예전 주석은 "에러 시 정적 홈 유지"였는데 사실이 아니었다. 재방문자는
           위 effect 에서 이미 `data-personal-active=1` 이 걸린 상태라, 여기서
           그냥 return 하면 **스켈레톤이 영구히 남는다**.
           실측(로컬 프로덕션 빌드, /api/home/personal 을 500 으로 응답):
           고치기 전에는 회색 스켈레톤이 정적 히어로 위에 그대로 얹혀 남았고
           (히어로가 사라지진 않았다 — 숨김 <style> 은 로드 성공 분기에만 있다),
           플래그를 보고 자기를 감추는 JourneyBanner 도 계속 숨은 채였다.
           고친 뒤에는 같은 조건에서 `data-personal-active` 가 풀린다.
           플래그(nz_home_personal)는 지우지 않는다 — 로그인 자체가 실패한 건
           아니라서, 다음 방문에 다시 개인화를 시도하는 편이 맞다. */
        if (!cancelled) revertToStatic();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [revertToStatic]);

  useEffect(() => {
    if (!data) return;
    document.body.setAttribute("data-personal-active", "1");
  }, [data]);

  if (!data) {
    // 로그인 확인된 재방문 → 정적 히어로 대신 로딩 스켈레톤(플래시 방지)
    if (primed) {
      return (
        <div
          /* 스켈레톤이 남아 있는지 밖에서 잴 수 있게 표시해 둔다
             (scripts/.probe-*: 개인화 실패 후 이 노드가 사라져야 한다) */
          data-personal-skeleton=""
          className="rise-in mt-2 overflow-hidden rounded-[18px] bg-[#141a26] p-[var(--pad-hero)] md:rounded-[22px] md:p-5"
        >
          <div className="h-3 w-28 rounded bg-white/10" />
          <div className="mt-3 h-6 w-3/5 rounded bg-white/10" />
          <div className="mt-2 h-6 w-2/5 rounded bg-white/10" />
          <div className="mt-4 flex gap-2.5">
            <div className="h-11 w-40 rounded-xl bg-white/10" />
            <div className="h-11 w-32 rounded-xl bg-white/[.06]" />
          </div>
          <div className="mt-4 h-16 rounded-xl bg-white/[.05]" />
        </div>
      );
    }
    return null;
  }

  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 ${DAY_LABELS[now.getDay()]}요일`;
  const name = data.nickname?.trim() || "회원";
  const journey = journeyOf(data.noteCount);
  const region =
    data.primaryRegion?.trim() ||
    (data.regions && data.regions.length > 0 ? data.regions[0] : null);
  const extraRegions =
    data.regions && data.regions.length > 1 ? data.regions.length - 1 : 0;
  /* #43 관심지역 칩 — 클릭 시 그 지역 지도로 이동.
     2026-07-27 이전에는 세 칩이 모두 그냥 "/map" 이었다. 칩마다 다른 지역
     이름이 적혀 있는데 눌러 보면 항상 같은 수도권 지도가 떠서, 눌러도 아무
     일도 일어나지 않은 것처럼 보였다. MapPage 가 ?region= 을 받도록 고쳤다. */
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

  const mapHref = data.preferences?.budget
    ? budgetMapHref(region, data.preferences.budget)
    : region
      ? `/map?region=${encodeURIComponent(region)}`
      : HOME_CTA_MAP.href;

  const regionCard = {
    title: region
      ? `${region} 후보를 지도에서 비교해 보세요`
      : "관심지역 후보를 지도에서 비교해 보세요",
    desc:
      data.compareCount !== null && data.compareCount > 0
        ? `비교 중인 후보가 ${data.compareCount}곳 있어요. 지도에서 시세·노트 맥락을 나란히 보세요.`
        : "단지를 고르고 임장노트·AI 정리 후 지도에서 후보를 비교해요.",
    cta: `${HOME_CTA_MAP.label} ›`,
  };

  const aiCard = {
    title: "기록을 AI로 정리해 보세요",
    desc: data.recentNote
      ? `「${data.recentNote.title}」기준으로 장단점·시세 맥락을 정리할 수 있어요.`
      : "임장노트를 남기면 AI가 판단 근거로 정리해 드려요.",
    cta: `${HOME_CTA_AI.label} ›`,
  };

  /* 루프 순서: 노트 → AI → 지도 */
  const suggestions = [
    {
      badge: "맞춤 제안 · 노트",
      badgeClass: "bg-primary-soft text-primary",
      emoji: "📝",
      /* A2 — 노트가 0건인 사람에게는 목록이 아니라 작성 화면으로 보낸다. */
      href: data.recentNote ? `/notes/${data.recentNote.id}` : HOME_CTA_NOTE.href,
      ...noteCard,
    },
    {
      badge: "맞춤 제안 · AI",
      badgeClass: "bg-[#f2f4f8] text-text-2",
      emoji: "✨",
      href: data.recentNote
        ? `/analysis?noteId=${encodeURIComponent(data.recentNote.id)}`
        : HOME_CTA_AI.href,
      ...aiCard,
    },
    {
      badge: "맞춤 제안 · 지도",
      badgeClass: "bg-[#fdf3e7] text-warning",
      emoji: "🗺",
      href: mapHref,
      ...regionCard,
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
          <p className="text-[11px] leading-[1.5] text-[#9aa6b8]">{HOME_HERO_SUBLINE}</p>
          <div className="flex gap-2">
            <Link
              href={data.recentNote ? `/notes/${data.recentNote.id}` : HOME_CTA_NOTE.href}
              className="flex-1 rounded-xl bg-primary p-3 text-center text-[13px] font-bold text-white"
              style={{ boxShadow: "0 8px 20px rgba(29,79,216,.4)" }}
            >
              {data.recentNote ? "이어서 하기" : HOME_CTA_NOTE.label}
            </Link>
            <Link
              href={
                data.recentNote
                  ? `/analysis?noteId=${encodeURIComponent(data.recentNote.id)}`
                  : HOME_CTA_AI.href
              }
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-[13px] font-bold text-[#c9d2e0]"
            >
              AI
            </Link>
            <Link
              href={mapHref}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-[13px] font-bold text-[#c9d2e0]"
            >
              지도
            </Link>
          </div>
          {regionChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] text-[#9aa6b8]">
                <Icon name="📍" size={12} />
                관심지역
              </span>
              {regionChips.map((r) => (
                <Link
                  key={r}
                  href={budgetMapHref(r, data.preferences?.budget)}
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
                  내집찾기 여정 · {journey.step}/{JOURNEY_TOTAL} 단계 — {journey.label}
                </div>
                <div className="relative mt-1 h-[5px] rounded-[3px] bg-white/10">
                  <div
                    className="absolute left-0 h-[5px] rounded-[3px] bg-primary"
                    style={{
                      width: `${(journey.step / JOURNEY_TOTAL) * 100}%`,
                    }}
                  />
                </div>
              </div>
              {/* 고도화 23 — "다음 단계" 는 읽는 문구가 아니라 누르는 행동 */}
              <Link
                href={journey.nextHref}
                className="text-[10px] font-extrabold text-[#7ea2ff] no-underline"
              >
                다음: {journey.next} ›
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ===== 관심 맞춤 (모바일·데스크탑 공통) ===== */}
      {data.preferences ? (
        <section className="rise-in-1 mb-4">
          <div className="card flex flex-col gap-3 rounded-[20px] p-5">
            <div className="flex items-center justify-between">
              <span className="rounded-md bg-primary-soft chip-pad text-[11px] font-extrabold text-primary">
                관심 맞춤
                {data.preferences.purpose ? (
                  <>
                    {" · "}
                    <Icon
                      name={PURPOSE_META[data.preferences.purpose].emoji}
                      size={12}
                      className="inline align-middle"
                    />{" "}
                    {PURPOSE_META[data.preferences.purpose].label}
                  </>
                ) : (
                  ""
                )}
              </span>
              <Link href="/welcome" className="text-[11px] font-bold text-text-3">
                관심 수정 ›
              </Link>
            </div>

            <div className="text-[15px] font-extrabold leading-[1.4] text-ink">
              {region ? region : "관심 지역"}
              {extraRegions > 0 ? ` 외 ${extraRegions}곳` : ""}
              {data.preferences.budget
                ? ` · ${budgetRangeLabel(data.preferences.budget)} ${
                    data.preferences.budget.type === "sale" ? "매매" : "전세"
                  } 기준`
                : ""}
            </div>

            <p className="text-xs leading-[1.6] text-text-2">
              {data.preferences.purpose
                ? PURPOSE_META[data.preferences.purpose].rec
                : "관심 지역·예산에 맞는 후보를 모아 보여드려요."}
              {/* 변동률을 모를 땐 괄호를 통째로 뺀다 — "(변동 미상)"까지 읽히면
                  평균가 문장이 오히려 지저분해진다. 평균가는 그대로 사실이다. */}
              {regionMarket
                ? isDeltaUnknown(regionMarket.delta)
                  ? ` — ${regionMarket.name} 평균 ${regionMarket.price} 흐름을 확인해 보세요.`
                  : ` — ${regionMarket.name} 평균 ${regionMarket.price} (${regionMarket.delta}) 흐름을 확인해 보세요.`
                : ""}
            </p>

            {data.preferences.budget && (
              <Link
                href={budgetMapHref(region, data.preferences.budget)}
                className="btn-primary btn-cta inline-flex w-fit items-center rounded-full px-3.5 py-2 text-[12px] font-extrabold text-white"
              >
                내 예산으로 보기 ›
              </Link>
            )}

            {/* 관심 지역별 퀵링크 — 지역 허브(/region) · 매물(/listings?gu=) */}
            <div className="flex flex-col gap-2">
              {data.preferences.regions.map((r) => {
                /* 캡처 개선(2026-08-04) — 링크만 있고 시세가 없던 행에 평균가·
                   전월 대비 칩. 스냅샷 없는 지역은 칩 없이(허위값 금지). */
                const chip = r.regionId ? data.regionChips?.[r.regionId] : undefined;
                return (
                <div key={r.name} className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-text-2">
                    <Icon name="📍" size={12} />
                    {r.gu}
                  </span>
                  {chip && (
                    <span className="inline-flex items-baseline gap-1 text-[11px]">
                      <b className="text-ink">{chip.price}</b>
                      <span className={DELTA_CLASS[chip.tone]}>{chip.delta}</span>
                    </span>
                  )}
                  {r.regionId && (
                    <Link
                      href={`/region/${r.regionId}`}
                      className="glass rounded-full px-2.5 py-1 text-[10px] font-extrabold text-primary"
                    >
                      시세 허브 ›
                    </Link>
                  )}
                  <Link
                    href={budgetMapHref(r.name, data.preferences?.budget)}
                    className="rounded-full border border-[#e2e7ee] bg-surface px-2.5 py-1 text-[10px] font-bold text-text-2"
                  >
                    지도에서 비교 ›
                  </Link>
                  <Link
                    href={`/listings?gu=${encodeURIComponent(r.gu)}`}
                    className="rounded-full border border-[#e2e7ee] bg-surface px-2.5 py-1 text-[10px] font-bold text-text-2"
                  >
                    매물 보기 ›
                  </Link>
                </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : data.preferencesUnavailable ? (
        /* 조회 실패 — "설정하세요"가 아니라 "못 읽었다"고 적는다.
           예전엔 이 자리에서 실패도 미설정과 똑같이 "관심 지역·예산·목적을
           알려주세요"가 떴다. 이미 설정을 마친 사람이 DB 장애 때 그 문구를
           보면, 자기 설정이 날아간 줄 알고 다시 설정하러 간다 — 없는 안내보다
           틀린 안내가 나쁘다. /welcome 으로 밀지 않는 것도 같은 이유다. */
        <section className="rise-in-1 mb-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 rounded-[20px] p-5">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="w-fit rounded-md bg-bg chip-pad text-[11px] font-extrabold text-text-3">
                관심 맞춤
              </span>
              <div className="text-[15px] font-extrabold leading-[1.4] text-ink">
                관심 설정을 불러오지 못했어요
              </div>
              <p className="text-xs leading-[1.6] text-text-2">
                설정이 지워진 건 아니에요. 잠시 후 다시 시도해 주세요.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="whitespace-nowrap rounded-full border border-line bg-surface px-3.5 py-2 text-[12px] font-extrabold text-text-1"
            >
              다시 시도
            </button>
          </div>
        </section>
      ) : (
        /* 개인화 미설정 — 관심 설정 유도 CTA */
        <section className="rise-in-1 mb-4">
          <Link
            href="/welcome"
            className="card card-hover flex items-center justify-between gap-3 rounded-[20px] p-5"
          >
            <div className="flex flex-col gap-1">
              <span className="w-fit rounded-md bg-primary-soft chip-pad text-[11px] font-extrabold text-primary">
                맞춤 설정
              </span>
              <div className="text-[15px] font-extrabold leading-[1.4] text-ink">
                관심 지역·예산·목적을 알려주세요
              </div>
              <p className="text-xs leading-[1.6] text-text-2">
                1분이면 홈과 추천이 내게 맞게 바뀌어요.
              </p>
            </div>
            <span className="whitespace-nowrap text-[13px] font-extrabold text-primary">
              관심 설정하기 ›
            </span>
          </Link>
        </section>
      )}

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
            <p className="text-[12px] text-[#9aa6b8]">{HOME_HERO_SUBLINE}</p>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href={data.recentNote ? `/notes/${data.recentNote.id}` : HOME_CTA_NOTE.href}
                className="rounded-xl bg-primary px-[22px] py-3 text-[13px] font-bold"
                style={{ boxShadow: "0 8px 22px rgba(29,79,216,.45)", color: "#fff" }}
              >
                {data.recentNote ? "최근 노트 이어서 완성하기" : HOME_CTA_NOTE.label}
              </Link>
              <Link
                href={mapHref}
                className="rounded-xl border border-white/10 bg-white/10 px-[18px] py-3 text-[13px] font-bold"
                style={{ color: "#fff" }}
              >
                {HOME_CTA_MAP.label}
              </Link>
              <Link
                href={
                  data.recentNote
                    ? `/analysis?noteId=${encodeURIComponent(data.recentNote.id)}`
                    : HOME_CTA_AI.href
                }
                className="rounded-xl border border-white/10 bg-white/10 px-[18px] py-3 text-[13px] font-bold"
                style={{ color: "#fff" }}
              >
                {HOME_CTA_AI.label}
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
                          style={{
                            width: `${(journey.step / JOURNEY_TOTAL) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-extrabold text-[#7ea2ff]">
                        {journey.step}/{JOURNEY_TOTAL} 단계
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-[#9aa6b8]">
                      {journey.label} →{" "}
                      {/* 고도화 23 — 다음 단계는 행동 링크 */}
                      <Link href={journey.nextHref} className="font-bold text-white no-underline">
                        다음: {journey.next} ›
                      </Link>
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

          {/* 이어서 보기 — 최근 본 단지.
              예전엔 여기에도 지도(HomeMiniMap)가 있었는데 아래 벤토의 지도와 겹쳐
              한 화면에 지도가 두 개 보였다. 중복을 걷어내고 실데이터 패널로 교체. */}
          {/* 높이를 손으로 박지 않는다 — 예전엔 `h-[240px]` 이었는데 내용이
              그 안에 안 들어갔다. 실측(1280 폭, 420px 열): 드래프트 카드 + 목록
              3줄 + 관심지역 칩까지 오면 331px 이 필요해서 마지막 줄이 카드
              아래 테두리 **밖으로 72px** 삐져나왔다(.card 에 overflow 가 없어
              잘리지 않고 그대로 넘친다). 칩이 없어도 280px 이라 21px 넘쳤고,
              드래프트 없이 4줄이어도 칩이 붙으면 309px 로 넘쳤다. 즉 지금까지
              안 넘친 경우는 "드래프트 없음 + 칩 없음" 한 가지뿐이었다.
              `min-h-full` 이면 왼쪽 히어로와 같은 높이로 맞되(격자가 늘려 준다)
              내용이 더 필요하면 행이 같이 늘어난다 — 높이를 짐작하지 않고
              레이아웃이 재게 두는 쪽이다. */}
          <div className="rise-in-1">
            <HomeResumePanel regions={regionChips} className="min-h-full" />
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
                  className={`rounded-md chip-pad text-[11px] font-extrabold ${c.badgeClass}`}
                >
                  {c.badge}
                </span>
                <Icon name={c.emoji} size={16} />
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
