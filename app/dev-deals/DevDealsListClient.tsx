"use client";

/* 개발물건 목록 + 필터 (2026-08-10 ISR 전환)
   예전엔 서버가 ?type/partner/region 을 읽어 listDeals(filter) 를 한 번 더
   질의했다 — 라우트가 영구 동적이 되고 DB 질의도 두 번 나갔다. 목록 상한
   (120건)이 이미 첫 질의(all)에 다 들어오므로, 두 번째 질의를 없애고 필터를
   여기서 메모리로 건다. 서버 렌더는 필터와 무관해져 ISR 한 벌이 재사용된다.

   /town/news 에서 배운 것: useSearchParams 로 읽으면 프리렌더 HTML 에 카드가
   사라진다(Suspense 폴백이 박힘). 그래서 SSR 은 항상 전체를 그리고, 필터는
   마운트 후 location.search 로 적용한다. 딥링크·뒤로가기는 popstate 로. */

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import {
  DEAL_TYPES,
  PARTNER_FIELDS,
  formatKrwEok,
  formatAreaM2,
  type DevDeal,
} from "@/lib/dev-deals/types";

const STATUS_LABEL: Record<string, string> = {
  open: "모집중",
  matched: "매칭 진행",
  closed: "마감",
};

function pillClass(active: boolean): string {
  return active
    ? "chip-active px-3.5 py-2 text-[13px] no-underline press"
    : "chip glass px-3.5 py-2 text-[13px] font-semibold text-text-2 no-underline press";
}

function statusStyle(status: string): CSSProperties {
  if (status === "open")
    return { background: "var(--primary-soft)", color: "var(--primary-strong)" };
  if (status === "matched")
    return { background: "var(--success-soft)", color: "var(--success)" };
  return { background: "rgba(0,0,0,.05)", color: "var(--text-2)" };
}

function SampleBadge() {
  return (
    <span
      className="chip chip-pad text-[10px]"
      style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
    >
      예시
    </span>
  );
}

function DealCard({ d }: { d: DevDeal }) {
  const stats: { label: string; value: string }[] = [];
  if (d.units && d.units > 0)
    stats.push({ label: "규모", value: `${d.units.toLocaleString()}세대` });
  const gfa = formatAreaM2(d.grossFloorAreaM2);
  if (gfa !== "—") stats.push({ label: "연면적", value: gfa });
  const land = formatAreaM2(d.landAreaM2);
  if (land !== "—") stats.push({ label: "부지면적", value: land });

  return (
    <article className="card tile flex flex-col gap-3 rounded-2xl p-[var(--pad-card)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-extrabold text-primary">
            {d.dealType}
          </span>
          {d.isVerified && (
            <span
              className="chip chip-pad text-[10px]"
              style={{ background: "var(--success-soft)", color: "var(--success)" }}
            >
              검증
            </span>
          )}
          {d.isSample && <SampleBadge />}
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold"
          style={statusStyle(d.status)}
        >
          {STATUS_LABEL[d.status] ?? d.status}
        </span>
      </div>

      <div>
        {d.isSample ? (
          <span className="line-clamp-2 block text-[15px] font-extrabold leading-[1.4] text-ink">
            {d.title}
          </span>
        ) : (
          <Link
            href={`/dev-deals/${d.id}`}
            className="line-clamp-2 text-[15px] font-extrabold leading-[1.4] text-ink no-underline"
          >
            {d.title}
          </Link>
        )}
        <div className="mt-1 text-[11px] text-text-3">
          {[d.region, d.address].filter(Boolean).join(" · ") || "지역 미정"}
        </div>
      </div>

      {d.summary && (
        <p className="line-clamp-2 text-[12px] leading-[1.6] text-text-2">{d.summary}</p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-primary-soft px-3 py-2.5">
          <div className="text-[10px]" style={{ color: "var(--primary-strong)" }}>
            총사업비
          </div>
          <div className="mt-0.5 text-[15px] font-extrabold text-primary">
            {formatKrwEok(d.totalCostKrw)}
          </div>
        </div>
        {stats.slice(0, 2).map((s) => (
          <div key={s.label} className="rounded-xl bg-bg px-3 py-2.5">
            <div className="text-[10px] text-text-3">{s.label}</div>
            <div className="mt-0.5 text-[14px] font-extrabold text-ink">{s.value}</div>
          </div>
        ))}
      </div>

      {d.neededPartners.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-bold text-text-3">필요 협력분야</div>
          <div className="flex flex-wrap gap-1">
            {d.neededPartners.map((p) => (
              <span key={p} className="chip-tag chip-pad text-[10px]">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0 text-[10px] leading-[1.5] text-text-3">
          {d.contactMasked && (
            <div className="truncate">
              담당 {d.contactName ? `${d.contactName} · ` : ""}
              {d.contactMasked}
            </div>
          )}
          <div>
            조회 {d.viewCount.toLocaleString()} · 문의 {d.inquiryCount.toLocaleString()}
          </div>
        </div>
        {d.isSample ? (
          <span className="chip shrink-0 bg-bg px-3 py-2 text-[11px] font-bold text-text-3">
            예시 카드 · 문의 불가
          </span>
        ) : (
          <Link
            href={`/dev-deals/${d.id}`}
            className="btn-primary btn-sm shrink-0 no-underline press"
          >
            참여 문의 ›
          </Link>
        )}
      </div>
    </article>
  );
}

type Filter = { type?: string; partner?: string; region?: string };

/** 얕은 URL 갱신 — 서버 왕복 없이 ?type/partner/region 만 바꾼다 */
function pushFilterUrl(next: Filter) {
  const url = new URL(window.location.href);
  const sp = url.searchParams;
  for (const k of ["type", "partner", "region"] as const) {
    const v = next[k];
    if (v) sp.set(k, v);
    else sp.delete(k);
  }
  window.history.pushState(null, "", url);
}

export function DevDealsListClient({
  all,
  regions,
  exampleDeal,
  loadFailed = false,
}: {
  all: DevDeal[];
  regions: string[];
  exampleDeal: DevDeal;
  /** 서버의 listDeals 가 던진 경우 — 빈 결과("아직 없어요")와 절대 같은 문장을
      쓰지 않는다. 실패는 목록 자리에서만 "못 불러왔다"고 말한다. */
  loadFailed?: boolean;
}) {
  /* SSR 은 필터 없이 전체를 그린다(크롤러 HTML 에 목록이 남게). 필터는 마운트
     후 location.search 로 적용하고 popstate 를 구독한다. */
  const [filter, setFilter] = useState<Filter>({});
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      const norm = (k: string, allowed: readonly string[] | null) => {
        const v = (p.get(k) ?? "").trim();
        if (!v) return undefined;
        if (allowed && !allowed.includes(v)) return undefined;
        return v;
      };
      setFilter({
        type: norm("type", DEAL_TYPES),
        partner: norm("partner", PARTNER_FIELDS),
        region: norm("region", regions),
      });
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions.join("|")]);

  const set = (key: keyof Filter, value: string | undefined) => {
    const next = { ...filter };
    if (value === undefined || next[key] === value) delete next[key];
    else next[key] = value;
    setFilter(next);
    pushFilterUrl(next);
  };

  const deals = all.filter(
    (d) =>
      (!filter.type || d.dealType === filter.type) &&
      (!filter.partner || d.neededPartners.includes(filter.partner)) &&
      (!filter.region || d.region === filter.region),
  );
  const filterActive = !!(filter.type || filter.partner || filter.region);

  return (
    <>
      {/* 상단 필터(유형) */}
      <div className="rise-in-1 mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => set("type", undefined)} className={pillClass(!filter.type)}>
              전체
            </button>
            {DEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("type", t)}
                className={pillClass(filter.type === t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex flex-wrap gap-1.5">
            <Link
              href="/dev-deals/partners"
              className="glass rounded-full px-3.5 py-2 text-[12px] font-bold text-text-1 no-underline press"
            >
              협력업체 디렉토리
            </Link>
            <Link
              href="/dev-deals/fees"
              className="glass rounded-full px-3.5 py-2 text-[12px] font-bold text-primary no-underline press"
            >
              수수료 안내
            </Link>
            <Link
              href="/dev-deals/new"
              style={{ color: "#fff" }}
              className="rounded-full bg-primary px-4 py-2 text-[12px] font-bold no-underline press"
            >
              개발물건 등록
            </Link>
          </div>
        </div>
        <div className="text-[12px] text-text-3">
          {loadFailed ? (
            <>등록 물건 수를 지금 불러오지 못했어요</>
          ) : (
          <>
          등록 물건 <strong className="text-ink">{all.length.toLocaleString()}건</strong>
          {all.filter((d) => d.status === "open").length > 0 && (
            <>
              {" · "}
              모집중{" "}
              <strong style={{ color: "var(--primary-strong)" }}>
                {all.filter((d) => d.status === "open").length.toLocaleString()}건
              </strong>
            </>
          )}
          {filterActive && (
            <>
              {" · "}
              현재 조건 <strong className="text-ink">{deals.length.toLocaleString()}건</strong>
            </>
          )}
          </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rise-in-2 flex flex-col gap-4">
          {/* 보조 필터: 협력분야 · 지역 */}
          <div className="flex flex-col gap-2.5">
            <div>
              <div className="mb-1 text-[10px] font-bold text-text-3">필요 협력분야</div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => set("partner", undefined)} className={pillClass(!filter.partner)}>
                  전체
                </button>
                {PARTNER_FIELDS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set("partner", p)}
                    className={pillClass(filter.partner === p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {regions.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-bold text-text-3">지역</div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => set("region", undefined)} className={pillClass(!filter.region)}>
                    전체
                  </button>
                  {regions.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => set("region", r)}
                      className={pillClass(filter.region === r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-extrabold text-ink">등록된 개발물건</h2>
            <span className="text-[11px] text-text-3">{deals.length.toLocaleString()}건</span>
          </div>

          {loadFailed ? (
            /* 실패는 목록 자리에서만 말한다 — 예시 카드도 그리지 않는다.
               DB 원문(cause)은 싣지 않는다(에러 노출 마감 정책). */
            <div className="card rounded-2xl p-[var(--pad-card)] text-center">
              <div className="text-[14px] font-extrabold text-ink">
                개발물건 목록을 지금 불러오지 못했어요
              </div>
              <p className="mx-auto mt-1 max-w-md text-[12px] leading-[1.6] text-text-3">
                등록된 개발물건이 0건인 게 아니라 조회 자체가 실패했습니다. 잠시 후
                새로고침해 주세요.
              </p>
            </div>
          ) : deals.length === 0 ? (
            <div className="flex flex-col gap-3">
              <div className="card rounded-2xl p-[var(--pad-card)] text-center">
                <div className="text-[14px] font-extrabold text-ink">
                  조건에 맞는 개발물건이 아직 없어요
                </div>
                <p className="mx-auto mt-1 max-w-md text-[12px] leading-[1.6] text-text-3">
                  아래는 등록 시 노출되는 화면 <b>예시</b>예요. 개발물건을 등록하면
                  시공·설계·신탁·PF 등 협력업체의 참여 문의를 받아볼 수 있어요.
                </p>
                <Link
                  href="/dev-deals/new"
                  className="btn-primary btn-md mt-3 inline-flex no-underline press"
                >
                  개발물건 등록
                </Link>
              </div>
              <DealCard d={exampleDeal} />
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {deals.map((d) => (
                <DealCard key={d.id} d={d} />
              ))}
            </div>
          )}
        </div>

        {/* 사이드 컬럼은 필터와 무관하지만, 목록과 한 그리드라 함께 둔다 */}
        <DevDealsSidebar />
      </div>
    </>
  );
}

/* 사이드 카드 — 정적. children 으로 넘기지 않고 여기 둔 이유: 원래 page.tsx 의
   aside 마크업을 그대로 옮겨 2단 그리드 정렬을 보존한다. */
const MATCH_STEPS: { title: string; desc: string }[] = [
  { title: "개발물건 등록", desc: "시행사·부동산사업자가 정비사업·신축·부지 정보를 올려요." },
  { title: "협력업체 매칭", desc: "시공·설계·신탁·PF·마케팅 등 필요한 협력분야로 연결돼요." },
  { title: "직접 협의", desc: "매칭된 당사자끼리 조건을 협의해요. 정산은 당사자 간에." },
];

function DevDealsSidebar() {
  return (
    <aside className="rise-in-3 flex flex-col gap-3">
      <div className="card rounded-2xl p-[var(--pad-card)]">
        <div className="text-[14px] font-extrabold text-ink">이렇게 매칭돼요</div>
        <ol className="mt-3 flex flex-col gap-3">
          {MATCH_STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-extrabold"
                style={{ color: "var(--primary-strong)" }}
              >
                {i + 1}
              </span>
              <div>
                <div className="text-[13px] font-bold text-ink">{s.title}</div>
                <div className="text-[11px] leading-[1.6] text-text-3">{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="card rounded-2xl p-[var(--pad-card)]">
        <div className="text-[14px] font-extrabold text-ink">중개 수수료</div>
        <p className="mt-1.5 text-[12px] leading-[1.6] text-text-2">
          매칭이 성사되면 <strong className="text-ink">사업규모(총사업비)</strong>에 따라 중개
          수수료가 부과돼요. <strong className="text-ink">내집나우는 결제·정산을 진행하지 않으며</strong>{" "}
          실제 정산은 당사자 간에 이뤄집니다.
        </p>
        <Link
          href="/dev-deals/fees"
          className="mt-3 inline-flex text-[12px] font-bold text-primary no-underline press"
        >
          수수료 기준표 보기 ›
        </Link>
      </div>

      <div className="card rounded-2xl p-[var(--pad-card)]">
        <div className="text-[14px] font-extrabold text-ink">협력업체를 찾으시나요?</div>
        <p className="mt-1.5 text-[12px] leading-[1.6] text-text-2">
          검증된 시공·설계·신탁·PF·마케팅·감리 협력업체를 디렉토리에서 확인하고, 우리 회사를
          등록해 매칭 기회를 받으세요.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Link href="/dev-deals/partners" className="btn-outline btn-md no-underline press">
            협력업체 디렉토리
          </Link>
          <Link href="/dev-deals/new" className="btn-primary btn-md no-underline press">
            개발물건 등록하기
          </Link>
        </div>
      </div>
    </aside>
  );
}

export default DevDealsListClient;
