import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { safeAuth } from "@/lib/safe-auth";
import { logger } from "@/lib/log";
import { getBalance, getHistory, type LedgerRow } from "@/lib/points/ledger";
import { EARN_RULES, getSpendItem, POINTS_GRATUITOUS_NOTICE } from "@/lib/points/catalog";
import { getServiceSupabase } from "@/lib/supabase/service";
import { AttendanceButton } from "./AttendanceButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "포인트 지갑" };

/* ── 표시 헬퍼 ── */

function fmtP(n: number): string {
  return `${Math.abs(n).toLocaleString("ko-KR")}P`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd}`;
}

/** 원장 reason → 한글 라벨 (적립: EARN_RULES · 소비: SPEND_ITEMS · 만료: expire)
    판매 중단 상품(spend:ai_analysis · spend:complex_report)의 과거 이력은
    "포인트 사용" 폴백으로 계속 표시된다. */
function reasonLabel(reason: string): string {
  if (reason === "expire") return "포인트 기한 만료";
  if (reason.startsWith("spend:")) {
    const item = getSpendItem(reason.slice("spend:".length));
    return item ? item.label : "포인트 사용";
  }
  return EARN_RULES[reason]?.label ?? "포인트 적립";
}

function sameMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  );
}

/** 포인트로 산 닉네임 오로라가 지금 켜져 있는지 — 지갑에서 상태를 보여준다.
    교환 직후 "적용됐나?"를 확인할 곳이 없으면 그대로 문의가 된다. 조회 실패는
    표시 생략으로 처리해 지갑 본연의 잔액·내역 렌더를 막지 않는다. */
async function readNicknameEffectUntil(
  email: string,
): Promise<{ kind: "aurora" | "sunset"; until: string } | null> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return null;
    const { data } = await sb
      .from("profiles")
      .select("settings")
      .eq("email", email)
      .maybeSingle();
    const eff = (
      data?.settings as { nickname_effect?: { kind?: string; until?: string } } | null
    )?.nickname_effect;
    if (
      (eff?.kind === "aurora" || eff?.kind === "sunset") &&
      typeof eff.until === "string" &&
      Date.parse(eff.until) > Date.now()
    ) {
      return { kind: eff.kind, until: eff.until };
    }
    return null;
  } catch {
    return null;
  }
}

/* ── 적립 방법 안내 (로그인 여부 무관) ── */
function EarnGuide() {
  return (
    <div className="rise-in-3 card rounded-2xl p-5">
      <div className="text-sm font-extrabold text-ink">포인트 적립 방법</div>
      <div className="mt-0.5 t-sub text-text-3">
        활동하면 자동으로 쌓여요 · 1P는 약 1원의 가치예요
      </div>
      <div className="mt-3 flex flex-col">
        {Object.values(EARN_RULES).map((rule, i, arr) => (
          <div
            key={rule.key}
            className={`flex items-center justify-between py-2.5 ${
              i < arr.length - 1 ? "border-b border-divider" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="t-body font-semibold text-text-1">
                {rule.label}
              </span>
              {rule.once && (
                <span className="chip-tag chip-pad-tight t-caption">
                  최초 1회
                </span>
              )}
              {rule.dailyCap && (
                <span className="chip-tag chip-pad-tight t-caption">
                  하루 {rule.dailyCap}회
                </span>
              )}
            </div>
            <span className="t-body font-extrabold text-primary">
              +{rule.points.toLocaleString("ko-KR")}P
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 비로그인 안내 ── */
function GuestView() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-3">
      <div className="rise-in ai-panel flex flex-col items-center gap-2 rounded-[18px] px-5 py-8 text-center">
        <Icon name="🪙" size={24} className="text-white" />
        <div className="mt-1 text-base font-extrabold text-white">
          로그인하고 내 포인트를 확인하세요
        </div>
        <div className="text-xs leading-[1.6] text-ai-muted">
          매물 등록 · 임장노트 공개 · 출석으로 포인트가 쌓이고,
          <br />
          상점에서 매물 상단 노출·닉네임 꾸미기로 교환할 수 있어요
        </div>
        <Link
          href="/login?callbackUrl=/my/points"
          className="btn-primary mt-3 rounded-[10px] px-6 py-2.5 text-sm"
        >
          로그인하고 시작하기
        </Link>
      </div>

      <Link
        href="/points/shop"
        className="rise-in-1 flex items-center justify-between rounded-2xl bg-primary-soft px-4 py-[15px]"
      >
        <div>
          <div className="text-sm font-extrabold text-primary">포인트 상점 구경하기</div>
          <div className="mt-0.5 text-xs text-text-2">
            어떤 혜택으로 바꿀 수 있는지 미리 살펴보세요
          </div>
        </div>
        <span className="t-section text-primary">›</span>
      </Link>

      <EarnGuide />
    </div>
  );
}

/* ── 로그인 — 실데이터 뷰 ── */
function WalletView({
  balance,
  history,
  nickEffect,
}: {
  balance: number;
  history: LedgerRow[];
  /** 활성 닉네임 효과(오로라·노을)와 만료 시각 — 없으면 미적용 */
  nickEffect: { kind: "aurora" | "sunset"; until: string } | null;
}) {
  const now = new Date();
  const monthEarned = history
    .filter((r) => r.delta > 0 && sameMonth(r.createdAt, now))
    .reduce((s, r) => s + r.delta, 0);
  const monthSpent = history
    .filter((r) => r.delta < 0 && sameMonth(r.createdAt, now))
    .reduce((s, r) => s + Math.abs(r.delta), 0);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-3">
      {/* 잔액 히어로 */}
      <div className="rise-in ai-panel flex flex-col gap-4 rounded-[18px] p-[22px]">
        <div>
          <div className="text-xs text-ai-muted">사용 가능한 포인트</div>
          <div className="mt-1 flex items-end gap-1">
            <span className="t-title leading-none text-white">
              {balance.toLocaleString("ko-KR")}
            </span>
            <span className="mb-1 text-lg font-extrabold text-ai-accent">P</span>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl bg-[rgba(255,255,255,.07)] p-3 text-center">
            <div className="t-sub text-ai-muted">이번 달 적립</div>
            <div className="mt-0.5 text-base font-extrabold text-ai-accent">
              +{monthEarned.toLocaleString("ko-KR")}P
            </div>
          </div>
          <div className="flex-1 rounded-xl bg-[rgba(255,255,255,.07)] p-3 text-center">
            <div className="t-sub text-ai-muted">이번 달 사용</div>
            <div className="mt-0.5 text-base font-extrabold text-white">
              −{monthSpent.toLocaleString("ko-KR")}P
            </div>
          </div>
        </div>
        <AttendanceButton />
        <Link
          href="/points/shop"
          className="btn-primary rounded-[10px] py-2.5 text-center text-sm"
        >
          포인트 상점 가기
        </Link>
      </div>

      {/* 적용 중인 상점 효과 — 산 것이 지금 켜져 있음을 지갑에서 확인시켜 준다 */}
      {nickEffect && (
        <div className="rise-in-1 card flex items-center justify-between rounded-2xl px-4 py-3">
          <div className="min-w-0">
            <div className="t-body font-extrabold text-ink">
              <span className={nickEffect.kind === "sunset" ? "nick-sunset" : "nick-aurora"}>
                닉네임 {nickEffect.kind === "sunset" ? "노을" : "오로라"}
              </span>{" "}
              적용 중
            </div>
            <div className="mt-0.5 t-sub text-text-3">
              {fmtDate(nickEffect.until)}까지 · 동네이야기 글 상세의 작성자 이름이 빛나요
            </div>
          </div>
          <Icon name="✨" size={18} className="shrink-0 text-primary" />
        </div>
      )}

      {/* 무상성 고지 — 상점·약관과 같은 단일 출처 문구 */}
      <p className="rise-in-1 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 t-sub text-text-3">
        {POINTS_GRATUITOUS_NOTICE}
      </p>

      {/* 적립·소비 내역 */}
      <div className="rise-in-2 card rounded-2xl p-5">
        <div className="text-sm font-extrabold text-ink">포인트 내역</div>
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 text-center">
            <div className="t-body font-bold text-ink">
              아직 포인트 내역이 없어요
            </div>
            <div className="t-sub text-text-3">
              활동을 시작하면 여기에 적립·사용 기록이 모여요
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-col">
            {history.map((r, i) => {
              const earn = r.delta > 0;
              return (
                <div
                  key={`${r.createdAt}-${i}`}
                  className={`flex items-center justify-between py-3 ${
                    i < history.length - 1 ? "border-b border-divider" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">
                      {reasonLabel(r.reason)}
                    </div>
                    <div className="t-sub text-text-3">
                      {fmtDate(r.createdAt)}
                      {earn && r.expiresAt
                        ? ` · ${fmtDate(r.expiresAt)} 만료 예정`
                        : ""}
                    </div>
                  </div>
                  <div className="shrink-0 pl-3 text-right">
                    <div
                      className={`text-sm font-extrabold ${
                        earn ? "text-primary" : "text-text-3"
                      }`}
                    >
                      {earn ? "+" : "−"}
                      {fmtP(r.delta)}
                    </div>
                    <div className="t-sub text-text-3">
                      잔액 {r.balance.toLocaleString("ko-KR")}P
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <EarnGuide />
    </div>
  );
}

export default async function PointsWalletPage() {
  const session = await safeAuth();
  const email = session?.user?.email;

  if (!email) {
    return (
      <PageShell breadcrumb="포인트 지갑">
        <GuestView />
      </PageShell>
    );
  }

  /* 2026-07-26: 내역 조회가 실패하면 예전에는 빈 배열이 내려와서 "아직 포인트
     내역이 없어요" 라고 썼다 — 적립한 적 없는 사람과 원장을 못 읽은 사람이
     구분되지 않았다. 실패는 실패라고 쓴다. */
  const [loaded, nickEffect] = await Promise.all([
    Promise.all([getBalance(email), getHistory(email, 50)]).then(
      ([balance, history]) => ({ ok: true as const, balance, history }),
      (err: unknown) => {
        logger.error("[my/points] 포인트 조회 실패", err);
        return {
          ok: false as const,
          cause: err instanceof Error ? err.message : String(err),
        };
      },
    ),
    readNicknameEffectUntil(email),
  ]);

  if (!loaded.ok) {
    return (
      <PageShell breadcrumb="포인트 지갑">
        <div className="mx-auto w-full max-w-[640px]">
          <ErrorState
            title="포인트 지갑을 지금 불러올 수 없어요"
            desc="포인트 내역이 없는 게 아니라 조회 자체가 실패했습니다. 잠시 후 다시 시도해 주세요."
            cause={loaded.cause}
            action={{ label: "마이로 이동", href: "/my" }}
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell breadcrumb="포인트 지갑">
      <WalletView
        balance={loaded.balance}
        history={loaded.history}
        nickEffect={nickEffect}
      />
    </PageShell>
  );
}
