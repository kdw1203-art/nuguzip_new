import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { getBalance, getHistory, type LedgerRow } from "@/lib/points/ledger";
import { EARN_RULES, getSpendItem } from "@/lib/points/catalog";
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

/** 원장 reason → 한글 라벨 (적립: EARN_RULES · 소비: SPEND_ITEMS) */
function reasonLabel(reason: string): string {
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

/* ── 적립 방법 안내 (로그인 여부 무관) ── */
function EarnGuide() {
  return (
    <div className="rise-in-3 card rounded-[16px] p-5">
      <div className="text-sm font-extrabold text-ink">포인트 적립 방법</div>
      <div className="mt-0.5 text-[12px] text-text-3">
        활동하면 자동으로 쌓여요 · 1P는 약 1원의 가치예요
      </div>
      <div className="mt-3 flex flex-col">
        {Object.values(EARN_RULES).map((rule, i, arr) => (
          <div
            key={rule.key}
            className={`flex items-center justify-between py-2.5 ${
              i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-text-1">
                {rule.label}
              </span>
              {rule.once && (
                <span className="chip-tag px-[6px] py-[2px] text-[10px]">
                  최초 1회
                </span>
              )}
              {rule.dailyCap && (
                <span className="chip-tag px-[6px] py-[2px] text-[10px]">
                  하루 {rule.dailyCap}회
                </span>
              )}
            </div>
            <span className="text-[13px] font-extrabold text-primary">
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
      <div className="rise-in ai-panel flex flex-col items-center gap-2 rounded-[20px] px-5 py-8 text-center">
        <div className="text-2xl">🪙</div>
        <div className="mt-1 text-base font-extrabold text-white">
          로그인하고 내 포인트를 확인하세요
        </div>
        <div className="text-xs leading-[1.6] text-ai-muted">
          매물 등록 · 임장노트 공개 · 출석으로 포인트가 쌓이고,
          <br />
          상점에서 AI 분석·구독 이용권으로 교환할 수 있어요
        </div>
        <Link
          href="/login?callbackUrl=/my/points"
          className="btn-primary mt-3 rounded-[12px] px-6 py-2.5 text-sm"
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
          <div className="mt-0.5 text-xs text-[#5b74b8]">
            어떤 혜택으로 바꿀 수 있는지 미리 살펴보세요
          </div>
        </div>
        <span className="text-[15px] font-extrabold text-primary">›</span>
      </Link>

      <EarnGuide />
    </div>
  );
}

/* ── 로그인 — 실데이터 뷰 ── */
function WalletView({
  balance,
  history,
}: {
  balance: number;
  history: LedgerRow[];
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
      <div className="rise-in ai-panel flex flex-col gap-4 rounded-[20px] p-[22px]">
        <div>
          <div className="text-xs text-ai-muted">사용 가능한 포인트</div>
          <div className="mt-1 flex items-end gap-1">
            <span className="text-[40px] font-extrabold leading-none text-white">
              {balance.toLocaleString("ko-KR")}
            </span>
            <span className="mb-1 text-lg font-extrabold text-[#7ea2ff]">P</span>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl bg-[rgba(255,255,255,.07)] p-3 text-center">
            <div className="text-[11px] text-ai-muted">이번 달 적립</div>
            <div className="mt-0.5 text-base font-extrabold text-[#7ea2ff]">
              +{monthEarned.toLocaleString("ko-KR")}P
            </div>
          </div>
          <div className="flex-1 rounded-xl bg-[rgba(255,255,255,.07)] p-3 text-center">
            <div className="text-[11px] text-ai-muted">이번 달 사용</div>
            <div className="mt-0.5 text-base font-extrabold text-white">
              −{monthSpent.toLocaleString("ko-KR")}P
            </div>
          </div>
        </div>
        <AttendanceButton />
        <Link
          href="/points/shop"
          className="btn-primary rounded-[12px] py-2.5 text-center text-sm"
        >
          포인트 상점 가기
        </Link>
      </div>

      {/* 적립·소비 내역 */}
      <div className="rise-in-2 card rounded-[16px] p-5">
        <div className="text-sm font-extrabold text-ink">포인트 내역</div>
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 text-center">
            <div className="text-[13px] font-bold text-ink">
              아직 포인트 내역이 없어요
            </div>
            <div className="text-[11px] text-text-3">
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
                    i < history.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">
                      {reasonLabel(r.reason)}
                    </div>
                    <div className="text-[11px] text-text-3">
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
                    <div className="text-[11px] text-text-3">
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

  const [balance, history] = await Promise.all([
    getBalance(email),
    getHistory(email, 50),
  ]);

  return (
    <PageShell breadcrumb="포인트 지갑">
      <WalletView balance={balance} history={history} />
    </PageShell>
  );
}
