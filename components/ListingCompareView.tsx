"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  remove as removeFromStore,
  MIN_COMPARE,
  type CompareListing,
  type CompareListingType,
  type MarketAwareCompareListing,
} from "./listing-compare-store";

/* ── 표시 상수(서버 store-db 클라이언트 번들 유입 방지 위해 로컬 재정의) ── */
const LISTING_STALE_DAYS = 21;
const TYPE_LABEL: Record<CompareListingType, string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};
const SOURCE_LABEL: Record<CompareListing["source"], string> = {
  owner: "집주인 직접",
  agent: "중개사",
};

/** 원(KRW) → "28.6억" / "9,800만" */
function formatKrwShort(krw: number | null | undefined): string {
  if (krw === null || krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

function priceLine(l: CompareListing): string {
  if (l.listingType === "sale") return `매매 ${formatKrwShort(l.priceKrw)}`;
  if (l.listingType === "jeonse") return `전세 ${formatKrwShort(l.depositKrw)}`;
  return `월세 ${formatKrwShort(l.depositKrw)} / ${formatKrwShort(l.monthlyKrw)}`;
}

/** 유형별 대표 비교가(정렬/최저가 강조용). 없으면 null. */
function primaryPriceKrw(l: CompareListing): number | null {
  const v = l.listingType === "sale" ? l.priceKrw : l.listingType === "jeonse" ? l.depositKrw : l.monthlyKrw;
  return v !== null && Number.isFinite(v) && v > 0 ? v : null;
}

/** ㎡ → 평 (1평 ≈ 3.3058㎡) */
function pyeong(m2: number): number {
  return Math.round((m2 / 3.3058) * 10) / 10;
}

function isStale(l: Pick<CompareListing, "createdAt" | "refreshedAt">): boolean {
  const t = Date.parse(l.refreshedAt ?? l.createdAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > LISTING_STALE_DAYS * 86_400_000;
}

/** ISO → "2026.07.21" */
function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

type Row = MarketAwareCompareListing;

/**
 * /listings/compare 본문 — 담긴 매물 2~3개를 나란히 비교.
 * 우선순위: 세션 비교함(클라이언트 네비게이션 유지) → 서버 조회 결과(공유·새로고침).
 */
export function ListingCompareView({
  ids,
  serverItems,
}: {
  ids: string[];
  serverItems: MarketAwareCompareListing[];
}) {
  const router = useRouter();
  const storeItems = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // URL(ids)을 초기 표시 순서로. 없으면 스토어에 담긴 순서.
  const [order, setOrder] = useState<string[]>(() =>
    ids.length > 0 ? ids : storeItems.map((i) => i.id),
  );

  const rows = useMemo<Row[]>(() => {
    const storeMap = new Map(storeItems.map((i) => [i.id, i]));
    const serverMap = new Map(serverItems.map((i) => [i.id, i]));
    const seq = order.length > 0 ? order : storeItems.map((i) => i.id);
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const id of seq) {
      if (seen.has(id)) continue;
      seen.add(id);
      const s = serverMap.get(id);
      const c = storeMap.get(id);
      // 세션 스토어 데이터 우선(사용자가 실제 담은 것), 시세대비는 서버값 사용.
      const base = c ?? s;
      if (!base) continue;
      out.push({ ...base, marketDeltaPct: s?.marketDeltaPct ?? null });
    }
    return out;
  }, [order, storeItems, serverItems]);

  function handleRemove(id: string) {
    removeFromStore(id);
    const next = order.filter((x) => x !== id);
    setOrder(next);
    const q = next.join(",");
    router.replace(q ? `/listings/compare?ids=${q}` : "/listings/compare");
  }

  if (rows.length === 0) {
    return (
      <div className="rise-in card card-pad-sm flex flex-col items-center gap-3 py-14 text-center">
        <Icon name="scale" size={30} className="text-text-3" />
        <div className="text-[15px] font-extrabold text-ink">비교함이 비어 있어요</div>
        <p className="max-w-[420px] text-[13px] leading-[1.7] text-text-3">
          매물 목록에서 <b className="text-ink">비교 담기</b>로 2~3개를 담으면 가격·면적·
          시세대비를 나란히 비교할 수 있어요.
        </p>
        <Link href="/listings" className="btn-primary btn-md">
          매물 목록으로
        </Link>
      </div>
    );
  }

  // 최저가 강조 — 담긴 매물이 모두 같은 유형일 때만(교차 비교 왜곡 방지)
  const sameType = rows.every((r) => r.listingType === rows[0].listingType);
  const priced = rows.map(primaryPriceKrw).filter((v): v is number => v !== null);
  const minPrice = sameType && priced.length >= 2 ? Math.min(...priced) : null;

  const colWidth = rows.length >= 3 ? "min-w-[180px]" : "min-w-[220px]";

  return (
    <div className="flex flex-col gap-4">
      {rows.length < MIN_COMPARE && (
        <div className="rise-in rounded-xl bg-warning-soft px-4 py-3 text-[13px] leading-[1.6] text-warning">
          비교하려면 매물이 <b>{MIN_COMPARE}개 이상</b> 필요해요.{" "}
          <Link href="/listings" className="font-bold underline">
            목록에서 더 담기
          </Link>
        </div>
      )}

      <div className="rise-in-1 overflow-x-auto">
        <table className="w-full border-collapse text-left align-top">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[92px] bg-bg px-1 py-2 text-[12px] font-bold text-text-3" />
              {rows.map((r) => (
                <th key={r.id} className={`px-2 py-2 ${colWidth}`}>
                  <div className="card card-pad-sm flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span
                          className={`rounded-[6px] px-1.5 py-[2px] text-[10px] font-extrabold ${
                            r.source === "owner"
                              ? "bg-primary-soft text-primary"
                              : "bg-[#fdf3e7] text-[#c07a3a]"
                          }`}
                        >
                          {SOURCE_LABEL[r.source]}
                        </span>
                        <span className="rounded-[6px] bg-[#f2f4f8] px-1.5 py-[2px] text-[10px] font-extrabold text-text-2">
                          {TYPE_LABEL[r.listingType]}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemove(r.id)}
                        aria-label={`${r.complexName} 비교에서 빼기`}
                        className="shrink-0 text-text-3 hover:text-danger"
                      >
                        <Icon name="x" size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                    <Link
                      href={`/listings/${r.id}`}
                      className="text-[15px] font-extrabold leading-[1.35] text-ink hover:text-primary"
                    >
                      {r.complexName}
                    </Link>
                    <Link
                      href={`/listings/${r.id}`}
                      className="w-fit text-[12px] font-bold text-primary"
                    >
                      상세 보기 →
                    </Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[13px]">
            <Section label="가격">
              {rows.map((r) => {
                const p = primaryPriceKrw(r);
                const isMin = minPrice !== null && p === minPrice;
                return (
                  <Cell key={r.id}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[15px] font-extrabold text-primary">
                        {priceLine(r)}
                      </span>
                      {isMin && (
                        <span className="rounded-[5px] bg-primary-soft px-1.5 py-[1px] text-[10px] font-extrabold text-primary">
                          최저가
                        </span>
                      )}
                    </div>
                  </Cell>
                );
              })}
            </Section>

            <Section label="면적">
              {rows.map((r) => (
                <Cell key={r.id}>
                  {r.areaM2 !== null ? (
                    <span>
                      <b className="text-ink">{r.areaM2}㎡</b>
                      <span className="text-text-3"> · {pyeong(r.areaM2)}평</span>
                    </span>
                  ) : (
                    <Dash />
                  )}
                </Cell>
              ))}
            </Section>

            <Section label="층">
              {rows.map((r) => (
                <Cell key={r.id}>
                  {r.floor !== null ? <b className="text-ink">{r.floor}층</b> : <Dash />}
                </Cell>
              ))}
            </Section>

            <Section label="방향">
              {rows.map((r) => (
                <Cell key={r.id}>
                  {/* 등록 데이터에 방향 정보가 없어 미표기 */}
                  <Dash />
                </Cell>
              ))}
            </Section>

            <Section label="시세대비">
              {rows.map((r) => (
                <Cell key={r.id}>
                  {r.marketDeltaPct === null ? (
                    <span className="text-text-3">정보 없음</span>
                  ) : r.marketDeltaPct <= -3 ? (
                    <span className="delta-down">시세 대비 {r.marketDeltaPct}%</span>
                  ) : r.marketDeltaPct >= 3 ? (
                    <span className="delta-up">시세 대비 +{r.marketDeltaPct}%</span>
                  ) : (
                    <span className="delta-flat">시세 수준</span>
                  )}
                </Cell>
              ))}
            </Section>

            <Section label="등록일 / 신선도">
              {rows.map((r) => {
                const stale = isStale(r);
                return (
                  <Cell key={r.id}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-ink">{formatDate(r.refreshedAt ?? r.createdAt)}</span>
                      {stale ? (
                        <span
                          className="rounded-[5px] px-1.5 py-[1px] text-[10px] font-extrabold"
                          style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
                        >
                          확인 필요
                        </span>
                      ) : (
                        <span className="rounded-[5px] bg-success-soft px-1.5 py-[1px] text-[10px] font-extrabold text-success">
                          최신
                        </span>
                      )}
                    </div>
                  </Cell>
                );
              })}
            </Section>

            <Section label="위치">
              {rows.map((r) => (
                <Cell key={r.id}>
                  {r.regionName ? <span className="text-ink">{r.regionName}</span> : <Dash />}
                </Cell>
              ))}
            </Section>

            <Section label="등록자">
              {rows.map((r) => (
                <Cell key={r.id}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-text-2">{SOURCE_LABEL[r.source]}</span>
                    {r.ownerVerified && (
                      <span className="rounded-[5px] bg-success-soft px-1.5 py-[1px] text-[10px] font-extrabold text-success">
                        소유확인
                      </span>
                    )}
                  </div>
                </Cell>
              ))}
            </Section>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-[1.7] text-text-3">
        시세대비는 같은 단지·면적대의 국토부 실거래(매매) 중위가 대비 호가 변동률이며,
        데이터가 있는 매매 매물에 한해 표시돼요. 방향 등 일부 항목은 등록 정보에 없으면
        표시되지 않습니다.
      </p>
    </div>
  );
}

/** 행 라벨 + 값 셀들 (라벨 sticky) */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="border-t border-line">
      <th
        scope="row"
        className="sticky left-0 z-10 whitespace-nowrap bg-bg px-1 py-3 text-[12px] font-bold text-text-3 align-top"
      >
        {label}
      </th>
      {children}
    </tr>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="px-2 py-3 align-top text-text-2">{children}</td>;
}

function Dash() {
  return <span className="text-text-3">—</span>;
}
