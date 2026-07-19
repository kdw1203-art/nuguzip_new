"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";

/** 17d — 쿼터 소진 업그레이드 시트 (A/B 두 소구 변형을 탭으로 모두 구현)
 *  + 18b — 결제 시트·결제수단 관리 카드 UI를 하단 "결제 수단" 섹션으로 반영
 *  실결제 미연결 — 결제 버튼은 /subscription 링크, 카드 UI는 시안 재현 */

type Variant = "A" | "B";

/* 17a 무료 AI 쿼터 확정안 — 시안 수치 그대로 */
const QUOTA_PLANS = [
  { name: "무료", price: "0원", quota: "AI 분석 월 1회 · 상세 리포트 0", accent: false },
  { name: "플러스", price: "2,900원", quota: "월 10회 · 리포트 1", accent: false },
  { name: "프로", price: "19,000원", quota: "월 30회 · 리포트 3", accent: true },
] as const;

function SheetFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[390px] flex-col gap-2.5 rounded-t-3xl rounded-b-[20px] border border-line bg-surface p-5 shadow-[0_-8px_32px_rgba(16,28,54,0.14)]">
      <div className="mx-auto h-1 w-8 rounded-full bg-line-strong" />
      {children}
    </div>
  );
}

/* A안 · 가치 소구 */
function SheetA() {
  return (
    <SheetFrame>
      <div className="text-[15px] font-extrabold leading-snug text-ink">
        이번 달 무료 분석을 다 썼어요
      </div>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-bg p-3.5 text-[11px] text-text-1">
        <div>✓ 공작 84A 적정가 + 신뢰구간</div>
        <div>✓ 내 노트 3건 반영한 협상 포인트</div>
        <div>✓ 안전 진단 A~C 등급</div>
      </div>
      <Link
        href="/subscription"
        className="btn-primary btn-cta rounded-xl p-3.5 text-center text-[13px]"
      >
        플러스 시작 — 월 2,900원
      </Link>
      <div className="text-center text-[11px] text-text-3">
        다음 달 1일 무료 1회 충전 · 언제든 해지
      </div>
    </SheetFrame>
  );
}

/* B안 · 진행 소구 */
function SheetB() {
  return (
    <SheetFrame>
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "conic-gradient(#1d4fd8 0 66%, #eef1f6 66% 100%)",
          }}
        >
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-surface text-[10px] font-extrabold text-ink">
            2/3
          </div>
        </div>
        <div className="text-sm font-extrabold leading-snug text-ink">
          공작 84A 판단까지
          <br />
          분석 1개 남았어요
        </div>
      </div>
      <div className="text-[11px] text-text-2">
        기록 ✓ · 분석 ✓ · <b className="text-primary">비교 남음</b> — 지금
        멈추면 다음 달에 다시
      </div>
      <div className="flex gap-1.5">
        <Link
          href="/subscription"
          className="btn-primary flex-1 rounded-xl p-3 text-center text-xs"
        >
          이어서 분석 — 플러스
        </Link>
        <button
          type="button"
          className="flex-[0.7] rounded-xl bg-bg p-3 text-center text-xs font-bold text-text-2"
        >
          다음에
        </button>
      </div>
      <div className="text-center text-[11px] text-text-3">
        단건 결제도 가능 — AI 리포트 1회 4,900원
      </div>
    </SheetFrame>
  );
}

export default function UpgradePage() {
  const [variant, setVariant] = useState<Variant>("A");

  return (
    <PageShell title="업그레이드" breadcrumb="분석 › 쿼터 소진">
      <div className="flex flex-col gap-8">
        {/* ── 업그레이드 시트 A/B ── */}
        <section className="rise-in flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {(
              [
                { key: "A", label: "A안 · 가치 소구" },
                { key: "B", label: "B안 · 진행 소구" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setVariant(t.key)}
                className={`chip px-4 py-2 text-xs ${
                  variant === t.key
                    ? "chip-active"
                    : "border border-line-strong bg-surface text-text-2"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,420px)_1fr]">
            <div>
              <div className="mb-2 text-xs font-extrabold text-text-3">
                {variant === "A"
                  ? "A안 · 가치 소구 (이 분석이 주는 것)"
                  : "B안 · 진행 소구 (하던 일을 끝내기)"}
              </div>
              {variant === "A" ? <SheetA /> : <SheetB />}
            </div>

            <div className="flex flex-col gap-4">
              {/* 실험 설계 노트 */}
              <div className="card p-4 text-[11px] leading-[1.8] text-text-2">
                실험 설계: 노출 50/50 · 측정 = 시트→결제 전환율, 7일 재방문율
                · &quot;다음에&quot;를 어렵게 만들지 않기(다크패턴 금지) · 단건
                결제 병기는 B안만 — 구독 잠식 여부 관찰
              </div>

              {/* 쿼터 확정안 — 시안 수치 그대로 */}
              <div className="card flex flex-col gap-1.5 p-4">
                <div className="text-[13px] font-extrabold text-ink">
                  플랜별 AI 쿼터
                </div>
                {QUOTA_PLANS.map((p) => (
                  <div
                    key={p.name}
                    className="flex justify-between rounded-lg bg-bg px-3 py-2 text-[11px]"
                  >
                    <span className="font-bold text-text-1">
                      {p.name}
                      {p.price !== "0원" && ` ${p.price}`}
                    </span>
                    <b className={p.accent ? "text-primary" : "text-ink"}>
                      {p.quota}
                    </b>
                  </div>
                ))}
                <div className="text-[10px] text-text-3">
                  + 첫 노트 작성 보상으로 1회 추가 · 쿼터는 엔타이틀먼트로 서버
                  관리 ·{" "}
                  <Link
                    href="/subscription"
                    className="font-bold text-primary underline underline-offset-2"
                  >
                    전체 플랜 비교
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 결제 수단 (18b) ── */}
        <section className="rise-in-2 flex flex-col gap-4">
          <h2 className="text-lg font-extrabold text-ink">결제 수단</h2>
          <div className="rounded-xl bg-primary-soft px-4 py-3 text-[11px] leading-relaxed text-text-1">
            <b className="text-primary">안내</b> — 실결제는 아직 연결되지
            않았습니다. 구 코드베이스의 결제 API(
            <code className="font-mono">/api/payments/tosspay</code>,{" "}
            <code className="font-mono">/api/payments/kakaopay</code>,{" "}
            <code className="font-mono">/api/billing</code>)가 존재하며, 아래
            카드 UI는 연동 전 시안 재현입니다.
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,390px)_minmax(0,390px)_1fr]">
            {/* 단건 결제 시트 */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-extrabold text-text-3">
                단건 결제 시트 (리포트 구매)
              </span>
              <SheetFrame>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-extrabold text-ink">
                    공작아파트 심층 분석
                  </span>
                  <span className="text-[15px] font-extrabold tabular-nums text-ink">
                    9,900원
                  </span>
                </div>
                <div className="text-[11px] text-text-3">
                  VAT 포함 · 판매자 이OO(인증) · PDF · 구매 후 보관함에서
                  재다운로드
                </div>
                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between rounded-xl border-[1.5px] border-primary px-3.5 py-2.5">
                    <span className="font-bold text-ink">
                      카드 ***4512 (기본)
                    </span>
                    <span className="font-extrabold text-primary">✓</span>
                  </div>
                  <button
                    type="button"
                    className="flex justify-between rounded-xl border border-line-strong px-3.5 py-2.5 text-text-2"
                  >
                    <span>카카오페이 · 네이버페이 · 토스페이</span>
                    <span>›</span>
                  </button>
                </div>
                <div className="rounded-xl bg-bg px-3.5 py-2.5 text-[10px] leading-[1.7] text-text-2">
                  <b className="text-text-1">결제 전 확인</b> — 다운로드
                  후에는 청약철회가 제한됩니다. 현금영수증: 소득공제
                  010-****-4482 <b className="text-primary">변경</b>
                </div>
                <button
                  type="button"
                  className="btn-primary btn-cta rounded-[13px] p-3.5 text-sm"
                >
                  9,900원 결제
                </button>
              </SheetFrame>
            </div>

            {/* 결제수단 관리 */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-extrabold text-text-3">
                결제수단 관리
              </span>
              <div className="flex flex-col gap-2.5 rounded-3xl border border-line bg-bg p-5">
                <div className="card flex items-center justify-between p-3.5">
                  <div>
                    <div className="text-xs font-extrabold text-ink">
                      신한카드 ***4512
                    </div>
                    <div className="text-[10px] text-text-3">
                      기본 · 구독 결제에 사용 중
                    </div>
                  </div>
                  <button type="button" className="text-[10px] text-text-3">
                    삭제
                  </button>
                </div>
                <div className="card flex items-center justify-between p-3.5">
                  <div>
                    <div className="text-xs font-extrabold text-ink">
                      카카오페이
                    </div>
                    <div className="text-[10px] text-text-3">단건 결제용</div>
                  </div>
                  <button
                    type="button"
                    className="text-[10px] font-bold text-primary"
                  >
                    기본으로
                  </button>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border-[1.5px] border-dashed border-[#c9d4e5] p-3 text-center text-xs font-bold text-primary"
                >
                  + 결제수단 추가
                </button>
                <div className="ai-panel px-4 py-3.5 text-[11px] leading-[1.7]">
                  <b className="text-ai-accent">정기결제 고지</b> — 프로 월
                  19,000원 · 다음 결제 8/2 · 결제 <b>D-7 사전 알림</b> 발송 ·
                  카드 만료 시 결제일 전 미리 안내
                </div>
                <div className="text-center text-[10px] text-text-3">
                  카드 정보는 PG사에 토큰으로만 저장 — 누구집은 카드번호를
                  보관하지 않아요
                </div>
              </div>
            </div>

            {/* 결제 실패 UX */}
            <div className="card flex flex-col gap-1.5 p-4 text-[11px] text-text-1">
              <div className="text-xs font-extrabold text-ink">
                결제 실패 UX
              </div>
              <div className="rounded-lg bg-bg px-2.5 py-2">
                실패 사유를 그대로 표시 (한도·정지·잔액) — &quot;오류가
                발생했습니다&quot; 금지
              </div>
              <div className="rounded-lg bg-bg px-2.5 py-2">
                구독 실패 = 3일 유예 배너 + 다른 수단으로 재시도 버튼
              </div>
              <div className="rounded-lg bg-bg px-2.5 py-2">
                단건 실패 = 장바구니 상태 유지, 재진입 시 이어서
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
