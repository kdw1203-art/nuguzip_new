import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import { getBalance } from "@/lib/points/ledger";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";
import { SPEND_ITEMS, POINTS_GRATUITOUS_NOTICE } from "@/lib/points/catalog";
import { ShopClient } from "./ShopClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "포인트 상점" };

/* ── 비로그인 안내 (상품은 미리보기로 노출) ── */
function GuestView() {
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-3">
      <div className="rise-in ai-panel flex flex-col items-center gap-2 rounded-[20px] px-5 py-8 text-center">
        <div className="text-2xl"><Icon name="shopping-bag" size={24} /></div>
        <div className="mt-1 text-base font-extrabold text-white">
          로그인하고 포인트를 교환하세요
        </div>
        <div className="text-xs leading-[1.6] text-ai-muted">
          쌓인 포인트로 구독 이용권·매물 상단 노출을 받을 수 있어요
        </div>
        <Link
          href="/login?callbackUrl=/points/shop"
          className="btn-primary mt-3 rounded-[12px] px-6 py-2.5 text-sm"
        >
          로그인하고 시작하기
        </Link>
      </div>

      <div className="rise-in-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SPEND_ITEMS.map((item) => (
          <div key={item.key} className="card rounded-[16px] p-5 opacity-80">
            <div className="text-sm font-extrabold text-ink">{item.label}</div>
            <div className="mt-1 text-[12px] leading-[1.5] text-text-3">
              {item.desc}
            </div>
            <div className="mt-3 text-[15px] font-extrabold text-primary">
              {item.cost.toLocaleString("ko-KR")}P
            </div>
          </div>
        ))}
      </div>
      <Link
        href="/town/library"
        className="rise-in-2 flex items-center justify-between rounded-2xl bg-primary-soft px-4 py-[15px] no-underline"
      >
        <div>
          <div className="text-sm font-extrabold text-primary">
            자료실 유료 리포트도 포인트로 구매
          </div>
          <div className="mt-0.5 text-xs text-[#5b74b8]">
            이웃·전문가가 올린 유료 자료를 보유 포인트로 바로 열람해요
          </div>
        </div>
        <span className="text-[15px] font-extrabold text-primary">›</span>
      </Link>
      <p className="rise-in-3 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        {POINTS_GRATUITOUS_NOTICE}
      </p>
    </div>
  );
}

export default async function PointsShopPage() {
  const session = await safeAuth();
  const email = session?.user?.email;

  if (!email) {
    return (
      <PageShell breadcrumb="포인트 상점">
        <GuestView />
      </PageShell>
    );
  }

  /* 잔액 조회가 실패하면 예전에는 0 이 내려와 상점 상단에 "0 P" 가 사실처럼
     찍혔다. 가진 사람에게 없다고 말하는 셈이고, 그 상태로 구매를 누르면
     "포인트가 부족해요" 까지 따라온다. 못 읽었으면 못 읽었다고 쓴다. */
  const loaded = await getBalance(email).then(
    (balance) => ({ ok: true as const, balance }),
    (err: unknown) => {
      logger.error("[points/shop] 잔액 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );

  if (!loaded.ok) {
    return (
      <PageShell breadcrumb="포인트 상점">
        <div className="mx-auto w-full max-w-[720px]">
          <ErrorState
            title="포인트 상점을 지금 열 수 없어요"
            desc="보유 포인트를 확인하지 못했습니다. 잔액이 0이라는 뜻이 아니라 조회 자체가 실패했어요. 잠시 후 다시 시도해 주세요."
            cause={loaded.cause}
            action={{ label: "포인트 안내로 이동", href: "/points" }}
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell breadcrumb="포인트 상점">
      <ShopClient initialBalance={loaded.balance} />
      {/* 사용처 안내 — 상점 목록 밖에서도 포인트가 쓰이는 곳: 자료실 유료 리포트.
          (구매 자체는 /town/library 상세의 리포트 결제 버튼에서 포인트로 처리된다) */}
      <Link
        href="/town/library"
        className="mx-auto mt-4 flex w-full max-w-[720px] items-center justify-between rounded-2xl bg-primary-soft px-4 py-[15px] no-underline"
      >
        <div>
          <div className="text-sm font-extrabold text-primary">
            자료실 유료 리포트도 포인트로 구매
          </div>
          <div className="mt-0.5 text-xs text-[#5b74b8]">
            이웃·전문가가 올린 유료 자료를 보유 포인트로 바로 열람해요
          </div>
        </div>
        <span className="text-[15px] font-extrabold text-primary">›</span>
      </Link>
      {/* 무상성 고지 — PG 심사·소비자 오인 방지 공용(단일 출처) */}
      <p className="mx-auto mt-4 w-full max-w-[720px] rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        {POINTS_GRATUITOUS_NOTICE}
      </p>
    </PageShell>
  );
}
