"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { getHomePersonal } from "@/lib/client/home-personal";

/* ============================================================
   오늘 쓸 도구 하나 — 근거와 함께. (A06·A07)

   왜 바뀌었나(소유자 지적 2026-08-26): 홈에 분석 도구 4개가 나란히 있었는데
   **왜 이 넷인지** 화면 어디에도 없었다. /analysis 허브와도 그대로 겹친다.
   넷을 나열하는 건 고르라는 뜻인데, 처음 온 사람은 고를 근거가 없다.

   그래서 하나만 추천하고 **이유를 적는다.** 이유가 없으면 추천이 아니라
   그냥 또 다른 나열이다. 근거는 순서대로 본다:
     ① 최근 노트가 있으면 → 그 단지 면적대 비교
     ② 관심지역이 있으면 → 그 지역 시세·타이밍
     ③ 비교함에 담긴 게 있으면 → 대출 시나리오
     ④ 아무것도 없으면(비로그인·신규) → 계산기 (가입 없이 바로 쓸 수 있다)
   나머지 도구는 "분석 도구 전체" 한 줄 링크로 접는다.
   ============================================================ */

type Personal = {
  primaryRegion: string | null;
  recentNote: { aptName: string | null; region: string | null } | null;
  compareCount: number | null;
};

type Pick = {
  href: string;
  icon: string;
  title: string;
  /** "왜 이걸 추천하는가" — 사실만. 지어내지 않는다. */
  why: string;
};

const FALLBACK: Pick = {
  href: "/calculator",
  icon: "calculator",
  title: "부동산 계산기",
  why: "로그인 없이 바로 써볼 수 있어요",
};

function decide(p: Personal | null): Pick {
  if (!p) return FALLBACK;
  /* [D64] 이유를 말했으면 **그 이유를 목적지에도 실어 보낸다.**
     예전에는 "관심지역 강남구의 12개월 흐름을 봐요"라고 적어 놓고 파라미터
     없는 /analysis/timing 으로 보냈다 — 도착하면 기본 지역이 떠서, 방금 읽은
     문장과 화면이 다른 말을 했다. 받는 쪽은 이제 어떤 지역 표기든 읽는다
     (lib/regions/param.ts · D62). */
  if (p.recentNote?.aptName) {
    const region = p.recentNote.region?.trim() || p.primaryRegion?.trim() || "";
    return {
      href: region
        ? `/analysis/price?region=${encodeURIComponent(region)}`
        : "/analysis/price",
      icon: "bar",
      title: "면적대별 실거래",
      why: `최근 노트한 ${p.recentNote.aptName}의 면적대를 비교해 보세요`,
    };
  }
  if (p.primaryRegion) {
    return {
      href: `/analysis/timing?region=${encodeURIComponent(p.primaryRegion)}`,
      icon: "trending-up",
      title: "시세·타이밍",
      why: `관심지역 ${p.primaryRegion}의 12개월 흐름을 봐요`,
    };
  }
  if ((p.compareCount ?? 0) > 0) {
    return {
      href: "/analysis/scenario",
      icon: "calculator",
      title: "대출 시나리오",
      why: `비교함에 담은 ${p.compareCount}개로 실금리를 계산해요`,
    };
  }
  return FALLBACK;
}

export function HomeToolPick() {
  const [pick, setPick] = useState<Pick>(FALLBACK);
  useEffect(() => {
    let dead = false;
    getHomePersonal<Personal>()
      .then((p) => {
        if (!dead) setPick(decide(p));
      })
      .catch(() => {
        /* 개인화 실패 — 기본 추천 그대로. 잘못된 이유를 적는 것보다 낫다. */
      });
    return () => {
      dead = true;
    };
  }, []);

  return (
    <section aria-labelledby="home-tool" className="card rounded-2xl px-[18px] py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-tool" className="t-sub font-extrabold text-text-3">
          오늘 써볼 도구
        </h2>
        <Link href="/analysis" className="t-sub font-bold text-primary no-underline">
          분석 도구 전체 ›
        </Link>
      </div>
      <Link
        href={pick.href}
        className="tile mt-2 flex items-center gap-3 rounded-xl border border-line px-3.5 py-3 no-underline"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-primary-soft text-primary">
          <Icon name={pick.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block t-body font-extrabold text-ink">{pick.title}</span>
          {/* 이유 — 이게 없으면 추천이 아니라 그냥 링크다 */}
          <span className="block t-sub text-text-2">{pick.why}</span>
        </span>
        <span className="shrink-0 t-body font-extrabold text-primary">›</span>
      </Link>
    </section>
  );
}
