"use client";

import { useState } from "react";
import { AIPanel } from "@/app/components/AIPanel";
import { PageShell } from "@/app/components/PageShell";

/** 17c — 판매자 온보딩 위저드 (검증 → 첫 상품 → 미리보기 → 가격·게시)
 *  + 18a — 판매자 정산 계좌 등록 · 1원 인증 (1단계 검증에 통합)
 *  실제 제출은 미연결 — 마지막 스텝의 "심사 신청"은 준비 중 안내만 표시 */

const STEPS = ["검증", "첫 상품", "미리보기", "가격·게시"] as const;

const SELLER_TYPES = [
  {
    key: "personal",
    name: "개인 (사업자 없음)",
    docs: "신분증 실명 + 계좌",
    tax: "사업소득 3.3% 원천징수",
  },
  {
    key: "biz",
    name: "개인사업자",
    docs: "사업자등록증 + 사업용 계좌",
    tax: "수수료 세금계산서 발행",
  },
  {
    key: "corp",
    name: "법인",
    docs: "등기부 + 법인 계좌 (대표 개인계좌 불가)",
    tax: "수수료 세금계산서 발행",
  },
] as const;

/* 16a 수수료 체계 — 시안 수치 그대로 */
const FEE_TIERS = [
  { type: "일반 크리에이터", fee: "12%", accent: false, badge: null },
  { type: "본인·자격 인증 판매자", fee: "10%", accent: false, badge: "인증" },
  { type: "전문가 판매자 구독 회원", fee: "7%", accent: true, badge: "✦ 전문가" },
  { type: "초기 입점 프로모션", fee: "5% · 90일", accent: false, badge: null, promo: true },
] as const;

/* 발행 게이트 검사 (16c) — 7/11 충족 상태 */
const GATE_CHECKS = [
  { label: "출처", ok: true },
  { label: "기준일", ok: true },
  { label: "표본 수", ok: true },
  { label: "전세가율", ok: true },
  { label: "구분 표기", ok: true },
  { label: "후보 비교", ok: true },
  { label: "PDF", ok: true },
  { label: "추이 그래프", ok: false },
  { label: "결측 표시", ok: false },
  { label: "체크리스트", ok: false },
  { label: "버전 표기", ok: false },
] as const;

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <span key={label} className="flex items-center gap-1.5">
            {i > 0 && <span className="h-[1.5px] w-4 bg-line-strong" />}
            <span
              className={`flex items-center gap-1 ${
                done
                  ? "font-bold text-[#1a7f4e]"
                  : active
                    ? "font-extrabold text-primary"
                    : "text-text-3"
              }`}
            >
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] ${
                  done
                    ? "bg-[#1a7f4e] text-white"
                    : active
                      ? "bg-primary text-white"
                      : "bg-line-strong text-text-2"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/* ── 1단계 · 검증 (12n 실명 + 18a 계좌·1원 인증) ── */
function StepVerify({
  sellerType,
  onSelectType,
  code,
  onCode,
}: {
  sellerType: string;
  onSelectType: (k: string) => void;
  code: string[];
  onCode: (i: number, v: string) => void;
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col gap-4">
        {/* 판매자 유형 선택 */}
        <div className="card flex flex-col gap-2 p-4">
          <div className="text-[13px] font-extrabold text-ink">판매자 유형</div>
          <div className="flex flex-wrap gap-1.5">
            {SELLER_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onSelectType(t.key)}
                className={`chip px-3.5 py-2 text-xs ${
                  sellerType === t.key
                    ? "chip-active"
                    : "border border-line-strong bg-surface text-text-2"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          {/* 유형별 세금·증빙 처리 (18a) */}
          <div className="mt-1 flex flex-col text-[11px]">
            <div className="flex rounded-t-lg bg-bg px-3 py-2 font-bold text-text-3">
              <span className="flex-1">유형</span>
              <span className="flex-[1.4]">필요 서류</span>
              <span className="flex-[1.2]">처리</span>
            </div>
            {SELLER_TYPES.map((t, i) => (
              <div
                key={t.key}
                className={`flex px-3 py-2 text-text-1 ${
                  i < SELLER_TYPES.length - 1 ? "border-b border-line" : ""
                } ${sellerType === t.key ? "bg-primary-soft/50" : ""}`}
              >
                <span className="flex-1 font-bold">{t.name}</span>
                <span className="flex-[1.4]">{t.docs}</span>
                <span className="flex-[1.2]">{t.tax}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-text-3">
            연 매출 기준 초과 시 사업자 전환 안내 배너가 표시돼요
          </div>
        </div>
      </div>

      {/* 정산 계좌 등록 (18a) */}
      <div className="card flex flex-col gap-3 p-4">
        <div className="text-[13px] font-extrabold text-ink">정산 계좌 등록</div>
        <div className="text-[11px] text-text-3">
          본인 명의 계좌만 등록 가능 — 판매자 검증 실명과 예금주가 자동
          대조돼요
        </div>
        <div className="flex flex-col gap-1.5 text-xs">
          <button
            type="button"
            className="flex justify-between rounded-[10px] border border-line-strong px-3.5 py-2.5 font-bold text-ink"
          >
            <span>OO은행</span>
            <span className="font-normal text-text-3">변경 ▾</span>
          </button>
          <div className="rounded-[10px] border-[1.5px] border-primary px-3.5 py-2.5 font-bold tabular-nums text-ink shadow-[0_0_0_3px_rgba(29,79,216,0.12)]">
            110-•••-455102
          </div>
          <div className="flex justify-between rounded-[10px] border border-[#1a7f4e]/40 px-3.5 py-2.5 text-ink">
            <span>예금주 김OO</span>
            <span className="font-extrabold text-[#1a7f4e]">실명 일치 ✓</span>
          </div>
        </div>

        {/* 1원 인증 */}
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-bg p-3.5">
          <div className="text-xs font-extrabold text-ink">1원 인증</div>
          <div className="text-[11px] text-text-2">
            방금 계좌로 <b className="text-primary">1원</b>을 보냈어요.
            입금자명 4자리를 입력하세요 (10분 내)
          </div>
          <div className="flex items-center gap-1.5">
            {code.map((c, i) => (
              <input
                key={i}
                value={c}
                onChange={(e) => onCode(i, e.target.value.slice(-1))}
                maxLength={1}
                aria-label={`입금자명 ${i + 1}번째 글자`}
                className={`h-10 w-9 rounded-[9px] border bg-surface text-center text-[15px] font-extrabold text-ink outline-none ${
                  c ? "border-[1.5px] border-primary" : "border-line-strong"
                }`}
              />
            ))}
            <span className="flex-1" />
            <button type="button" className="text-[10px] text-text-3">
              재전송 (2/3)
            </button>
          </div>
        </div>
        <div className="text-center text-[10px] text-text-3">
          계좌 변경 시 재인증 + 기존 계좌로 알림 · 변경 후 첫 정산은 48시간
          보류(탈취 방어)
        </div>
      </div>
    </div>
  );
}

/* ── 2단계 · 첫 상품 ── */
function StepProduct() {
  const passed = GATE_CHECKS.filter((g) => g.ok).length;
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="text-[13px] font-extrabold text-ink">
        2단계 · 첫 리포트 정보
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        <input
          defaultValue="관양동 구축 리모델링 실전 가이드"
          aria-label="리포트 제목"
          className="rounded-[10px] border border-line-strong px-3.5 py-2.5 font-bold text-ink outline-none focus:border-primary"
        />
        <input
          placeholder="목차 입력 (필수) — 최소 5개 항목…"
          aria-label="목차"
          className="rounded-[10px] border border-line-strong px-3.5 py-2.5 text-ink outline-none placeholder:text-text-3 focus:border-primary"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            className="flex-1 rounded-[10px] border-[1.5px] border-dashed border-[#c9d4e5] p-3 text-[11px] font-bold text-primary"
          >
            + PDF 업로드
          </button>
          <button
            type="button"
            className="flex-1 rounded-[10px] border-[1.5px] border-dashed border-[#c9d4e5] p-3 text-[11px] font-bold text-primary"
          >
            + 미리보기 3p 지정
          </button>
        </div>
      </div>
      {/* 발행 게이트 검사 */}
      <div className="flex flex-col gap-1.5 rounded-xl bg-bg px-3.5 py-3">
        <div className="text-[11px] font-extrabold text-ink">
          발행 게이트 검사 (11요소) — {passed}/{GATE_CHECKS.length} 충족
        </div>
        <div className="flex flex-wrap gap-1 text-[10px]">
          {GATE_CHECKS.map((g) => (
            <span
              key={g.label}
              className={`rounded-[5px] px-1.5 py-[3px] font-bold ${
                g.ok
                  ? "bg-[#e7f5ee] text-[#1a7f4e]"
                  : "bg-danger-soft text-danger"
              }`}
            >
              {g.ok ? "✓" : "✕"} {g.label}
            </span>
          ))}
        </div>
        <div className="text-[10px] text-text-3">
          11요소 미충족 시 유료 등록 불가 · 미충족 항목은 인라인 안내
        </div>
      </div>
    </div>
  );
}

/* ── 3단계 · 미리보기 ── */
function StepPreview() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,390px)_1fr]">
      {/* 구매자에게 보이는 상세 미리보기 */}
      <div className="card mx-auto w-full max-w-[390px] flex flex-col gap-2.5 rounded-3xl bg-bg p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold text-ink">
            관양동 구축 리모델링 실전 가이드
          </span>
          <span className="rounded-md bg-primary px-2 py-[3px] text-[10px] font-extrabold text-white">
            유료 리포트
          </span>
        </div>
        <div className="card flex flex-col gap-1.5 p-3.5 text-[11px] text-text-1">
          <div className="flex justify-between">
            <span className="text-text-3">출처</span>
            <b>국토부 실거래 · KB시세</b>
          </div>
          <div className="flex justify-between">
            <span className="text-text-3">기준일 · 표본</span>
            <b>2026.7.19 · 거래 24건</b>
          </div>
          <div className="flex justify-between">
            <span className="text-text-3">미리보기</span>
            <b>3페이지 무료 공개</b>
          </div>
        </div>
        <div className="flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef] text-[11px] font-bold text-[#33415e]">
          미리보기 3p 썸네일 영역
        </div>
        <div className="rounded-xl bg-surface px-3.5 py-2.5 text-[10px] leading-relaxed text-text-2">
          <b className="text-text-1">법정 표기</b> — 상품명 · 제작자 · 파일
          형식 · 이용조건 · 청약철회·환불 조건은 결제 버튼 위 고정 섹션으로
          항상 노출 (접힘 금지)
        </div>
      </div>

      <div className="card flex flex-col gap-2 p-4 text-[11px] leading-relaxed text-text-2">
        <div className="text-[13px] font-extrabold text-ink">
          미리보기 확인 사항
        </div>
        <div className="rounded-lg bg-bg px-3 py-2">
          미리보기·목차는 외부 판매자 필수 — 구매 전 판단 근거를 제공해요
        </div>
        <div className="rounded-lg bg-bg px-3 py-2">
          결측 데이터는 감추지 말고 &quot;결측 표시&quot;로 노출 — 신뢰장치
        </div>
        <div className="rounded-lg bg-bg px-3 py-2">
          버전·생성일 표기는 구매 후 무료 업데이트 알림의 기준이 돼요
        </div>
      </div>
    </div>
  );
}

/* ── 4단계 · 가격·게시 ── */
function StepPrice({
  agreed,
  onAgree,
}: {
  agreed: boolean;
  onAgree: (v: boolean) => void;
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col gap-4">
        {/* 가격 미리 계산 */}
        <div className="card flex flex-col gap-1.5 p-4">
          <div className="text-[13px] font-extrabold text-ink">
            가격 미리 계산
          </div>
          <div className="flex justify-between rounded-lg bg-bg px-3 py-2 text-[11px] text-text-1">
            <span>판매가</span>
            <b className="tabular-nums">9,900원</b>
          </div>
          <div className="flex justify-between rounded-lg bg-bg px-3 py-2 text-[11px] text-text-1">
            <span>수수료 5% (입점 프로모션 D-62)</span>
            <b className="tabular-nums text-[#1a7f4e]">-495원</b>
          </div>
          <div className="flex justify-between px-3 pt-1 text-xs font-extrabold text-ink">
            <span>내 정산액</span>
            <span className="tabular-nums">9,405원 · D+14</span>
          </div>
          <div className="text-[10px] text-text-3">
            리포트 최저가 3,000원 · 상담 최저가 10,000원 · 최소 수수료 건당
            500원 (수수료율과 큰 쪽 적용)
          </div>
        </div>

        {/* 수수료 체계 (16a) */}
        <div className="card flex flex-col gap-2 p-4">
          <div className="text-[13px] font-extrabold text-ink">
            수수료 체계{" "}
            <span className="text-[10px] font-semibold text-text-3">
              구매자 추가 수수료 항상 0%
            </span>
          </div>
          <div className="flex flex-col text-[11px] tabular-nums">
            <div className="flex rounded-t-lg bg-bg px-3 py-2 font-bold text-text-3">
              <span className="flex-[1.7]">판매자 유형</span>
              <span className="flex-1 text-right">통합 수수료</span>
              <span className="flex-[0.7] text-right">구매자</span>
            </div>
            {FEE_TIERS.map((t) => (
              <div
                key={t.type}
                className={`flex px-3 py-2 text-text-1 ${
                  "promo" in t && t.promo
                    ? "rounded-b-lg bg-[#e7f5ee]"
                    : "border-b border-line"
                }`}
              >
                <span className="flex-[1.7] font-bold">
                  {t.type}{" "}
                  {t.badge === "인증" && (
                    <span className="rounded-[5px] bg-primary-soft px-1.5 py-[2px] text-[10px] font-extrabold text-primary">
                      인증
                    </span>
                  )}
                  {t.badge === "✦ 전문가" && (
                    <span className="rounded-[5px] bg-ink px-1.5 py-[2px] text-[10px] font-extrabold text-[#f2c94c]">
                      ✦ 전문가
                    </span>
                  )}
                </span>
                <span
                  className={`flex-1 text-right font-extrabold ${
                    "promo" in t && t.promo
                      ? "text-[#1a7f4e]"
                      : t.accent
                        ? "text-primary"
                        : "text-ink"
                  }`}
                >
                  {t.fee}
                </span>
                <span className="flex-[0.7] text-right text-text-3">0%</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-text-3">
            수수료 인하 경로 = 성장 동선: 일반 → 인증(-2%p) → 전문가
            구독(-3%p) · 환불 시 수수료 복원
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* 파이오니어 플랜 (16d) */}
        <AIPanel title="파이오니어 전문가 · 선착순 30명">
          <div className="flex flex-col gap-1.5">
            <div className="text-lg font-extrabold tabular-nums text-white">
              월 19,000원{" "}
              <span className="text-[10px] font-semibold text-ai-muted">
                6개월 가격 유지 · 통합 수수료 7%
              </span>
            </div>
            <div>
              전문가 전용 AI 초안 월 100회 · 광고 상품 20% 할인 · PRO 개인
              기능 포함 · 남은 자리 14
            </div>
            <div className="text-[10px] text-ai-muted">
              6개월 후 정가 월 29,000원 전환 · 전환 30일 전 알림 · 동의 없인
              자동 인상 없음 (미동의 시 인증 판매자 10%로 전환) · 신청 후 자격
              심사 통과 시 개시 — 결제만으로 개시 불가
            </div>
          </div>
        </AIPanel>

        {/* 저작권 보증 서약 */}
        <AIPanel title="저작권 보증 서약">
          게시 전 필수 동의. 표절 확정 시 정산 보류 + 상품 내림 + 배지 회수.
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-bold text-white">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => onAgree(e.target.checked)}
              className="h-4 w-4 accent-[#1d4fd8]"
            />
            내가 직접 작성한 콘텐츠임을 보증합니다
          </label>
        </AIPanel>
      </div>
    </div>
  );
}

export default function SellerOnboardingPage() {
  const [step, setStep] = useState(0);
  const [sellerType, setSellerType] = useState<string>("personal");
  const [code, setCode] = useState<string[]>(["누", "7", "", ""]);
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleCode = (i: number, v: string) => {
    setCode((prev) => prev.map((c, idx) => (idx === i ? v : c)));
  };

  const isLast = step === STEPS.length - 1;

  return (
    <PageShell breadcrumb="마이 › 판매 시작하기" wide>
      {/* 위저드 헤더 바 */}
      <div className="glass rise-in mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 md:px-5">
        <span className="text-sm font-extrabold text-ink">판매 시작하기</span>
        <StepDots current={step} />
        <span className="ml-auto text-[11px] text-text-3">
          임시 저장됨 · 언제든 이어서
        </span>
      </div>

      <div className="rise-in-2">
        {step === 0 && (
          <StepVerify
            sellerType={sellerType}
            onSelectType={setSellerType}
            code={code}
            onCode={handleCode}
          />
        )}
        {step === 1 && <StepProduct />}
        {step === 2 && <StepPreview />}
        {step === 3 && <StepPrice agreed={agreed} onAgree={setAgreed} />}
      </div>

      {/* 준비 중 안내 */}
      {submitted && (
        <div className="rise-in mt-4 rounded-xl bg-[#fdf3dd] px-4 py-3 text-xs font-bold leading-relaxed text-[#946200]">
          심사 신청 접수는 준비 중이에요 — 실제 제출은 아직 연결되지
          않았습니다. 오픈 시 알림으로 안내해 드릴게요. 입력한 내용은 임시
          저장됩니다.
        </div>
      )}

      {/* 하단 내비게이션 */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => {
            setSubmitted(false);
            setStep((s) => Math.max(0, s - 1));
          }}
          className="btn-secondary flex-1 rounded-[10px] px-4 py-3 text-xs disabled:opacity-40"
        >
          이전
        </button>
        {isLast ? (
          <button
            type="button"
            disabled={!agreed}
            onClick={() => setSubmitted(true)}
            className="btn-primary btn-cta flex-[2] rounded-[10px] px-4 py-3 text-[13px] disabled:bg-[#c9d4e5] disabled:shadow-none"
          >
            {agreed ? "심사 신청" : "서약 동의 후 심사 신청"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="btn-primary flex-[2] rounded-[10px] px-4 py-3 text-[13px]"
          >
            다음
          </button>
        )}
      </div>
      <div className="mt-2 text-center text-[10px] text-text-3">
        게이트 미충족 항목이 있어도 임시 저장은 가능해요 · 발행은 11요소 충족
        후
      </div>
    </PageShell>
  );
}
