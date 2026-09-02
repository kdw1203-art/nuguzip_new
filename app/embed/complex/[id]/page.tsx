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
   실데이터: market_transactions(국토부 실거래) → getComplexById·getTransactionHistory.
   서비스 롤 미설정/미조회/무데이터 시 → 시세 없이 "불러올 수 없음" 카드 (never crash).
   사이트 크롬 없음(app/embed/layout.tsx), noindex.
   ============================================================ */

/* 비용 실측(2026-08-10): force-dynamic 이라 익명·크롤러 요청마다 오리진 함수가
   돌았다(x-vercel-cache: MISS, cache-control: private,no-store 실측). 이 화면의
   서버 렌더에는 사용자별 상태가 없다(auth·cookies 0건 — check-cache-policy 가
   회귀를 막는다). ISR 로 전환: 외부 임베드 — 시세 위젯, complex/[id] 와 같은 주기. */
export const revalidate = 3600;
// 동적 세그먼트는 이게 없으면 "요청마다 서버 렌더"로 분류된다(2026-08 complex/[id] 실측)
export function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  title: "단지 실거래 시세 · 내집나우",
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
  /** 자세히 보기 대상 단지 id */
  complexId: string;
  name: string;
  dong: string;
  price: string;
  priceSub: string;
  priceSubClass: string;
  stats: { label: string; value: string }[];
}

/** 실데이터 → 뷰 */
function buildView(
  row: ComplexRow,
  tx: ComplexTransactionRow[],
  txFailed = false,
): EmbedView {
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
    /* "시세 준비 중 · 실거래 수집 중"은 신고된 거래가 아직 없다는 뜻이다.
       조회에 실패했을 뿐인데 그렇게 적으면, 거래가 활발한 단지가 남의 블로그에
       박힌 iframe 안에서 데이터 없는 단지로 보인다. 실패는 실패라고 쓴다. */
    price: latest ? formatManwon(latest.avg_manwon) : txFailed ? "시세 조회 실패" : "시세 준비 중",
    priceSub: latest
      ? `${delta} 전월비`
      : txFailed
        ? "잠시 후 다시 시도해 주세요"
        : "실거래 수집 중",
    priceSubClass: tone === "down" ? "delta-down" : tone === "up" ? "delta-up" : "text-text-3",
    stats,
  };
}

/* 사실 우선: 여기 있던 EXAMPLE_VIEW 를 삭제했다.
   "예시 단지 · 8.2억 · ▼1.8% 전월비 · 2003년 · 1,200세대" 를 폴백으로 그렸는데,
   이 위젯은 <iframe> 으로 외부 블로그·카페에 박히는 카드다. 남의 글 안에서
   내집나우 워드마크와 "국토교통부 실거래가 기준" 문구를 달고 지어낸 가격이 뜬다 —
   작은 "예시" 배지로 상쇄되지 않는다. 조회에 실패하면 가격을 아예 그리지 않는다. */

// ── 카드 ───────────────────────────────────────────────────────────────

/** 단지를 찾지 못했거나 조회에 실패했을 때 — 숫자를 그리지 않는 카드. */
function UnavailableCard({ reason }: { reason: "notfound" | "error" }) {
  return (
    <div className="card card-pad-sm relative mx-auto w-full max-w-[360px]">
      <Wordmark />
      <div className="pr-16">
        <div className="text-base font-extrabold leading-tight text-ink">
          {reason === "notfound" ? "단지 정보를 찾을 수 없어요" : "시세를 불러오지 못했어요"}
        </div>
        <div className="mt-1 text-xs leading-[1.6] text-text-2">
          {reason === "notfound"
            ? "주소가 바뀌었거나 아직 등록되지 않은 단지예요."
            : "일시적인 오류입니다. 잠시 후 다시 시도해 주세요."}
        </div>
      </div>
      <Link
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
      >
        내집나우에서 단지 찾기 →
      </Link>
    </div>
  );
}

/** 코너 워드마크(attribution) — 홈 링크 */
function Wordmark() {
  return (
    <Link
      href="/"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="내집나우 홈"
      className="absolute right-3 top-3 inline-flex items-center gap-1 text-[10px] font-extrabold text-text-3 transition-colors hover:text-primary"
    >
      <Icon name="house" size={11} />
      내집나우
    </Link>
  );
}

function EmbedCard({ view }: { view: EmbedView }) {
  const detailHref = `/complex/${view.complexId}`;

  return (
    <div className="card card-pad-sm relative mx-auto w-full max-w-[360px]">
      {/* [#107] 임베드 채택 비콘 — 부모 페이지(host)만 일집계, 개인 식별 없음 */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            'try{var r=document.referrer;if(r&&navigator.sendBeacon){navigator.sendBeacon("/api/embed/beacon",new Blob([JSON.stringify({ref:r,kind:"complex"})],{type:"application/json"}))}}catch(e){}',
        }}
      />
      <Wordmark />

      {/* 헤더 — 단지명 · 지역 */}
      <div className="pr-16">
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

      {/* CTA — 내집나우에서 자세히 보기 (새 탭) */}
      <Link
        href={detailHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
      >
        내집나우에서 자세히 보기 →
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

  // 절대 크래시하지 않되, 못 불러온 것을 시세인 척 그리지도 않는다.
  // "없음"(notfound)과 "실패"(error)는 다른 상태이므로 나눠서 알린다.
  if (!id) return <UnavailableCard reason="notfound" />;

  let row: ComplexRow | null;
  try {
    row = await getComplexById(id);
  } catch {
    return <UnavailableCard reason="error" />;
  }
  if (!row) return <UnavailableCard reason="notfound" />;

  // 단지는 찾았고 거래 이력만 실패한 경우 — 단지 카드는 그리되 시세 자리는
  // "준비 중"이 아니라 "조회 실패"로 적는다(없음과 실패는 다른 사실).
  let tx: ComplexTransactionRow[] = [];
  let txFailed = false;
  try {
    tx = await getTransactionHistory(id);
  } catch {
    tx = [];
    txFailed = true;
  }

  return <EmbedCard view={buildView(row, tx, txFailed)} />;
}
