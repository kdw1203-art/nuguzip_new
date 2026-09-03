import Link from "next/link";
import { headers } from "next/headers";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import { getReferralStats, getReferralLeaderboard } from "@/lib/referral/store";
import { CopyLink } from "./CopyLink";
import { ShareRow } from "./ShareRow";

/**
 * 마이 · 친구 추천 — 리치 대시보드.
 * 내 코드/초대 링크 + 공유 버튼(카카오·링크복사·문자) + 성과(초대 수·적립 P)
 * + 초대 여정 배지 + "이렇게 초대돼요" 3-step 안내.
 * 데이터는 기존 getReferralStats(= GET /api/referral 와 동일 shape) 만 사용한다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "친구 추천 · 내집나우" };

const FALLBACK_ORIGIN = "https://naezipnow.com";

/** 초대 여정 배지 — 실제 추가 적립을 약속하지 않는 순수 동기부여 지표. */
const MILESTONES: { n: number; label: string; icon: string }[] = [
  { n: 1, label: "첫 초대", icon: "sparkles" },
  { n: 3, label: "친구 셋", icon: "users" },
  { n: 5, label: "인기 초대", icon: "medal" },
  { n: 10, label: "초대왕", icon: "crown" },
];

async function currentOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host ? `${proto}://${host}` : FALLBACK_ORIGIN;
}

function GuestView() {
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3">
      <div className="card glass flex w-full flex-col items-center gap-2 rounded-[18px] px-5 py-8 text-center">
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="gift" size={24} />
        </div>
        <div className="text-base font-extrabold text-text-1">
          친구를 초대하고 둘 다 300P 받으세요
        </div>
        <div className="text-xs leading-[1.6] text-text-3">
          로그인하면 내 추천 코드와 초대 링크가 생겨요
        </div>
        <Link
          href="/login?callbackUrl=/my/referral"
          className="btn-primary press mt-3 rounded-[10px] px-6 py-2.5 text-sm no-underline"
        >
          로그인하고 시작하기
        </Link>
      </div>
    </div>
  );
}

/** 초대 여정 배지 스트립 — invitedCount 기준으로 달성 배지를 채운다. */
function MilestoneStrip({ invitedCount }: { invitedCount: number }) {
  const next = MILESTONES.find((m) => invitedCount < m.n) ?? null;
  const prevTarget = next
    ? [...MILESTONES].reverse().find((m) => m.n <= invitedCount)?.n ?? 0
    : (MILESTONES[MILESTONES.length - 1]?.n ?? 0);
  const span = next ? next.n - prevTarget : 1;
  const progressed = next ? invitedCount - prevTarget : span;
  const pct = Math.max(0, Math.min(100, Math.round((progressed / span) * 100)));
  const remaining = next ? next.n - invitedCount : 0;

  return (
    <section className="card flex flex-col gap-4 rounded-[18px] p-5">
      <div className="flex items-center gap-2">
        <Icon name="trophy" size={16} className="text-primary" />
        <div className="t-section text-text-1">초대 여정</div>
      </div>

      {/* 배지 4종 */}
      <div className="flex items-start justify-between gap-1">
        {MILESTONES.map((m) => {
          const reached = invitedCount >= m.n;
          return (
            <div key={m.n} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-full ${
                  reached
                    ? "bg-primary text-white"
                    : "bg-primary-soft text-text-3"
                }`}
              >
                <Icon name={reached ? m.icon : "lock"} size={18} />
              </div>
              <div
                className={`text-[11px] font-bold ${
                  reached ? "text-text-1" : "text-text-3"
                }`}
              >
                {m.label}
              </div>
              <div className="t-caption text-text-3">{m.n}명</div>
            </div>
          );
        })}
      </div>

      {/* 다음 배지까지 진행바 */}
      {next ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-primary-soft">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="t-sub text-text-3">
            <span className="font-bold text-text-2">{next.label}</span> 배지까지{" "}
            <span className="font-bold text-primary">{remaining}명</span> 남았어요 ·
            초대가 성사될 때마다 나와 친구 모두 300P가 적립돼요.
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-[10px] bg-primary-soft px-3 py-2.5">
          <Icon name="party" size={16} className="text-primary" />
          <div className="t-sub font-semibold text-primary">
            모든 배지를 모았어요! 초대는 계속 300P로 이어져요.
          </div>
        </div>
      )}
    </section>
  );
}

export default async function ReferralPage() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;

  if (!email) {
    return (
      <PageShell breadcrumb="마이 · 친구 추천">
        <GuestView />
      </PageShell>
    );
  }

  const [stats, origin, leaders] = await Promise.all([
    getReferralStats(email),
    currentOrigin(),
    getReferralLeaderboard(email, 10),
  ]);
  const code = stats.code;
  const link = code ? `${origin}/invite/${code}` : null;

  return (
    <PageShell breadcrumb="마이 · 친구 추천">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        {/* ── 히어로: 코드 + 링크 + 공유 ── */}
        <section className="card glass flex flex-col items-center gap-4 rounded-[22px] p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="gift" size={24} />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="t-section text-text-1">
              친구를 초대하고 둘 다 300P
            </h1>
            <p className="t-sub text-text-3">
              아래 링크로 친구가 가입하면 친구와 나 모두 300P가 적립돼요
            </p>
          </div>

          {code ? (
            <>
              <div className="w-full rounded-2xl bg-primary-soft px-4 py-4">
                <div className="t-sub font-bold text-primary">내 추천 코드</div>
                <div className="mt-2">
                  <CopyLink value={code} variant="code" />
                </div>
              </div>

              {link && (
                <div className="w-full">
                  <CopyLink value={link} variant="link" />
                </div>
              )}

              {link && <ShareRow link={link} code={code} />}
            </>
          ) : (
            <div className="t-body text-text-3">
              코드를 준비하는 중이에요. 잠시 후 새로고침해 주세요.
            </div>
          )}
        </section>

        {/* ── 성과 ── */}
        <section className="card grid grid-cols-2 gap-3 rounded-[18px] p-5">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1 t-sub text-text-3">
              <Icon name="user-plus" size={13} />
              초대 성공
            </div>
            {/* 못 센 것을 "0명"으로 그리지 않는다 — 아직 아무도 초대 못 한
                사람과 지금 셀 수 없는 사람은 다르다. */}
            <div className="t-title leading-none text-text-1">
              {stats.invitedCount === null ? (
                "—"
              ) : (
                <>
                  {stats.invitedCount.toLocaleString("ko-KR")}
                  <span className="ml-0.5 t-body text-text-3">명</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1 t-sub text-text-3">
              <Icon name="coin" size={13} />
              적립 포인트
            </div>
            {/* 적립 P 는 성사 수 × 300 이라, 성사 수를 못 세면 이것도 모른다.
                "0P"라고 쓰면 적립이 없었다는 말이 되므로 같이 "—"로 둔다. */}
            <div className="t-title leading-none text-primary">
              {stats.pointsEarned === null ? (
                "—"
              ) : (
                <>
                  {stats.pointsEarned.toLocaleString("ko-KR")}
                  <span className="ml-0.5 t-body">P</span>
                </>
              )}
            </div>
          </div>
          {stats.invitedCount === null && (
            <div className="col-span-2 text-center t-sub text-text-3">
              지금은 초대 성과를 불러오지 못했어요. 초대 링크는 그대로 쓸 수 있고,
              적립은 잠시 후 다시 열면 반영돼요.
            </div>
          )}
        </section>

        {/* ── 초대 여정 배지 ──
            성사 수를 모르면 배지 스트립 자체를 접는다. 0으로 그리면 모든 배지가
            잠긴 채 "첫 초대까지 1명 남았어요"가 되는데, 이미 초대한 사람에게는
            거짓말이다. */}
        {stats.invitedCount !== null && <MilestoneStrip invitedCount={stats.invitedCount} />}

        {/* ── 이렇게 초대돼요 ── */}
        <section className="card flex flex-col gap-3 rounded-[18px] p-5">
          <div className="t-section text-text-1">이렇게 초대돼요</div>
          <ol className="flex flex-col gap-2.5">
            {[
              {
                icon: "link",
                t: "초대 링크 공유",
                d: "카카오톡·문자로 링크나 코드를 친구에게 보내요",
              },
              {
                icon: "user-plus",
                t: "친구 가입",
                d: "친구가 링크로 접속해 가입을 완료해요",
              },
              {
                icon: "gift",
                t: "둘 다 300P",
                d: "친구와 나에게 각각 300P가 자동 적립돼요",
              },
            ].map((s, i) => (
              <li key={s.t} className="flex items-start gap-3">
                <span className="mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Icon name={s.icon} size={15} />
                </span>
                <div>
                  <div className="t-body font-bold text-text-1">
                    <span className="mr-1 text-primary">{i + 1}.</span>
                    {s.t}
                  </div>
                  <div className="t-sub text-text-3">{s.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* [#100] 추천 리더보드 — 초대의 사회적 동기. 못 읽으면 섹션 생략(0명 위장 금지) */}
        {leaders !== null && leaders.length > 0 && (
          <section className="card rounded-[18px] p-5">
            <h2 className="t-section text-ink">추천 리더보드</h2>
            <p className="mt-0.5 t-sub text-text-3">가장 많이 초대한 이웃 (익명 표시)</p>
            <ol className="mt-3 flex list-none flex-col gap-1.5 p-0">
              {leaders.map((l, i) => (
                <li
                  key={`${l.label}-${i}`}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                    l.isMe ? "bg-primary-soft" : "bg-bg"
                  }`}
                >
                  <span className="w-5 text-center t-body font-extrabold tabular-nums text-primary">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 t-body font-bold text-ink">
                    {l.label}
                    {l.isMe && <span className="ml-1 t-sub font-extrabold text-primary">나</span>}
                  </span>
                  <span className="t-sub font-bold tabular-nums text-text-2">
                    {l.count.toLocaleString("ko-KR")}명 초대
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <Link
          href="/my/points"
          className="press text-center t-sub font-semibold text-text-3 no-underline"
        >
          적립된 포인트는 지갑에서 확인 ›
        </Link>
      </div>
    </PageShell>
  );
}
