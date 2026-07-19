"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";

/* 시안 6f·6m — 마이 (#13 실데이터, 클라이언트 fetch 하이브리드)
   세션 판별: GET /api/me/profile (401 → 비로그인) · 내 노트: GET /api/inspection/notes
   로그인 시 실데이터, 비로그인 시 빈 상태 + /login CTA + "예시" 라벨 미리보기 */

type MeProfile = {
  email: string;
  name: string | null;
  plan: string;
  primaryRegion?: string | null;
};

type MyNoteScores = {
  location: number;
  school: number;
  transport: number;
  facility: number;
  future: number;
};

type MyNote = {
  id: string;
  title: string;
  region: string;
  aptName?: string | null;
  visitDate: string;
  isPublic: boolean;
  createdAt: string;
  scores: MyNoteScores;
  checklist: { label: string; done: boolean }[];
};

type MyState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "authed"; profile: MeProfile; notes: MyNote[] };

/* ── 비로그인 예시 미리보기용 목업 (항상 "예시" 라벨과 함께 노출) ── */
const EXAMPLE_STATS = [
  { value: "7", label: "임장노트" },
  { value: "4", label: "임장 단지" },
  { value: "2", label: "공개 노트" },
] as const;

const EXAMPLE_NOTES = [
  { title: "공작아파트 302동", meta: "3차 방문 · 07.12 · 비공개", score: "78점" },
  { title: "동편마을 3단지", meta: "1차 방문 · 07.05 · 공개", score: "82점" },
] as const;

const MENU = [
  { label: "관심 지역 관리", href: "/map" },
  { label: "자산 등록 · 대출 상환", href: "/my/assets" },
  { label: "수익률 계산기", href: "/calculator" },
  { label: "구독 관리", href: "/subscription" },
  { label: "고객지원 · 공지", href: "/support" },
] as const;

function noteScore(n: MyNote): number {
  const s = n.scores;
  if (!s) return 0;
  const avg =
    ((s.location ?? 0) +
      (s.school ?? 0) +
      (s.transport ?? 0) +
      (s.facility ?? 0) +
      (s.future ?? 0)) /
    5;
  return Math.round(avg * 20);
}

function shortDate(iso: string): string {
  // "2026-07-12" → "07.12"
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[1]}.${m[2]}` : iso || "-";
}

function ExampleBadge() {
  return (
    <span className="rounded-[5px] border border-line bg-surface px-[6px] py-[2px] text-[10px] font-semibold text-text-3">
      예시
    </span>
  );
}

/* ── 비로그인 — 빈 상태 + 로그인 CTA + 예시 미리보기 ── */
function GuestView() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-3">
      <div className="rise-in ai-panel flex flex-col items-center gap-2 rounded-[20px] px-5 py-8 text-center">
        <div className="h-11 w-11 rounded-full bg-[repeating-linear-gradient(45deg,#2a3242,#2a3242_5px,#333d4f_5px,#333d4f_10px)]" />
        <div className="mt-1 text-base font-extrabold text-white">
          로그인하고 내 임장 현황을 모아보세요
        </div>
        <div className="text-xs leading-[1.6] text-ai-muted">
          임장노트 · 임장 단지 · AI 비교 리포트가 한곳에 모여요
        </div>
        <Link
          href="/login"
          className="btn-primary mt-3 rounded-[12px] px-6 py-2.5 text-sm"
        >
          로그인하고 시작하기
        </Link>
      </div>

      {/* 예시 미리보기 — 실데이터 아님을 라벨로 명시 */}
      <div className="rise-in-1 flex items-center gap-2 px-1 pt-1">
        <span className="text-[13px] font-extrabold text-ink">
          이런 화면이 채워져요
        </span>
        <ExampleBadge />
      </div>

      <div className="rise-in-2 flex gap-2">
        {EXAMPLE_STATS.map((s) => (
          <div
            key={s.label}
            className="card flex-1 rounded-xl p-[11px] text-center opacity-80"
          >
            <div className="text-[17px] font-extrabold text-ink">{s.value}</div>
            <div className="text-[11px] text-text-3">{s.label}</div>
          </div>
        ))}
      </div>

      {EXAMPLE_NOTES.map((n) => (
        <div
          key={n.title}
          className="rise-in-3 card flex items-center justify-between rounded-[14px] px-4 py-3.5 opacity-80"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-ink">{n.title}</span>
              <ExampleBadge />
            </div>
            <div className="text-[11px] text-text-3">{n.meta}</div>
          </div>
          <span className="text-xs font-extrabold text-primary">{n.score}</span>
        </div>
      ))}

      <div className="rise-in-4 card flex flex-col rounded-[14px] px-4 py-0.5">
        {MENU.map((m, i, arr) => (
          <Link
            key={m.label}
            href={m.href}
            className={`flex justify-between py-[13px] text-sm font-semibold text-text-1 ${
              i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
            }`}
          >
            <span>{m.label}</span>
            <span className="text-[#c3cad6]">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── 로딩 스켈레톤 ── */
function LoadingView() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-3">
      <div className="skeleton h-[120px] rounded-[20px]" />
      <div className="flex gap-2">
        <div className="skeleton h-[62px] flex-1 rounded-xl" />
        <div className="skeleton h-[62px] flex-1 rounded-xl" />
        <div className="skeleton h-[62px] flex-1 rounded-xl" />
      </div>
      <div className="skeleton h-[58px] rounded-[14px]" />
      <div className="skeleton h-[58px] rounded-[14px]" />
    </div>
  );
}

/* ── 로그인 — 실데이터 뷰 ── */
function AuthedView({ profile, notes }: { profile: MeProfile; notes: MyNote[] }) {
  const name =
    profile.name?.trim() || profile.email.split("@")[0] || "회원";
  const total = notes.length;
  const publicCount = notes.filter((n) => n.isPublic).length;
  const complexCount = new Set(
    notes.map((n) => (n.aptName?.trim() || n.title).trim()),
  ).size;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekCount = notes.filter(
    (n) => (Date.parse(n.createdAt) || 0) >= weekAgo,
  ).length;
  const avgAll =
    total > 0
      ? Math.round(notes.reduce((acc, n) => acc + noteScore(n), 0) / total)
      : 0;

  // 후보 단지 현황 — 노트를 단지명 기준으로 묶음
  const byComplex = new Map<string, MyNote[]>();
  for (const n of notes) {
    const key = (n.aptName?.trim() || n.title).trim();
    byComplex.set(key, [...(byComplex.get(key) ?? []), n]);
  }
  const candidates = [...byComplex.entries()]
    .map(([cname, list]) => ({
      name: cname,
      count: list.length,
      lastVisit: list
        .map((n) => n.visitDate)
        .sort()
        .at(-1) as string,
      score: Math.round(
        list.reduce((acc, n) => acc + noteScore(n), 0) / list.length,
      ),
    }))
    .sort((a, b) => b.count - a.count || b.score - a.score)
    .slice(0, 4);

  // 남은 고려사항 — 내 노트의 미완료 체크리스트
  const todos = notes
    .flatMap((n) => (n.checklist ?? []).filter((c) => !c.done))
    .slice(0, 3);

  const planLabel =
    profile.plan === "expert"
      ? "전문가 멤버"
      : profile.plan === "pro"
        ? "플러스 멤버"
        : "무료 플랜";

  const stats = [
    { value: String(total), label: "임장노트", accent: false },
    { value: String(complexCount), label: "임장 단지", accent: false },
    { value: String(publicCount), label: "공개 노트", accent: true },
  ];

  return (
    <>
      {/* ============ 모바일 (6f 마이페이지) ============ */}
      <section className="flex flex-col gap-3 md:hidden">
        <div className="rise-in ai-panel flex flex-col gap-3.5 rounded-[20px] p-[18px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-[repeating-linear-gradient(45deg,#2a3242,#2a3242_5px,#333d4f_5px,#333d4f_10px)]" />
              <div>
                <div className="text-base font-extrabold text-white">
                  {name}님
                </div>
                <div className="text-xs text-ai-muted">
                  {profile.primaryRegion?.trim() || "관심 지역을 설정해 보세요"}
                </div>
              </div>
            </div>
            <Link
              href="/my/settings"
              className="text-base text-ai-muted"
              aria-label="설정"
            >
              ⚙
            </Link>
          </div>
          <div className="flex gap-2">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex-1 rounded-xl bg-[rgba(255,255,255,.07)] p-[11px] text-center"
              >
                <div
                  className={`text-[17px] font-extrabold ${s.accent ? "text-[#7ea2ff]" : "text-white"}`}
                >
                  {s.value}
                </div>
                <div className="text-[11px] text-ai-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <Link
          href={total >= 2 ? "/notes/compare" : "/notes/new"}
          className="rise-in-1 flex items-center justify-between rounded-2xl bg-primary-soft px-4 py-[15px]"
        >
          <div>
            <div className="text-sm font-extrabold text-primary">
              {total >= 2 ? "AI 비교 리포트" : "첫 임장노트 쓰기"}
            </div>
            <div className="mt-0.5 text-xs text-[#5b74b8]">
              {total >= 2
                ? `내 노트 ${total}건 기준`
                : "노트 2건부터 AI 비교 리포트가 열려요"}
            </div>
          </div>
          <span className="text-[15px] font-extrabold text-primary">›</span>
        </Link>

        <div className="rise-in-2 text-[15px] font-extrabold text-ink">
          내 임장노트
        </div>
        {notes.length === 0 ? (
          <div className="rise-in-2 card flex flex-col items-center gap-2 rounded-[14px] px-4 py-8 text-center">
            <div className="text-[13px] font-bold text-ink">
              아직 임장노트가 없어요
            </div>
            <div className="text-[11px] text-text-3">
              현장 기록을 남기면 여기에 모여요
            </div>
            <Link href="/notes/new" className="btn-primary btn-md mt-1">
              첫 노트 쓰기
            </Link>
          </div>
        ) : (
          notes.slice(0, 4).map((n) => (
            <Link
              key={n.id}
              href={`/notes/${n.id}`}
              className="rise-in-2 card card-hover flex items-center justify-between rounded-[14px] px-4 py-3.5"
            >
              <div>
                <div className="text-sm font-bold text-ink">
                  {n.aptName?.trim() || n.title}
                </div>
                <div className="text-[11px] text-text-3">
                  방문 {shortDate(n.visitDate)} ·{" "}
                  {n.isPublic ? "공개" : "비공개"}
                </div>
              </div>
              <span className="text-xs font-extrabold text-primary">
                {noteScore(n)}점
              </span>
            </Link>
          ))
        )}

        <div className="rise-in-3 card flex flex-col rounded-[14px] px-4 py-0.5">
          {MENU.map((m, i, arr) => (
            <Link
              key={m.label}
              href={m.href}
              className={`flex justify-between py-[13px] text-sm font-semibold text-text-1 ${
                i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
              }`}
            >
              <span>{m.label}</span>
              <span className="text-[#c3cad6]">›</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ 데스크탑 (6m 내 대시보드) ============ */}
      <section className="hidden flex-col gap-4 md:flex">
        <div className="rise-in flex items-end justify-between px-1">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">
              {name}님의 내집찾기
            </h1>
            <p className="mt-1 text-[13px] text-text-2">
              {profile.primaryRegion?.trim()
                ? `관심 지역 ${profile.primaryRegion.trim()} · 임장노트 ${total}건`
                : `임장노트 ${total}건 · 공개 ${publicCount}건`}
            </p>
          </div>
          <Link
            href="/subscription"
            className="rounded-full bg-ink px-3.5 py-[7px] text-xs font-bold text-[#7ea2ff]"
          >
            {planLabel}
          </Link>
        </div>

        <div className="rise-in-1 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {[
            {
              label: "임장노트",
              value: (
                <>
                  {total}{" "}
                  {weekCount > 0 && (
                    <span className="text-xs font-bold text-primary">
                      +{weekCount} 이번 주
                    </span>
                  )}
                </>
              ),
              tone: "text-ink",
            },
            { label: "임장한 단지", value: <>{complexCount}</>, tone: "text-ink" },
            { label: "공개 노트", value: <>{publicCount}</>, tone: "text-primary" },
            {
              label: "평균 점수",
              value: <>{total > 0 ? `${avgAll}점` : "-"}</>,
              tone: "text-ink",
            },
          ].map((s) => (
            <div key={s.label} className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">{s.label}</div>
              <div className={`mt-1 text-2xl font-extrabold ${s.tone}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <div className="rise-in-2 card flex flex-col gap-3 rounded-[20px] p-[22px]">
            <div className="flex items-baseline justify-between">
              <div className="text-base font-extrabold text-ink">
                후보 단지 현황
              </div>
              <Link href="/map" className="text-xs font-semibold text-primary">
                지도에서 보기
              </Link>
            </div>
            {candidates.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="text-sm font-bold text-ink">
                  아직 임장한 단지가 없어요
                </div>
                <div className="text-[11px] text-text-3">
                  첫 노트를 쓰면 후보 단지가 자동으로 모여요
                </div>
                <Link href="/notes/new" className="btn-primary btn-md mt-1">
                  첫 노트 쓰기
                </Link>
              </div>
            ) : (
              candidates.map((c, i) => (
                <div
                  key={c.name}
                  className={`flex items-center justify-between py-3 ${
                    i < candidates.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`h-2 w-2 rounded-full ${c.score >= 70 ? "bg-primary" : "bg-[#c3cad6]"}`}
                    />
                    <div>
                      <div className="text-sm font-bold text-ink">{c.name}</div>
                      <div className="text-[11px] text-text-3">
                        노트 {c.count} · 마지막 방문 {shortDate(c.lastVisit)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-ink">
                      {c.score}점
                    </div>
                    <div
                      className={`text-[11px] font-bold ${c.score >= 70 ? "text-primary" : "text-text-3"}`}
                    >
                      노트 {c.count}건
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rise-in-3">
              <AIPanel title="이번 주 브리핑" className="rounded-[20px]">
                이번 주 임장노트 {weekCount}건 작성 · 전체 {total}건. 공개 노트{" "}
                {publicCount}건이 발견 피드에 노출되고 있어요.
                <Link
                  href={total >= 2 ? "/notes/compare" : "/notes/new"}
                  className="btn-primary mt-2.5 block rounded-[10px] p-2.5 text-center text-xs"
                >
                  {total >= 2 ? "비교 리포트 열기" : "노트 쓰러 가기"}
                </Link>
              </AIPanel>
            </div>
            <div className="rise-in-4 card flex flex-col gap-2 rounded-[20px] p-5">
              <div className="text-sm font-extrabold text-ink">
                남은 고려사항
              </div>
              {todos.length === 0 ? (
                <div className="text-[12px] text-text-3">
                  남은 체크가 없어요 — 노트의 체크리스트가 여기에 모여요
                </div>
              ) : (
                todos.map((t, i) => (
                  <div
                    key={`${t.label}-${i}`}
                    className="flex items-center gap-2 text-[13px] text-text-1"
                  >
                    <span className="h-4 w-4 shrink-0 rounded-[5px] border-[1.5px] border-[#c9d4e5]" />
                    {t.label}
                    {i === 0 && (
                      <span className="rounded-full bg-danger-soft px-[7px] py-0.5 text-[10px] font-bold text-danger">
                        중요
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function MyPage() {
  const [state, setState] = useState<MyState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 가벼운 세션 판별 — /api/me/profile 이 401이면 비로그인
        const res = await fetch("/api/me/profile", { cache: "no-store" });
        if (res.status === 401) {
          if (alive) setState({ status: "guest" });
          return;
        }
        if (!res.ok) throw new Error("profile fetch failed");
        const data = (await res.json()) as { profile?: MeProfile };
        const profile = data.profile;
        if (!profile?.email) throw new Error("no profile");

        let notes: MyNote[] = [];
        try {
          const nr = await fetch("/api/inspection/notes", {
            cache: "no-store",
          });
          if (nr.ok) {
            const nj = (await nr.json()) as { items?: MyNote[] };
            notes = Array.isArray(nj.items) ? nj.items : [];
          }
        } catch {
          notes = [];
        }
        if (alive) setState({ status: "authed", profile, notes });
      } catch {
        // 판별 실패 시에도 목업 대신 로그인 안내 (사실성 원칙)
        if (alive) setState({ status: "guest" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <PageShell breadcrumb="내 대시보드">
      {state.status === "loading" ? (
        <LoadingView />
      ) : state.status === "guest" ? (
        <GuestView />
      ) : (
        <AuthedView profile={state.profile} notes={state.notes} />
      )}
    </PageShell>
  );
}
