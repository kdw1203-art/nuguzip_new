import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { buildMissionBoard, type MissionBoard } from "@/lib/missions/missions";
import { logger } from "@/lib/log";

/* [#119·#120] 미션 센터 — 시작 3미션 + 주간 미션.
   진행도는 실데이터 파생(lib/missions), 적립은 서버 재검증 청구(claim API).
   실측 0(글·구독·적립) 상태에 대한 처방: 첫 행동을 계단 3개로 쪼개고 보상을 명시. */

export const metadata: Metadata = {
  title: "미션 | 누구집",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

import { MissionClaim } from "./MissionClaim";

function Bar({ progress, target }: { progress: number; target: number }) {
  const pct = Math.min(100, Math.round((progress / Math.max(1, target)) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function MissionsPage() {
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/login?callbackUrl=/my/missions");

  let board: MissionBoard | null = null;
  try {
    board = await buildMissionBoard(session.user.email);
  } catch (e) {
    logger.error("[missions] 보드 계산 실패", e);
  }

  return (
    <PageShell breadcrumb="마이 › 미션">
      <h1 className="rise-in text-[22px] font-extrabold text-ink">미션</h1>
      <p className="rise-in-1 mt-1 text-[13px] text-text-2">
        실제 활동으로 진행도가 자동 채워지고, 달성하면 포인트를 받아갈 수 있어요.
      </p>

      {!board ? (
        <div className="card mt-4 rounded-2xl px-5 py-6 text-[13px] text-text-2">
          진행도를 지금 불러오지 못했어요 — 잠시 후 다시 열어봐 주세요.
        </div>
      ) : (
        <>
          {/* 시작 3미션 */}
          <section className="rise-in-1 mt-5">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[15px] font-extrabold text-ink">시작 3미션</h2>
              <MissionClaim
                kind="start"
                points={200}
                disabled={!board.startAllDone}
                claimed={board.startClaimed}
              />
            </div>
            <div className="flex flex-col gap-2">
              {board.start.map((m) => (
                <Link
                  key={m.key}
                  href={m.href}
                  className="card card-hover flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-extrabold text-ink">
                      {m.done ? "✓ " : ""}
                      {m.label}
                    </div>
                    <p className="mt-0.5 text-[12px] leading-[1.6] text-text-2">{m.desc}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                      m.done ? "bg-success-soft text-success" : "bg-bg text-text-3"
                    }`}
                  >
                    {m.done ? "완료" : "하러 가기 ›"}
                  </span>
                </Link>
              ))}
            </div>
            <p className="t-caption mt-1.5 px-1 text-text-3">
              3가지를 모두 마치면 온보딩 완주 보너스 200P를 받을 수 있어요 (1회).
            </p>
          </section>

          {/* 주간 미션 */}
          <section className="rise-in-2 mt-7">
            <h2 className="mb-2 px-1 text-[15px] font-extrabold text-ink">
              이번 주 미션{" "}
              <span className="text-[12px] font-medium text-text-3">
                {board.weekKey} · 월요일마다 리셋
              </span>
            </h2>
            <div className="flex flex-col gap-2">
              {board.weekly.map((m) => (
                <div key={m.key} className="card flex flex-col gap-2 rounded-2xl px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-extrabold text-ink">{m.label}</div>
                      <p className="mt-0.5 text-[12px] leading-[1.6] text-text-2">{m.desc}</p>
                    </div>
                    <MissionClaim
                      kind="weekly"
                      missionKey={m.key}
                      points={m.points}
                      disabled={!m.done}
                      claimed={m.claimed}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Bar progress={m.progress} target={m.target} />
                    <span className="shrink-0 text-[11px] font-bold text-text-3 tabular-nums">
                      {Math.min(m.progress, m.target)}/{m.target}
                    </span>
                  </div>
                  {!m.done && (
                    <Link href={m.href} className="text-[12px] font-bold text-primary">
                      하러 가기 ›
                    </Link>
                  )}
                </div>
              ))}
            </div>
            <p className="t-caption mt-1.5 px-1 text-text-3">
              적립은 일·월 상한 안에서 지급됩니다. 자세한 규칙은{" "}
              <Link href="/my/points" className="font-bold text-primary">
                포인트 내역
              </Link>
              에서.
            </p>
          </section>
        </>
      )}
    </PageShell>
  );
}
