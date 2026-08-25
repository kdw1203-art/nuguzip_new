import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import { listWatchlist, type WatchlistItem } from "@/lib/watchlist/store-db";
import { resolveComplexPrice, type ComplexPriceResult } from "@/lib/market/complex-price";
import { countRecentPublicNotesByComplex } from "@/lib/inspection/store-db";
import { formatKrwShort } from "@/lib/market/format";
import { logger } from "@/lib/log";
import { complexHrefFromId } from "@/lib/seo/complex-slug";

/* ============================================================
   웹17 — 관심 단지 대시보드 (/my/watchlist, 로그인 필수)

   단지별 현재가·기준가 대비 변동·최근 30일 새 공개 노트 수를 한 표로.
   전부 기존 로더 조합이다:
   - 현재가: resolveComplexPrice (price-alerts 크론과 같은 산출 — 거래가 가장
     많은 전용면적 구간의 최근 6건 평균, 최소 3건)
   - 변동 기준: user_watchlist.last_price_krw (크론이 세운 기준가). 대표
     면적대(band)가 바뀌었으면 비교하지 않는다 — 59㎡ 평균과 84㎡ 평균의
     차이는 가격 변동이 아니다(크론과 같은 판정).
   - 새 노트: 최근 30일 공개 노트 수(단지 일괄 1쿼리)

   사실 우선: 시세 산출 불가(표본 부족·거래 없음)는 그 사유를 적고, 노트
   수 조회 실패는 "0개"가 아니라 "조회 실패"로 말한다.
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "관심 단지 · 누구집",
  robots: { index: false, follow: false },
};

const MAX_ROWS = 30;

function ymLabel(s: string): string {
  return s.length === 6 ? `${s.slice(0, 4)}.${s.slice(4)}` : s;
}

function skipLabel(r: Extract<ComplexPriceResult, { ok: false }>["reason"]): string {
  switch (r) {
    case "no-trades":
      return "신고된 매매 실거래 없음";
    case "thin-sample":
      return "표본 부족 (3건 미만)";
    case "unresolvable-id":
      return "단지 식별 불가";
    default:
      return "시세 조회 실패";
  }
}

export default async function WatchlistDashboardPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/my/watchlist");
  }
  const email = session.user.email;

  let items: WatchlistItem[] = [];
  let listFailed: string | null = null;
  try {
    items = (await listWatchlist(email)).slice(0, MAX_ROWS);
  } catch (e) {
    listFailed = e instanceof Error ? e.message : String(e);
  }

  const [prices, notesR] = await Promise.all([
    Promise.all(
      items.map((w) =>
        resolveComplexPrice(w.complexId).catch(
          (): ComplexPriceResult => ({ ok: false, reason: "query-failed" }),
        ),
      ),
    ),
    countRecentPublicNotesByComplex(items.map((w) => w.complexId), 30).then(
      (m) => ({ ok: true as const, map: m }),
      (e: unknown) => {
        logger.error("[my/watchlist] 노트 수 조회 실패", e);
        return { ok: false as const };
      },
    ),
  ]);

  return (
    <PageShell breadcrumb="마이 › 관심 단지" title="관심 단지">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="t-body text-text-3">
          관심 단지 {items.length}곳
          {items.length >= MAX_ROWS && ` (최근 ${MAX_ROWS}곳 표시)`} · 시세 변동
          ±1% 이상이면 알림을 보내드려요
        </p>
        <Link href="/my/wishlist" className="t-body font-bold text-primary no-underline">
          관심 매물 보기 →
        </Link>
      </div>

      {listFailed ? (
        <ErrorState
          title="관심 단지를 지금 불러오지 못했어요"
          desc="담아 둔 단지가 0곳인 게 아니라 조회 자체가 실패했습니다. 잠시 후 새로고침해 주세요."
          cause={listFailed}
        />
      ) : items.length === 0 ? (
        <div className="rise-in card card-pad-sm flex flex-col items-center gap-3 py-14 text-center">
          <div className="t-title">
            <Icon name="📌" size={26} />
          </div>
          <div className="t-section text-ink">아직 담아 둔 단지가 없어요</div>
          <p className="max-w-[440px] t-body text-text-3">
            단지 화면의 &ldquo;단지 팔로우&rdquo; 나 지도의 &ldquo;관심 단지 담기&rdquo;를
            누르면 여기에 모이고, 시세가 ±1% 이상 움직이면 알림을 받아요.
          </p>
          <Link href="/map" className="btn-primary btn-md no-underline">
            지도에서 단지 찾기
          </Link>
        </div>
      ) : (
        <>
          {!notesR.ok && (
            <p className="mb-3 rounded-xl border border-line bg-bg px-3 py-2 t-sub text-text-2">
              새 노트 수를 지금 불러오지 못했어요 — 노트가 없는 게 아니라 조회가
              실패했습니다.
            </p>
          )}
          <div className="rise-in card overflow-x-auto rounded-2xl p-[var(--pad-card)]">
            <table className="w-full min-w-[560px] text-left t-body">
              <thead>
                <tr className="border-b border-border t-sub text-text-3">
                  <th className="py-2 font-medium">단지</th>
                  <th className="py-2 text-right font-medium">현재가 (대표 구간)</th>
                  <th className="py-2 text-right font-medium">기준가 대비</th>
                  <th className="py-2 text-right font-medium">새 노트 (30일)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((w, i) => {
                  const p = prices[i];
                  /* 변동 — 크론 기준가와 같은 면적대일 때만 비교한다 */
                  let deltaCell: { text: string; cls: string } = {
                    text: "—",
                    cls: "text-text-3",
                  };
                  if (p.ok && w.lastPriceKrw != null && w.lastPriceKrw > 0) {
                    if (w.lastPriceBand && w.lastPriceBand !== p.price.bandSlug) {
                      deltaCell = { text: "면적대 변경 · 비교 불가", cls: "text-text-3" };
                    } else {
                      const pct =
                        ((p.price.priceKrw - w.lastPriceKrw) / w.lastPriceKrw) * 100;
                      deltaCell =
                        Math.abs(pct) < 0.05
                          ? { text: "0.0%", cls: "text-text-3" }
                          : pct > 0
                            ? { text: `▲ ${pct.toFixed(1)}%`, cls: "text-danger" }
                            : { text: `▼ ${Math.abs(pct).toFixed(1)}%`, cls: "text-primary" };
                    }
                  }
                  const noteCount = notesR.ok
                    ? (notesR.map.get(w.complexId.trim()) ?? 0)
                    : null;
                  return (
                    <tr key={w.id} className="border-b border-border last:border-b-0">
                      <td className="py-2.5 pr-3">
                        <Link
                          href={complexHrefFromId(w.complexId)}
                          className="font-bold text-ink no-underline hover:text-primary"
                        >
                          {w.complexName}
                        </Link>
                        {(w.alertPriceMin != null || w.alertPriceMax != null) && (
                          <span className="mt-0.5 block t-caption text-text-3">
                            알림 범위 {w.alertPriceMin != null ? formatKrwShort(w.alertPriceMin) : ""}
                            ~{w.alertPriceMax != null ? formatKrwShort(w.alertPriceMax) : ""}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        {p.ok ? (
                          <>
                            <span className="font-extrabold text-ink">
                              {formatKrwShort(p.price.priceKrw)}
                            </span>
                            <span className="mt-0.5 block t-caption leading-tight text-text-3">
                              {p.price.bandLabel} · {p.price.sampleSize}건 ·{" "}
                              {ymLabel(p.price.latestYm)}까지
                            </span>
                          </>
                        ) : (
                          <span className="t-sub text-text-3">{skipLabel(p.reason)}</span>
                        )}
                      </td>
                      <td className={`py-2.5 text-right font-bold ${deltaCell.cls}`}>
                        {deltaCell.text}
                      </td>
                      <td className="py-2.5 text-right">
                        {noteCount === null ? (
                          <span className="t-sub text-text-3">조회 실패</span>
                        ) : noteCount > 0 ? (
                          <Link
                            href={complexHrefFromId(w.complexId)}
                            className="font-bold text-primary no-underline"
                          >
                            {noteCount}개 ›
                          </Link>
                        ) : (
                          <span className="text-text-3">0개</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 t-sub text-text-3">
              현재가는 거래가 가장 많은 전용면적 구간의 최근 최대 6건 평균(최소
              3건, 해제 신고 제외) — 시세 변동 알림과 같은 계산입니다. 기준가
              대비는 마지막 알림 관측가 기준이며, 대표 면적대가 바뀐 단지는
              비교하지 않습니다. 새 노트는 최근 30일 공개 임장노트 수입니다.
            </p>
          </div>
        </>
      )}
    </PageShell>
  );
}
