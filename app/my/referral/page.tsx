import Link from "next/link";
import { headers } from "next/headers";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { getReferralStats } from "@/lib/referral/store";
import { CopyLink } from "./CopyLink";

/**
 * 마이 · 친구 추천 — 내 코드/초대 링크/성과와 작동 방식 안내.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "친구 추천 · 누구집" };

const FALLBACK_ORIGIN = "https://nuguzip.com";

async function currentOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host ? `${proto}://${host}` : FALLBACK_ORIGIN;
}

function GuestView() {
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3">
      <div className="card glass flex w-full flex-col items-center gap-2 rounded-[20px] px-5 py-8 text-center">
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-[24px]">
          🎁
        </div>
        <div className="text-base font-extrabold text-text-1">
          친구를 초대하고 둘 다 300P 받으세요
        </div>
        <div className="text-xs leading-[1.6] text-text-3">
          로그인하면 내 추천 코드와 초대 링크가 생겨요
        </div>
        <Link
          href="/login?callbackUrl=/my/referral"
          className="btn-primary press mt-3 rounded-[12px] px-6 py-2.5 text-sm no-underline"
        >
          로그인하고 시작하기
        </Link>
      </div>
    </div>
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

  const [stats, origin] = await Promise.all([getReferralStats(email), currentOrigin()]);
  const code = stats.code;
  const link = code ? `${origin}/invite/${code}` : null;

  return (
    <PageShell breadcrumb="마이 · 친구 추천">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        {/* ── 성과 ── */}
        <section className="card glass grid grid-cols-2 gap-3 rounded-[20px] p-5">
          <div className="flex flex-col items-center gap-1">
            <div className="text-[11px] text-text-3">초대 성공</div>
            <div className="text-[26px] font-extrabold leading-none text-text-1">
              {stats.invitedCount.toLocaleString("ko-KR")}
              <span className="ml-0.5 text-[13px] text-text-3">명</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="text-[11px] text-text-3">적립 포인트</div>
            <div className="text-[26px] font-extrabold leading-none text-primary">
              {stats.pointsEarned.toLocaleString("ko-KR")}
              <span className="ml-0.5 text-[13px]">P</span>
            </div>
          </div>
        </section>

        {/* ── 내 코드 ── */}
        <section className="card flex flex-col items-center gap-3 rounded-[20px] p-6 text-center">
          <div className="text-[13px] font-bold text-text-2">내 추천 코드</div>
          {code ? (
            <CopyLink value={code} variant="code" />
          ) : (
            <div className="text-[13px] text-text-3">
              코드를 준비하는 중이에요. 잠시 후 새로고침해 주세요.
            </div>
          )}
        </section>

        {/* ── 초대 링크 ── */}
        {link && (
          <section className="card flex flex-col gap-3 rounded-[20px] p-5">
            <div className="text-[13px] font-bold text-text-2">초대 링크</div>
            <CopyLink value={link} variant="link" />
            <div className="text-[11px] leading-[1.6] text-text-3">
              이 링크로 친구가 가입하면 친구와 나 모두 300P가 적립돼요.
            </div>
          </section>
        )}

        {/* ── 작동 방식 ── */}
        <section className="card flex flex-col gap-3 rounded-[20px] p-5">
          <div className="text-[14px] font-extrabold text-text-1">이렇게 작동해요</div>
          <ol className="flex flex-col gap-2.5">
            {[
              { t: "초대 링크 공유", d: "위 링크나 코드를 친구에게 보내요" },
              { t: "친구 가입", d: "친구가 링크로 가입을 완료해요" },
              { t: "둘 다 300P", d: "친구와 나에게 각각 300P가 적립돼요" },
            ].map((s, i) => (
              <li key={s.t} className="flex items-start gap-3">
                <span className="mt-[1px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-extrabold text-primary">
                  {i + 1}
                </span>
                <div>
                  <div className="text-[13px] font-bold text-text-1">{s.t}</div>
                  <div className="text-[12px] text-text-3">{s.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <Link
          href="/my/points"
          className="press text-center text-[12px] font-semibold text-text-3 no-underline"
        >
          적립된 포인트는 지갑에서 확인 ›
        </Link>
      </div>
    </PageShell>
  );
}
