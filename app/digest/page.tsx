import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { HouseMark } from "@/app/components/Logo";
import { ErrorState } from "@/app/components/ui";
import { getWeeklyDigest, type DigestDeltaTone, type WeeklyDigest } from "@/lib/newui/digest";
import { logger } from "@/lib/log";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata = buildPageMetadata({
  title: "주간 다이제스트",
  description:
    "최근 7일 부동산 뉴스, 지역 시세 변동, 이웃 글을 한 장으로 요약합니다. 실제 수집된 데이터만 싣습니다.",
  path: "/digest",
});

/* ============================================================
   주간 다이제스트 (#86) — 최근 7일 실데이터 요약
   뉴스 하이라이트(board_posts) · 시장 요약(market_region_price) ·
   커뮤니티(이웃 글). 빈 데이터는 빈 상태 문구로 폴백 (가짜 숫자 없음).
   ============================================================ */

export const revalidate = 3600;

function deltaClass(tone: DigestDeltaTone): string {
  if (tone === "up") return "delta-up";
  if (tone === "down") return "delta-down";
  return "delta-flat";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function asOfLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function DigestPage() {
  /* 전체 조회 실패는 던져서 온다(lib/newui/digest.ts). 여기서 "데이터 없음"으로
     바꿔 말하지 않고, 실패는 실패로 화면에 적는다. */
  let digest: WeeklyDigest | null = null;
  let cause: string | null = null;
  try {
    digest = await getWeeklyDigest();
  } catch (e) {
    logger.error("[DigestPage]", e);
    cause = e instanceof Error ? e.message : String(e);
  }

  if (!digest) {
    return (
      <PageShell breadcrumb="주간 다이제스트">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-2.5">
          <h1 className="mt-2 t-section text-ink">주간 다이제스트</h1>
          <ErrorState
            title="주간 요약을 불러오지 못했어요"
            desc="데이터 조회가 실패했습니다. 이번 주에 소식이 없다는 뜻은 아니에요. 잠시 후 다시 열어봐 주세요."
            cause={cause ?? undefined}
            action={{ label: "동네 이야기 보기", href: "/town" }}
          />
        </div>
      </PageShell>
    );
  }

  const { news, market, community, failed } = digest;
  const anyFailed = failed.news || failed.market || failed.community;

  const previewParts: string[] = [];
  if (news.length > 0) previewParts.push(`뉴스 ${news.length}건`);
  if (market.length > 0) previewParts.push(`주요 지역 시세 ${market.length}곳`);
  if (community.count > 0) previewParts.push(`이웃 글 ${community.count}건`);
  /* 일부가 조회 실패면 "0건"이라고 말하지 않는다 — 그건 사실이 아니다. */
  const previewLine =
    previewParts.length > 0
      ? `이번 주 ${previewParts.join(" · ")}${anyFailed ? " (일부 조회 실패)" : ""}`
      : anyFailed
        ? "이번 주 요약을 일부 불러오지 못했어요"
        : "이번 주 새로 모인 소식이 아직 없어요";

  return (
    <PageShell breadcrumb="주간 다이제스트">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-2.5">
        {/* 푸시 미리보기 카드 */}
        <div className="rise-in glass-strong flex gap-2.5 rounded-2xl px-3.5 py-3 shadow-[0_8px_24px_rgba(16,28,54,.12)]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary">
            <HouseMark size={17} />
          </div>
          <div className="flex-1">
            <div className="flex justify-between">
              <span className="text-xs font-extrabold text-ink">
                누구집 · 주간 다이제스트
              </span>
              <span className="t-caption text-text-3">최근 7일</span>
            </div>
            <div className="mt-0.5 t-sub text-text-2">{previewLine}</div>
          </div>
        </div>

        {/* 구독 CTA — 매주 받아보기 → 알림 설정 */}
        {/* 설정 → 푸시 알림 → "주간 다이제스트". 예전에는 이 링크가 수신함(/notifications)
            으로 갔고, 정작 켤 스위치도 보내는 크론도 없어서 지킬 수 없는 안내였다.
            지금은 옵트인 스위치(notification_preferences.push_weekly_digest)와
            발송 크론(/api/cron/weekly-digest, 월 18:00 KST)이 실제로 있다. */}
        <Link
          href="/my/settings"
          className="rise-in-1 tile flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5 no-underline"
        >
          <div>
            <div className="t-body font-extrabold text-ink">매주 받아보기</div>
            <div className="mt-0.5 t-sub text-text-2">
              설정 › 알림 › 푸시 알림에서 ‘주간 다이제스트’를 켜면 매주 월요일 저녁에
              이 요약을 한 번 보내드려요.
            </div>
          </div>
          <span className="shrink-0 rounded-[10px] bg-primary-soft px-3.5 py-2 text-xs font-bold text-primary">
            알림 설정 ›
          </span>
        </Link>

        <h1 className="rise-in-1 mt-2 t-section text-ink">
          {digest.weekLabel} 주간 다이제스트
        </h1>

        {/* 뉴스 하이라이트 (board_posts 자동 수집, 7일) */}
        <div className="rise-in-2 card flex flex-col gap-2 rounded-2xl px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-ink">뉴스 하이라이트</span>
            <Link href="/town/news" className="t-sub font-extrabold text-primary">
              전체 ›
            </Link>
          </div>
          {news.length === 0 &&
            (failed.news ? (
              <div className="rounded-[10px] bg-danger-soft px-3 py-2 t-sub text-ink">
                뉴스를 불러오지 못했어요 (조회 실패). 수집된 뉴스가 없다는 뜻은 아니에요.
              </div>
            ) : (
              <div className="t-sub text-text-3">
                최근 7일 수집된 뉴스가 없어요.
              </div>
            ))}
          {news.map((n) => (
            <Link key={n.id} href={`/town/news/${n.id}`} className="group">
              <div className="t-sub font-bold text-ink group-hover:text-primary">
                {n.title}
              </div>
              <div className="mt-[2px] t-caption text-text-3">
                {[n.sourceName, shortDate(n.publishedAt), n.region]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </Link>
          ))}
        </div>

        {/* 시장 요약 (market_region_price, 전월 대비) */}
        <div className="rise-in-3 card flex flex-col gap-[7px] rounded-2xl px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-ink">시장 요약</span>
            <span className="t-caption text-text-3">
              평균 매매가 · 전월 대비
              {market[0]?.periodLabel ? ` · ${market[0].periodLabel} 기준` : ""}
            </span>
          </div>
          {market.length === 0 &&
            (failed.market ? (
              <div className="rounded-[10px] bg-danger-soft px-3 py-2 t-sub text-ink">
                시세를 불러오지 못했어요 (조회 실패).
              </div>
            ) : (
              <div className="t-sub text-text-3">
                주요 지역 시세로 표시할 최신 스냅샷이 아직 없어요.
              </div>
            ))}
          {market.map((m) => (
            <div key={m.regionId} className="flex items-center justify-between t-sub">
              <span className="text-text-2">
                <b className="font-bold text-ink">{m.name}</b>
                <span className="ml-1 text-text-3">{m.city}</span>
              </span>
              <span className="text-text-1">
                {m.price}{" "}
                <span className={`${deltaClass(m.tone)} text-[11px]`}>{m.delta}</span>
              </span>
            </div>
          ))}
        </div>

        {/* 커뮤니티 (최근 7일 이웃 글) */}
        <div className="rise-in-4 card flex flex-col gap-2 rounded-2xl px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-ink">커뮤니티</span>
            <Link href="/town" className="t-sub font-extrabold text-primary">
              동네 이야기 ›
            </Link>
          </div>
          {failed.community ? (
            <div className="rounded-[10px] bg-danger-soft px-3 py-2 t-sub text-ink">
              이웃 글을 불러오지 못했어요 (조회 실패). 글이 없다는 뜻은 아니에요.
            </div>
          ) : community.count === 0 ? (
            <div className="t-sub text-text-3">
              이번 주 새 이웃 글이 아직 없어요. 첫 글을 남겨보세요.
            </div>
          ) : (
            <>
              <div className="t-sub text-text-2">
                이번 주 새 이웃 글 <b className="text-ink">{community.count}건</b>
              </div>
              {community.titles.map((t) => (
                <Link
                  key={t.id}
                  href={`/town/news/${t.id}`}
                  className="t-sub font-bold text-ink hover:text-primary"
                >
                  {t.title}
                </Link>
              ))}
            </>
          )}
        </div>

        {/* N23 — 이 페이지는 "최근 7일" 이라 어제 본 내용과 오늘 본 내용이 다르다.
            그래서 이 주소는 인용할 수 없다. 주 단위로 고정된 아카이브를 따로 둔다. */}
        <p className="rise-in-5 text-center t-sub text-text-3">
          <Link href="/digest/archive" className="font-extrabold text-primary">
            지난 주간 다이제스트 아카이브 ›
          </Link>
        </p>

        <p className="rise-in-5 text-center t-caption text-text-3">
          데이터 기준 시각 {asOfLabel(digest.generatedAt)}
          {digest.marketAsOf ? ` · 실거래 기준 ${digest.marketAsOf} (국토교통부)` : ""}
        </p>
      </div>
    </PageShell>
  );
}
