import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import {
  getComplexById,
  getTransactionHistory,
  type ComplexRow,
  type ComplexTransactionRow,
} from "@/lib/complex/complex-store";

/* ============================================================
   항목 H39 — 임베드 위젯 (블로그·카페 배포)
   외부 사이트가 <iframe> 으로 삽입하는, 단일 단지용 콤팩트 카드.
   실데이터: complexes(getComplexById) + complex_transactions(getTransactionHistory).
   서비스 롤 미설정/미조회/무데이터 시 → 예시 카드로 우아하게 폴백 (never crash).
   사이트 크롬 없음(app/embed/layout.tsx), noindex.
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "단지 실거래 시세 · 누구집",
  robots: { index: false, follow: false },
};

// ── 포맷 헬퍼 (단지 허브 page.tsx 와 동일 규칙 — 임베드는 독립 파일이라 로컬 정의) ──

function formatManwon(manwon: number): string {
  if (!Number.isFinite(manwon) || manwon <= 0) return "—";
  if (manwon >= 10_000) return `${(manwon / 10_000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

function pctDelta(curr: number, prev: number | undefined): number | null {
  if (!prev || prev <= 0 || !Number.isFinite(curr)) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function deltaLabel(pct: number | null): { delta: string; tone: "up" | "down" | "flat" } {
  if (pct === null || pct === 0) return { delta: "—", tone: "flat" };
  return pct > 0
    ? { delta: `▲ ${Math.abs(pct).toFixed(1)}%`, tone: "up" }
    : { delta: `▼ ${Math.abs(pct).toFixed(1)}%`, tone: "down" };
}

// ── 뷰 모델 ────────────────────────────────────────────────────────────

interface EmbedView {
  /** 자세히 보기 대상 단지 id — 폴백(예시)이면 null → 홈으로 링크 */
  complexId: string | null;
  name: string;
  dong: string;
  price: string;
  priceSub: string;
  priceSubClass: string;
  stats: { label: string; value: string }[];
  /** 예시(폴백) 카드 여부 — 배지 표기 + CTA 홈 링크 처리 */
  isExample: boolean;
}

/** 실데이터 → 뷰 */
function buildView(row: ComplexRow, tx: ComplexTransactionRow[]): EmbedView {
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  const prev = tx.length > 1 ? tx[tx.length - 2] : null;
  const { delta, tone } = deltaLabel(latest ? pctDelta(latest.avg_manwon, prev?.avg_manwon) : null);

  const stats: { label: string; value: string }[] = [];
  if (row.build_year) stats.push({ label: "준공", value: `${row.build_year}년` });
  if (row.households)
    stats.push({ label: "세대수", value: `${row.households.toLocaleString("ko-KR")}세대` });

  return {
    complexId: row.id,
    name: row.name,
    dong: row.district || row.city || "지역",
    price: latest ? formatManwon(latest.avg_manwon) : "시세 준비 중",
    priceSub: latest ? `${delta} 전월비` : "실거래 수집 중",
    priceSubClass: tone === "down" ? "delta-down" : tone === "up" ? "delta-up" : "text-text-3",
    stats,
    isExample: false,
  };
}

/** 폴백(예시) 뷰 — 서비스 롤 미설정 / 미조회 / 무데이터 시 */
const EXAMPLE_VIEW: EmbedView = {
  complexId: null,
  name: "예시 단지",
  dong: "○○구 ○○동",
  price: "8.2억",
  priceSub: "▼ 1.8% 전월비",
  priceSubClass: "delta-down",
  stats: [
    { label: "준공", value: "2003년" },
    { label: "세대수", value: "1,200세대" },
  ],
  isExample: true,
};

// ── 카드 ───────────────────────────────────────────────────────────────

function EmbedCard({ view }: { view: EmbedView }) {
  const detailHref = view.complexId ? `/complex/${view.complexId}` : "/";

  return (
    <div className="card card-pad-sm relative mx-auto w-full max-w-[360px]">
      {/* 코너 워드마크(attribution) — 홈 링크 */}
      <Link
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="누구집 홈"
        className="absolute right-3 top-3 inline-flex items-center gap-1 text-[10px] font-extrabold text-text-3 transition-colors hover:text-primary"
      >
        <Icon name="house" size={11} />
        누구집
      </Link>

      {/* 헤더 — 단지명 · 지역 */}
      <div className="pr-16">
        {view.isExample && (
          <span className="mb-1 inline-block rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">
            예시 · 단지 정보를 불러오는 중
          </span>
        )}
        <div className="text-base font-extrabold leading-tight text-ink">{view.name}</div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-text-2">
          <Icon name="pin" size={12} />
          {view.dong}
        </div>
      </div>

      {/* 최근 실거래 시세 + 전월비 */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold text-text-3">최근 실거래 시세</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-ink">{view.price}</span>
          <span className={`text-xs font-bold ${view.priceSubClass}`}>{view.priceSub}</span>
        </div>
      </div>

      {/* 미니 스탯 로우 — 준공 / 세대수 (있을 때만) */}
      {view.stats.length > 0 && (
        <div className="mt-3 flex gap-2">
          {view.stats.map((s) => (
            <div
              key={s.label}
              className="flex-1 rounded-lg border border-line px-2 py-1.5 text-center"
            >
              <div className="text-[10px] text-text-3">{s.label}</div>
              <div className="text-xs font-bold text-text-1">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* CTA — 누구집에서 자세히 보기 (새 탭) */}
      <Link
        href={detailHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
      >
        누구집에서 자세히 보기 →
      </Link>

      <div className="mt-1.5 text-center text-[10px] text-text-3">
        국토교통부 실거래가 기준 · 현장 확인 후 판단하세요
      </div>
    </div>
  );
}

// ── 페이지 ─────────────────────────────────────────────────────────────

export default async function EmbedComplexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // 조회 실패/서비스 롤 미설정 시에도 절대 크래시하지 않는다 → 예시 폴백.
  let view: EmbedView = EXAMPLE_VIEW;
  if (id) {
    try {
      const row = await getComplexById(id);
      if (row) {
        const tx = await getTransactionHistory(id);
        view = buildView(row, tx);
      }
    } catch {
      view = EXAMPLE_VIEW;
    }
  }

  return <EmbedCard view={view} />;
}
