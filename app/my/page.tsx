import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import { loadMeProfile } from "@/lib/me/profile";
import { getExpertStatus } from "@/lib/experts/is-verified";
import { getBalance, getHistory, type LedgerRow } from "@/lib/points/ledger";
import { EARN_RULES, getSpendItem } from "@/lib/points/catalog";
import {
  listNotes,
  getNote,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { listBookmarks } from "@/lib/bookmarks/store";
import { listAlertSubscriptions, type AlertSubscription } from "@/lib/alerts/subscriptions";
import { getOnboardingProgress } from "@/lib/onboarding/append-step";
import { getUsageSummary } from "@/lib/subscriptions/usage-summary";
import type { ProfilePlanTier } from "@/lib/subscriptions/labels";
import { AttendanceButton } from "./points/AttendanceButton";

/* 마이 허브 (item 10) — 프로필·포인트지갑 통합
   실데이터(서버): 프로필·포인트 잔액/내역·내 임장노트·관심 임장노트·관심 지역·전문가(중개사) 상태
   포인트 지갑 요약을 여기서 보여주고, 전체 지갑은 /my/points 로 링크. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "마이 · 누구집" };

/* ── 표시 헬퍼 ── */
function noteScore(n: InspectionNote): number {
  return Math.round(inspectionAverageScore(n.scores) * 20);
}
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[2]}.${m[3]}` : iso || "-";
}
function reasonLabel(reason: string): string {
  if (reason.startsWith("spend:")) {
    const item = getSpendItem(reason.slice("spend:".length));
    return item ? item.label : "포인트 사용";
  }
  return EARN_RULES[reason]?.label ?? "포인트 적립";
}
function planLabel(plan: string): string {
  return plan === "expert" ? "프로 (전문가)" : plan === "pro" ? "플러스" : "무료 플랜";
}
function planBadgeTone(plan: string): string {
  return plan === "expert" ? "text-[#f2c94c]" : plan === "pro" ? "text-[#7ea2ff]" : "text-ai-muted";
}

/** 북마크 target_id 를 임장노트로 해석 (노트가 아니면 null → 자연 필터). 최대 10개만 조회. */
async function loadSavedNotes(email: string): Promise<InspectionNote[]> {
  try {
    const bms = await listBookmarks(email);
    const ids = Array.from(new Set(bms.map((b) => b.targetId))).slice(0, 10);
    const resolved = await Promise.all(ids.map((id) => getNote(id).catch(() => null)));
    return resolved.filter(
      (n): n is InspectionNote => n !== null && n.authorEmail !== email,
    );
  } catch {
    return [];
  }
}

/* ── 비로그인 안내 ── */
function GuestView() {
  const menu = [
    { label: "포인트 상점", href: "/points/shop" },
    { label: "구독 · 멤버십", href: "/subscription" },
    { label: "전문가 찾기 · 등록", href: "/town/experts" },
    { label: "고객지원 · 공지", href: "/support" },
  ];
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-3">
      <div className="rise-in ai-panel flex flex-col items-center gap-2 rounded-[20px] px-5 py-8 text-center">
        <div className="h-11 w-11 rounded-full bg-[repeating-linear-gradient(45deg,#2a3242,#2a3242_5px,#333d4f_5px,#333d4f_10px)]" />
        <div className="mt-1 text-base font-extrabold text-white">
          로그인하고 내 활동을 한곳에서 관리하세요
        </div>
        <div className="text-xs leading-[1.6] text-ai-muted">
          임장노트 · 포인트 · 관심 지역 · 구독이 마이 화면에 모여요
        </div>
        <Link href="/login?callbackUrl=/my" className="btn-primary mt-3 rounded-[12px] px-6 py-2.5 text-sm">
          로그인하고 시작하기
        </Link>
      </div>
      <div className="rise-in-1 card flex flex-col rounded-[14px] px-4 py-0.5">
        {menu.map((m, i, arr) => (
          <Link
            key={m.label}
            href={m.href}
            className={`flex justify-between py-[13px] text-sm font-semibold text-text-1 no-underline ${
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

/* ── 섹션 헤더 ── */
function SectionHead({ title, href, hrefLabel }: { title: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <h2 className="text-[15px] font-extrabold text-ink">{title}</h2>
      {href && (
        <Link href={href} className="text-xs font-semibold text-primary no-underline">
          {hrefLabel ?? "전체 보기"} ›
        </Link>
      )}
    </div>
  );
}

export default async function MyPage() {
  const session = await safeAuth();

  if (!session?.user?.email) {
    return (
      <PageShell breadcrumb="마이">
        <GuestView />
      </PageShell>
    );
  }

  const email = session.user.email;
  const [profile, balance, history, notes, savedNotes, alerts, expert, onboarding] =
    await Promise.all([
      loadMeProfile(email, {
        name: session.user.name,
        plan: (session.user as { plan?: string }).plan,
        role: (session.user as { role?: string }).role,
      }),
      getBalance(email),
      getHistory(email, 4),
      listNotes(email),
      loadSavedNotes(email),
      listAlertSubscriptions(email),
      getExpertStatus(email),
      getOnboardingProgress(email),
    ]);

  // A10 — 무료 가치 카운터(AI 분석 월 사용량) — 결제 전 가치 증명·자연 유도
  const usage = await getUsageSummary(email, profile.plan as ProfilePlanTier).catch(() => null);
  const aiUsage = usage?.items.find((i) => i.key === "ai_analysis") ?? null;

  const name = profile.name?.trim() || email.split("@")[0] || "회원";
  const total = notes.length;
  const recentNotes = notes.slice(0, 4);

  return (
    <PageShell breadcrumb="마이">
      <div className="mx-auto flex max-w-[860px] flex-col gap-4">
        {/* ── 프로필 헤더 + 포인트 잔액 + 출석 ── */}
        <section className="rise-in ai-panel flex flex-col gap-4 rounded-[22px] p-[22px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-[repeating-linear-gradient(45deg,#2a3242,#2a3242_5px,#333d4f_5px,#333d4f_10px)]" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-extrabold text-white">{name}님</span>
                  <Link
                    href="/subscription"
                    className={`rounded-full bg-[rgba(255,255,255,.1)] px-2 py-0.5 text-[10px] font-extrabold no-underline ${planBadgeTone(profile.plan)}`}
                  >
                    ✦ {planLabel(profile.plan)}
                  </Link>
                </div>
                <div className="mt-0.5 text-xs text-ai-muted">
                  {profile.primaryRegion?.trim() || "관심 지역을 설정해 보세요"}
                </div>
              </div>
            </div>
            <Link href="/my/settings" className="text-lg text-ai-muted no-underline" aria-label="설정">
              <Icon name="⚙" size={18} />
            </Link>
          </div>

          <div className="flex flex-col gap-1 rounded-2xl bg-[rgba(255,255,255,.07)] p-4">
            <div className="text-[11px] text-ai-muted">사용 가능한 포인트</div>
            <div className="flex items-end justify-between">
              <div className="flex items-end gap-1">
                <span className="text-[34px] font-extrabold leading-none text-white">
                  {balance.toLocaleString("ko-KR")}
                </span>
                <span className="mb-0.5 text-base font-extrabold text-[#7ea2ff]">P</span>
              </div>
              <Link href="/my/points" className="text-xs font-bold text-[#7ea2ff] no-underline">
                지갑 전체 보기 ›
              </Link>
            </div>
          </div>

          <AttendanceButton />
        </section>

        {/* ── A6 온보딩 완주 진행바 (완주 전까지만) ── */}
        {!onboarding.isComplete &&
          (() => {
            const steps = [
              { id: "explore", label: "관심 단지·권역 담기", href: "/map" },
              { id: "inspection", label: "첫 임장노트 작성", href: "/notes/new" },
              { id: "share", label: "임장노트 공개 공유", href: "/notes?mine=1" },
            ] as const;
            const done = onboarding.completedSteps.length;
            const pct = Math.round((done / onboarding.total) * 100);
            return (
              <section className="rise-in card flex flex-col gap-3 rounded-[16px] p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-extrabold text-ink">
                    시작하기 {done}/{onboarding.total}
                  </span>
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
                    완주 시 200P
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,.06)]">
                  <span
                    className="block h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex flex-col">
                  {steps.map((s, i) => {
                    const isDone = onboarding.completedSteps.includes(s.id);
                    return (
                      <Link
                        key={s.id}
                        href={s.href}
                        className={`flex items-center gap-2.5 py-2 no-underline ${
                          i < steps.length - 1 ? "border-b border-[#f0f3f8]" : ""
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                            isDone
                              ? "bg-[rgba(26,127,78,.12)] text-[#1a7f4e]"
                              : "bg-[rgba(0,0,0,.06)] text-text-3"
                          }`}
                        >
                          {isDone ? "✓" : i + 1}
                        </span>
                        <span
                          className={`text-[13px] ${isDone ? "text-text-3 line-through" : "font-semibold text-text-1"}`}
                        >
                          {s.label}
                        </span>
                        {!isDone && <span className="ml-auto text-[13px] font-bold text-primary">→</span>}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })()}

        <div className="grid gap-4 md:grid-cols-2">
          {/* ── 내 임장노트 ── */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="내 임장노트" href="/notes?mine=1" hrefLabel={`전체 ${total}`} />
            {recentNotes.length === 0 ? (
              <div className="card flex flex-col items-center gap-2 rounded-[14px] px-4 py-8 text-center">
                <div className="text-[13px] font-bold text-ink">아직 임장노트가 없어요</div>
                <div className="text-[11px] text-text-3">현장 기록을 남기면 여기에 모여요</div>
                <Link href="/notes/new" className="btn-primary btn-md mt-1 no-underline">
                  첫 노트 쓰기
                </Link>
              </div>
            ) : (
              recentNotes.map((n) => (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className="card card-hover flex items-center justify-between rounded-[14px] px-4 py-3.5 no-underline"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">
                      {n.aptName?.trim() || n.title}
                    </div>
                    <div className="text-[11px] text-text-3">
                      방문 {shortDate(n.visitDate)} · {n.isPublic ? "공개" : "비공개"}
                    </div>
                  </div>
                  <span className="shrink-0 pl-2 text-xs font-extrabold text-primary">
                    {noteScore(n)}점
                  </span>
                </Link>
              ))
            )}
          </section>

          {/* ── 관심 임장노트 (저장) ── */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="관심 임장노트" href="/discover" hrefLabel="발견 피드" />
            {savedNotes.length === 0 ? (
              <div className="card flex flex-col items-center gap-2 rounded-[14px] px-4 py-8 text-center">
                <div className="text-[13px] font-bold text-ink">저장한 노트가 없어요</div>
                <div className="text-[11px] text-text-3">
                  마음에 드는 공개 노트를 저장하면 여기에 모여요
                </div>
                <Link href="/discover" className="btn-soft btn-md mt-1 no-underline">
                  공개 노트 둘러보기
                </Link>
              </div>
            ) : (
              savedNotes.slice(0, 4).map((n) => (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className="card card-hover flex items-center justify-between rounded-[14px] px-4 py-3.5 no-underline"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">
                      {n.aptName?.trim() || n.title}
                    </div>
                    <div className="text-[11px] text-text-3">
                      {n.authorLabel?.trim() || "임장러"} · {shortDate(n.visitDate)}
                    </div>
                  </div>
                  <span className="shrink-0 pl-2 text-xs font-extrabold text-primary">
                    {noteScore(n)}점
                  </span>
                </Link>
              ))
            )}
          </section>
        </div>

        {/* ── 관심 지역 (알림 구독) ── */}
        <section className="flex flex-col gap-2.5">
          <SectionHead title="관심 지역 · 급매 알림" href="/notifications" hrefLabel="관리" />
          {alerts.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 rounded-[14px] px-4 py-8 text-center">
              <div className="text-[13px] font-bold text-ink">구독한 알림이 없어요</div>
              <div className="text-[11px] text-text-3">
                관심 지역·키워드를 구독하면 급매·시세 변동을 알려드려요
              </div>
              <Link href="/notifications" className="btn-soft btn-md mt-1 no-underline">
                알림 구독하기
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {alerts.map((a: AlertSubscription) => (
                <span
                  key={a.id}
                  className="chip-tag inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold"
                >
                  <Icon name={a.type === "region" ? "📍" : "🔔"} size={14} />
                  {a.value}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ── 포인트 요약 ── */}
        <section className="flex flex-col gap-2.5">
          <SectionHead title="포인트" href="/my/points" hrefLabel="전체 내역" />
          <div className="card rounded-[16px] p-5">
            {history.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                <div className="text-[13px] font-bold text-ink">아직 포인트 내역이 없어요</div>
                <div className="text-[11px] text-text-3">활동하면 적립·사용 기록이 모여요</div>
              </div>
            ) : (
              <div className="flex flex-col">
                {history.map((r: LedgerRow, i) => {
                  const earn = r.delta > 0;
                  return (
                    <div
                      key={`${r.createdAt}-${i}`}
                      className={`flex items-center justify-between py-2.5 ${
                        i < history.length - 1 ? "border-b border-[#f0f3f8]" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-bold text-ink">
                          {reasonLabel(r.reason)}
                        </div>
                        <div className="text-[11px] text-text-3">{shortDate(r.createdAt)}</div>
                      </div>
                      <span
                        className={`shrink-0 pl-2 text-[13px] font-extrabold ${earn ? "text-primary" : "text-text-3"}`}
                      >
                        {earn ? "+" : "−"}
                        {Math.abs(r.delta).toLocaleString("ko-KR")}P
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <Link href="/points/shop" className="btn-primary mt-3 block rounded-[10px] py-2.5 text-center text-xs no-underline">
              포인트 상점 가기
            </Link>
          </div>
        </section>

        {/* ── 내 매물 (중개사 인증 게이트 — item 11) ── */}
        <section className="flex flex-col gap-2.5">
          <SectionHead title="내 매물" />
          {expert.isBroker ? (
            <div className="card flex flex-col gap-3 rounded-[16px] p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[13px] font-extrabold text-ink">공인중개사 인증 완료</div>
                <div className="mt-0.5 text-[11px] text-text-3">
                  {expert.brokerNo ? `등록번호 ${expert.brokerNo} · ` : ""}매물을 등록하고 관리할 수 있어요
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href="/my/leads" className="btn-soft btn-md no-underline">
                  받은 문의
                </Link>
                <Link href="/my/listings" className="btn-soft btn-md no-underline">
                  내 매물 관리
                </Link>
                <Link href="/listings/new" className="btn-primary btn-md no-underline">
                  매물 등록
                </Link>
              </div>
            </div>
          ) : (
            <div className="card flex flex-col items-center gap-2 rounded-[16px] px-4 py-7 text-center">
              <div className="text-[22px]">
                <Icon name="🏢" size={22} />
              </div>
              <div className="text-[13px] font-extrabold text-ink">
                매물 등록은 공인중개사 인증 후 이용할 수 있어요
              </div>
              <div className="text-[11px] leading-[1.6] text-text-3">
                개업공인중개사 자격을 인증하면 매물 등록·관리 기능이 열려요
              </div>
              <Link href="/town/experts" className="btn-primary btn-md mt-1 no-underline">
                전문가 인증 신청
              </Link>
            </div>
          )}
        </section>

        {/* ── 전문가 활동 (인증 전문가 게이트) ── */}
        {expert.isVerified && (
          <section className="flex flex-col gap-2.5">
            <SectionHead title="전문가 활동" />
            <div className="card flex flex-col gap-3 rounded-[16px] p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[13px] font-extrabold text-ink">전문가 인증 완료</div>
                <div className="mt-0.5 text-[11px] text-text-3">
                  받은 상담을 확인하고 답변을 등록할 수 있어요
                </div>
              </div>
              <Link href="/my/consultations" className="btn-primary btn-md shrink-0 no-underline">
                상담 관리
              </Link>
            </div>
          </section>
        )}

        {/* ── 구독 상태 ── */}
        <section className="flex flex-col gap-2.5">
          <SectionHead title="구독 상태" href="/subscription" hrefLabel="플랜 관리" />
          <div className="card flex items-center justify-between rounded-[16px] p-5">
            <div>
              <div className="text-[13px] font-extrabold text-ink">
                현재 플랜 · {planLabel(profile.plan)}
              </div>
              <div className="mt-0.5 text-[11px] text-text-3">
                {profile.plan === "free"
                  ? "플러스로 업그레이드하면 AI 비교 리포트가 무제한이에요"
                  : "결제일·플랜 변경·해지는 구독 페이지에서 관리해요"}
              </div>
            </div>
            <Link
              href="/subscription"
              className={`btn-md no-underline ${profile.plan === "free" ? "btn-primary" : "btn-soft"}`}
            >
              {profile.plan === "free" ? "업그레이드" : "관리"}
            </Link>
          </div>

          {/* A10 무료 가치 카운터 — AI 분석 이번 달 사용량 */}
          {aiUsage &&
            (() => {
              const unlimited = aiUsage.limit == null;
              const limit = aiUsage.limit ?? 0;
              const remaining = unlimited ? null : Math.max(0, limit - aiUsage.used);
              const pct = unlimited ? 100 : Math.min(100, Math.round((aiUsage.used / Math.max(1, limit)) * 100));
              const atLimit = !unlimited && remaining === 0;
              return (
                <div className="card flex flex-col gap-2 rounded-[16px] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-ink">이번 달 AI 분석</span>
                    <span className="text-[12px] tabular-nums text-text-2">
                      {unlimited ? (
                        <b className="text-primary">무제한</b>
                      ) : (
                        <>
                          <b className={atLimit ? "text-danger" : "text-ink"}>{aiUsage.used}</b>
                          <span className="text-text-3"> / {limit}회</span>
                        </>
                      )}
                    </span>
                  </div>
                  {!unlimited && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,.06)]">
                      <span
                        className={`block h-full rounded-full ${atLimit ? "bg-danger" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  <div className="text-[11px] text-text-3">
                    {unlimited
                      ? "유료 플랜은 AI 비교 리포트가 무제한이에요."
                      : atLimit
                        ? "이번 달 무료 한도를 다 썼어요. 플러스로 올리면 무제한으로 분석할 수 있어요."
                        : `이번 달 무료로 ${remaining}회 더 분석할 수 있어요.`}
                  </div>
                </div>
              );
            })()}
        </section>

        {/* ── 기타 메뉴 ── */}
        <section className="card mb-2 flex flex-col rounded-[14px] px-4 py-0.5">
          {[
            { label: "설정", href: "/my/settings" },
            { label: "크리에이터 대시보드", href: "/my/creator" },
            { label: "자산 등록 · 대출 상환", href: "/my/assets" },
            { label: "고객지원 · 공지", href: "/support" },
          ].map((m, i, arr) => (
            <Link
              key={m.label}
              href={m.href}
              className={`flex justify-between py-[13px] text-sm font-semibold text-text-1 no-underline ${
                i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
              }`}
            >
              <span>{m.label}</span>
              <span className="text-[#c3cad6]">›</span>
            </Link>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
