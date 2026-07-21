import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import { getBalance } from "@/lib/points/ledger";
import { SPEND_ITEMS } from "@/lib/points/catalog";
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
          쌓인 포인트로 AI 분석·단지 리포트·구독 이용권을 받을 수 있어요
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

  const balance = await getBalance(email);

  return (
    <PageShell breadcrumb="포인트 상점">
      <ShopClient initialBalance={balance} />
    </PageShell>
  );
}
