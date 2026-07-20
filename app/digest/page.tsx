import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { HouseMark } from "@/app/components/Logo";
import { getWeeklyDigest, type DigestDeltaTone } from "@/lib/newui/digest";

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
  const digest = await getWeeklyDigest();
  const { news, market, community } = digest;

  const previewParts: string[] = [];
  if (news.length > 0) previewParts.push(`뉴스 ${news.length}건`);
  if (market.length > 0) previewParts.push(`주요 지역 시세 ${market.length}곳`);
  if (community.count > 0) previewParts.push(`이웃 글 ${community.count}건`);
  const previewLine =
    previewParts.length > 0
      ? `이번 주 ${previewParts.join(" · ")}`
      : "이번 주 요약을 준비 중이에요";

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
              <span className="text-[10px] text-text-3">최근 7일</span>
            </div>
            <div className="mt-0.5 text-[11px] text-text-2">{previewLine}</div>
          </div>
        </div>

        {/* 구독 CTA — 매주 받아보기 → 알림 설정 */}
        <Link
          href="/notifications"
          className="rise-in-1 card-hover flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5 no-underline"
        >
          <div>
            <div className="text-[13px] font-extrabold text-ink">매주 받아보기</div>
            <div className="mt-0.5 text-[11px] text-text-2">
              알림 설정에서 주간 다이제스트 알림을 켜면 매주 요약을 보내드려요.
            </div>
          </div>
          <span className="shrink-0 rounded-[10px] bg-primary-soft px-3.5 py-2 text-xs font-bold text-primary">
            알림 설정 ›
          </span>
        </Link>

        <h1 className="rise-in-1 mt-2 text-[17px] font-extrabold text-ink">
          {digest.weekLabel} 주간 다이제스트
        </h1>

        {/* 뉴스 하이라이트 (board_posts 자동 수집, 7일) */}
        <div className="rise-in-2 card flex flex-col gap-2 rounded-2xl px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-ink">뉴스 하이라이트</span>
            <Link href="/town/news" className="text-[11px] font-extrabold text-primary">
              전체 ›
            </Link>
          </div>
          {news.length === 0 && (
            <div className="text-[11px] text-text-3">
              최근 7일 수집된 뉴스가 없어요.
            </div>
          )}
          {news.map((n) => (
            <Link key={n.id} href={`/town/news/${n.id}`} className="group">
              <div className="text-[12px] font-bold leading-[1.45] text-ink group-hover:text-primary">
                {n.title}
              </div>
              <div className="mt-[2px] text-[10px] text-text-3">
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
            <span className="text-[10px] text-text-3">
              평균 매매가 · 전월 대비
              {market[0]?.periodLabel ? ` · ${market[0].periodLabel} 기준` : ""}
            </span>
          </div>
          {market.length === 0 && (
            <div className="text-[11px] text-text-3">
              시세 데이터를 준비 중이에요.
            </div>
          )}
          {market.map((m) => (
            <div key={m.regionId} className="flex items-center justify-between text-[11px]">
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
            <Link href="/town" className="text-[11px] font-extrabold text-primary">
              동네 이야기 ›
            </Link>
          </div>
          {community.count === 0 ? (
            <div className="text-[11px] text-text-3">
              이번 주 새 이웃 글이 아직 없어요. 첫 글을 남겨보세요.
            </div>
          ) : (
            <>
              <div className="text-[11px] text-text-2">
                이번 주 새 이웃 글 <b className="text-ink">{community.count}건</b>
              </div>
              {community.titles.map((t) => (
                <Link
                  key={t.id}
                  href={`/town/news/${t.id}`}
                  className="text-[12px] font-bold leading-[1.45] text-ink hover:text-primary"
                >
                  {t.title}
                </Link>
              ))}
            </>
          )}
        </div>

        <p className="rise-in-5 text-center text-[10px] text-[#adb5bd]">
          데이터 기준 시각 {asOfLabel(digest.generatedAt)}
          {digest.marketAsOf ? ` · 실거래 기준 ${digest.marketAsOf} (국토교통부)` : ""}
        </p>
      </div>
    </PageShell>
  );
}
