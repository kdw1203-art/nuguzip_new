import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";

/** 17b — 내 구매 리포트 보관함 · 리뷰 신뢰장치 */

type PurchaseAction = { label: string; primary: boolean; accent?: boolean };

const PURCHASES: {
  title: string;
  badge: { label: string; tone: "update" | "done" };
  meta: string;
  metaCertified?: boolean;
  actions: PurchaseAction[];
}[] = [
  {
    title: "공작아파트 심층 분석",
    badge: { label: "업데이트 v2.4", tone: "update" as const },
    meta: "누구집 AI · 구매 7/12 · v2.3 → 2.4 무료 업데이트",
    actions: [
      { label: "새 버전 받기", primary: true },
      { label: "이력 보기", primary: false },
    ],
  },
  {
    title: "전세사기 방어 실전 가이드",
    badge: { label: "구매확정", tone: "done" as const },
    meta: "이OO 변호사 인증 · 구매 6/28 · PDF 재다운로드 가능",
    metaCertified: true,
    actions: [
      { label: "다시 받기", primary: false },
      { label: "리뷰 쓰기", primary: false, accent: true },
    ],
  },
];

const REVIEW_RULES = [
  "구매확정 후에만 작성",
  "어떤 버전 구매인지 자동 표기",
  "판매자 답변 1회",
  "환불된 주문의 리뷰는 “환불됨” 라벨 유지(삭제 안 함)",
  "별점만 리뷰 금지(10자+)",
];

export default function LibraryPage() {
  return (
    <PageShell title="구매 리포트 보관함" breadcrumb="마이 › 구매 보관함">
      <div className="grid items-start gap-6 md:grid-cols-[400px_1fr]">
        {/* ── 보관함 (모바일 프레임 시안 17b 좌측) ── */}
        <section className="rise-in flex flex-col gap-3">
          <div className="text-[15px] font-extrabold text-ink">
            구매한 리포트 <span className="text-primary">3</span>
          </div>

          {PURCHASES.map((p) => (
            <div key={p.title} className="card flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-extrabold text-ink">
                  {p.title}
                </span>
                {p.badge.tone === "update" ? (
                  <span className="shrink-0 rounded-md bg-primary-soft px-2 py-[3px] text-[10px] font-extrabold text-primary">
                    {p.badge.label}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-md bg-[#e7f5ee] px-2 py-[3px] text-[10px] font-extrabold text-[#1a7f4e]">
                    {p.badge.label}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-text-3">
                {p.metaCertified ? (
                  <>
                    이OO 변호사{" "}
                    <span className="font-bold text-primary">인증</span> · 구매
                    6/28 · PDF 재다운로드 가능
                  </>
                ) : (
                  p.meta
                )}
              </div>
              <div className="flex gap-2">
                {p.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-bold ${
                      a.primary
                        ? "btn-primary"
                        : a.accent
                          ? "border border-line-strong bg-surface text-primary"
                          : "border border-line-strong bg-surface text-text-1"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* 자동 환불 안내 */}
          <div className="rounded-xl bg-[#fdf3dd] px-4 py-3 text-[11px] font-bold text-[#946200]">
            주간 시세 브리핑 · 생성 실패 → 전액 자동 환불 완료 (7/15)
          </div>
          <div className="text-center text-[11px] text-text-3">
            문제가 있나요? 재생성·환불 요청은 주문 상세에서
          </div>
          <div className="text-center text-[11px] text-text-3">
            새 리포트가 필요하다면{" "}
            <Link
              href="/subscription"
              className="font-bold text-primary underline underline-offset-2"
            >
              구독 플랜 보기
            </Link>
          </div>
        </section>

        {/* ── 리뷰 신뢰장치 (17b 우측) ── */}
        <section className="rise-in-2 card flex flex-col gap-3 p-5">
          <div className="text-[14px] font-extrabold text-ink">
            리뷰 신뢰장치 — 구매 확정자만 작성
          </div>

          <div className="flex flex-col gap-2 rounded-2xl bg-bg p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-ink">
                ★ 4.5{" "}
                <span className="font-medium text-text-3">
                  리뷰 128 · 구매자만
                </span>
              </span>
              <span className="text-[11px] text-text-3">도움됨순 ▾</span>
            </div>

            {/* 리뷰 카드: 구매 확정 배지 + 버전 표기 + 판매자 답변 */}
            <div className="card flex flex-col gap-2 rounded-xl p-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <b className="text-ink">★★★★☆</b>
                <span className="font-bold text-text-1">임장러버</span>
                <span className="rounded bg-[#e7f5ee] px-[6px] py-[2px] text-[10px] font-extrabold text-[#1a7f4e]">
                  구매 확정
                </span>
                <span className="text-[10px] text-text-3">v2.3 구매</span>
              </div>
              <div className="text-[11px] leading-relaxed text-text-1">
                표본 수와 결측 표시가 있어서 신뢰가 갔어요. 다만 월세 흐름은
                얕은 편.
              </div>
              <div className="rounded-lg bg-bg px-3 py-2 text-[11px] text-text-1">
                <b className="text-primary">판매자 답변</b> · 월세 섹션은
                v2.4에서 보강했습니다 — 무료 업데이트로 받아보세요.
              </div>
            </div>
          </div>

          <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-text-3">
            <li className="font-extrabold text-text-2">규칙</li>
            {REVIEW_RULES.map((r) => (
              <li key={r} className="flex gap-1.5">
                <span className="text-line-strong">·</span>
                {r}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
