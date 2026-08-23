"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/* [개선 #11·#12·#29, 2026-08-22] 홈 참여 카드 — 로그인 사용자 전용.
 *
 * 실측 배경: 포인트 사용자 1명 · 30일 노트 작성 2건 · 출석 루프 미가동.
 * 출석(하루 +10P)·연속 보너스·온보딩 200P 보상이 코드에 다 있는데 지갑 깊숙이
 * 숨어 있어 아무도 못 봤다. 홈에서 원탭으로 잇는다:
 *   ① 출석 체크(연속 표시) — #12
 *   ② 포인트 → 상점 최고 아이템(상단 노출 7일, 500P) 진행바 — #29 (2026-08-23 목표 변경)
 *   ③ 첫 임장노트 미션(+300P) — #11 (온보딩 inspection 스텝 미완일 때만)
 *
 * 캐시·CLS 규율: 홈은 ISR 공유 캐시라 서버는 로그인 상태를 모른다. 이 카드는
 * 전부 클라이언트 조회이고, 게스트(401)면 아무것도 그리지 않는다. 로그인
 * 사용자는 첫 클라이언트 렌더에서 세션 쿠키 존재로 자리(고정 높이)를 먼저
 * 잡고 데이터로 채운다 — 늦게 불쑥 나타나 아래를 밀지 않게.
 */

type State =
  | { phase: "none" } // 게스트 또는 조회 실패 — 아무것도 안 그림
  | { phase: "loading" }
  | {
      phase: "ready";
      checkedToday: boolean;
      streak: number;
      balance: number;
      needNoteMission: boolean;
    };

/* 2026-08-23: 구 PLAN_PRO_COST(2,900P → 플러스 1개월) 진행바는 제거 —
   포인트↔유료 구독 교환이 사라지면서(토스 회신, lib/points/catalog.ts 주석)
   목표를 상점 최고 아이템(매물 상단 노출 7일, 500P)으로 바꿨다. */
const SHOP_GOAL_COST = 500; // lib/points/catalog.ts listing_boost_7d 와 동일 (표시용)

function hasSessionCookie(): boolean {
  try {
    return /(?:^|;\s*)(?:__Secure-)?(?:next-auth|authjs)\.session-token=/.test(document.cookie);
  } catch {
    return false;
  }
}

export function HomeEngagementCard() {
  const [st, setSt] = useState<State>({ phase: "none" });
  const [checking, setChecking] = useState(false);
  const [justEarned, setJustEarned] = useState<number | null>(null);

  useEffect(() => {
    if (!hasSessionCookie()) return; // 게스트 — 자리도 만들지 않는다
    setSt({ phase: "loading" });
    Promise.all([
      fetch("/api/me/attendance", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/me/points", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/me/onboarding", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([att, pts, onb]) => {
        if (!att) {
          setSt({ phase: "none" });
          return;
        }
        const steps: string[] = Array.isArray(onb?.steps) ? onb.steps : [];
        setSt({
          phase: "ready",
          checkedToday: Boolean(att.checkedToday),
          streak: Number(att.streak) || 0,
          balance: Number(pts?.balance ?? att.totalPoints) || 0,
          needNoteMission: !steps.includes("inspection"),
        });
      })
      .catch(() => setSt({ phase: "none" }));
  }, []);

  const checkIn = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/me/attendance", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        awarded?: number;
        streak?: number;
        balance?: number | null;
      } | null;
      if (res.ok && data) {
        setJustEarned(typeof data.awarded === "number" ? data.awarded : null);
        setSt((prev) =>
          prev.phase === "ready"
            ? {
                ...prev,
                checkedToday: true,
                streak: data.streak ?? prev.streak,
                balance: typeof data.balance === "number" ? data.balance : prev.balance,
              }
            : prev,
        );
      }
    } catch {
      /* 실패 시 조용히 — 다음 방문에 다시 */
    } finally {
      setChecking(false);
    }
  }, [checking]);

  if (st.phase === "none") return null;

  return (
    <section
      aria-label="오늘의 활동"
      className="card min-h-[104px] rounded-[18px] px-4 py-3.5"
    >
      {st.phase === "loading" ? (
        <div className="h-[76px] animate-pulse rounded-xl bg-bg" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* ① 출석 — 하루의 첫 탭 */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold text-ink">
                {st.checkedToday ? "오늘 출석 완료" : "오늘 출석하고 포인트 받기"}
                {st.streak > 1 && (
                  <span className="ml-1.5 text-[11px] font-bold text-warning">
                    🔥 연속 {st.streak}일
                  </span>
                )}
              </div>
              <div className="text-[11px] text-text-3">
                {st.checkedToday
                  ? justEarned
                    ? `+${justEarned}P 적립됐어요`
                    : "내일 또 만나요 — 3·7일 연속이면 보너스가 붙어요"
                  : "매일 +10P · 3일 연속 +10P · 7일 연속 +40P 보너스"}
              </div>
            </div>
            {st.checkedToday ? (
              <span className="shrink-0 rounded-full bg-success-soft px-3 py-1.5 text-[12px] font-extrabold text-success">
                ✓ 완료
              </span>
            ) : (
              <button
                type="button"
                onClick={checkIn}
                disabled={checking}
                className="btn-primary press shrink-0 rounded-full px-4 py-2 text-[12px] font-bold disabled:opacity-60"
              >
                {checking ? "체크 중…" : "출석 +10P"}
              </button>
            )}
          </div>

          {/* ② 포인트 → 상점 최고 아이템(상단 노출 7일) 진행바 */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-text-3">
                내 포인트 <b className="text-ink">{st.balance.toLocaleString("ko-KR")}P</b>
              </span>
              {st.balance >= SHOP_GOAL_COST ? (
                <Link href="/points/shop" className="font-extrabold text-primary no-underline">
                  상점에서 교환 가능 ›
                </Link>
              ) : (
                <span className="text-text-3">
                  상단 노출 7일까지{" "}
                  <b className="text-primary">
                    {(SHOP_GOAL_COST - st.balance).toLocaleString("ko-KR")}P
                  </b>
                </span>
              )}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.round((st.balance / SHOP_GOAL_COST) * 100))}%` }}
              />
            </div>
          </div>

          {/* ③ 첫 노트 미션 — 이미 쓴 사람에겐 안 보인다 */}
          {st.needNoteMission && (
            <Link
              href="/notes/new"
              className="flex items-center justify-between rounded-xl bg-primary-soft px-3 py-2 no-underline"
            >
              <span className="text-[12px] font-bold text-primary">
                🎯 첫 임장노트 쓰면 +300P (공개 100P + 완주 보너스 200P)
              </span>
              <span className="text-[13px] font-extrabold text-primary">›</span>
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
