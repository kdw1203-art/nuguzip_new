"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AIPanel } from "@/app/components/AIPanel";
import { PageShell } from "@/app/components/PageShell";

/** 17c — 판매자 온보딩 위저드 (검증 → 첫 상품 → 미리보기 → 가격·게시)
 *
 *  런칭 전 정직성 정리 —
 *  이 파일에는 원래 fetch 가 단 한 줄도 없었는데도 "방금 계좌로 1원을 보냈어요",
 *  "실명 일치 ✓", "110-•••-455102", "재전송 (2/3)" 처럼 일어나지 않은 일을
 *  사실로 적어 뒀다. 돈이 걸린 화면에서의 허위 표시라 전부 삭제했다.
 *  근거 없이 박아 둔 수치(D-62, 남은 자리 14, 출처·표본, 7/11 충족)도
 *  삭제하거나 실제 입력값에서 계산하도록 바꿨다.
 *  입력값은 이 브라우저 localStorage 에만 남는다(= "임시 저장됨"이 이제 사실).
 *  심사 접수 API 는 아직 없으므로 마지막 CTA 는 비활성 + 준비 중 라벨로 둔다. */

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

/* 16a 수수료 체계 — 공표된 요율표(정책 문구)라 그대로 둔다. 측정값이 아니다. */
const FEE_TIERS = [
  { type: "일반 크리에이터", fee: "12%", accent: false, badge: null },
  { type: "본인·자격 인증 판매자", fee: "10%", accent: false, badge: "인증" },
  { type: "전문가 판매자 구독 회원", fee: "7%", accent: true, badge: "✦ 전문가" },
  { type: "초기 입점 프로모션", fee: "5% · 90일", accent: false, badge: null, promo: true },
] as const;

/* 정산 계산 기준 — 아직 어떤 등급도 부여된 적이 없으므로 신규 판매자 기본값인
   일반 크리에이터 12% 로만 계산한다. 예전 화면은 5% 프로모션이 이미 적용된 것처럼
   9,900 / -495 / 9,405 을 박아 뒀는데, 판매가 입력란조차 없는 상태였다. */
const BASE_FEE_RATE = 0.12;
const MIN_FEE = 500;
const MIN_PRICE = 3000;

const DRAFT_KEY = "nz_seller_wizard_draft";

type Draft = {
  step: number;
  sellerType: string;
  title: string;
  toc: string;
  previewPages: string;
  price: string;
  agreed: boolean;
  fileName: string;
  fileUrl: string;
};

const EMPTY_DRAFT: Draft = {
  step: 0,
  sellerType: "personal",
  title: "",
  toc: "",
  previewPages: "",
  price: "",
  agreed: false,
  fileName: "",
  fileUrl: "",
};

function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
    return {
      step:
        typeof o.step === "number" && o.step >= 0 && o.step < STEPS.length
          ? o.step
          : 0,
      sellerType: SELLER_TYPES.some((t) => t.key === o.sellerType)
        ? (o.sellerType as string)
        : "personal",
      title: str("title"),
      toc: str("toc"),
      previewPages: str("previewPages"),
      price: str("price"),
      agreed: o.agreed === true,
      fileName: str("fileName"),
      fileUrl: str("fileUrl"),
    };
  } catch {
    return null;
  }
}

function tocCount(toc: string) {
  return toc.split(/[\n,·]/).filter((s) => s.trim().length > 0).length;
}

/* 발행 게이트 (16c) — 예전에는 GATE_CHECKS 가 하드코딩 as const 라
   완전히 빈 양식에서도 초록 ✓ 7개가 떴다. 지금은 이 화면이 실제로 값을 받는
   항목만 계산하고, 입력란이 없는 나머지 항목은 ✓/✕ 대신 회색 "미검사"로 둔다.
   없는 근거를 통과 표시로 위장하지 않기 위해서다. */
const GATE_CHECKS: { label: string; ok: (d: Draft) => boolean }[] = [
  { label: "제목", ok: (d) => d.title.trim().length >= 5 },
  { label: "목차 5개 이상", ok: (d) => tocCount(d.toc) >= 5 },
  { label: "PDF", ok: (d) => d.fileUrl !== "" },
  { label: "미리보기 페이지", ok: (d) => Number(d.previewPages) > 0 },
];

/* 11요소 중 이 화면에 입력란이 없어 판정 자체가 불가능한 항목들 */
const GATE_UNCHECKED = [
  "출처",
  "기준일",
  "표본 수",
  "전세가율",
  "구분 표기",
  "후보 비교",
  "추이 그래프",
  "결측 표시",
  "체크리스트",
  "버전 표기",
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
                  ? "font-bold text-success"
                  : active
                    ? "font-extrabold text-primary"
                    : "text-text-3"
              }`}
            >
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] ${
                  done
                    ? "bg-success-fill text-white"
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

/* ── 1단계 · 검증 ── */
function StepVerify({
  sellerType,
  onSelectType,
}: {
  sellerType: string;
  onSelectType: (k: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_1.2fr]">
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

      {/* 정산 계좌 — 예전에는 여기에 등록된 계좌번호와 "예금주 김OO · 실명 일치 ✓",
          그리고 "방금 1원을 보냈어요 (10분 내)" + 미리 채워진 코드 입력칸이 있었다.
          송금도 실명대조도 실제로 일어난 적이 없고 코드 검증 로직도 없었다.
          아직 붙일 수 있는 인증 수단이 없으므로 안내만 남긴다. */}
      <div className="card flex flex-col gap-3 p-4">
        <div className="text-[13px] font-extrabold text-ink">정산 계좌</div>
        <div className="rounded-2xl border border-line bg-bg p-3.5 text-[11px] leading-relaxed text-text-2">
          <b className="text-ink">정산 계좌 등록과 본인 확인은 심사 통과 후 안내드려요.</b>
          <div className="mt-1.5">
            이 화면에서는 계좌를 받지 않고, 계좌 인증도 진행하지 않습니다. 등록
            절차가 열리면 알림으로 안내해 드릴게요.
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-[11px] leading-relaxed text-text-2">
          <div className="rounded-lg bg-bg px-3 py-2">
            등록 가능한 계좌는 <b className="text-text-1">본인(또는 사업자) 명의</b>
            로 한정되며, 판매자 검증 실명과 예금주를 대조합니다.
          </div>
          <div className="rounded-lg bg-bg px-3 py-2">
            계좌 변경 시 재인증 + 기존 계좌로 알림 · 변경 후 첫 정산은 48시간
            보류(탈취 방어)
          </div>
        </div>
      </div>
    </div>
  );
}

/* PDF 업로드 — /api/upload 가 실제로 존재하므로 실제로 붙였다.
   예전에는 onClick 도 <input type="file"> 도 없는 점선 버튼이었다. */
function PdfUpload({
  fileName,
  onUploaded,
  onClear,
}: {
  fileName: string;
  onUploaded: (name: string, url: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "seller-report");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || typeof json.url !== "string") {
        setError(
          (typeof json.error === "string" && json.error) ||
            `업로드 실패 (${res.status})`,
        );
      } else {
        onUploaded(file.name, json.url);
      }
    } catch {
      setError("업로드 실패 (네트워크)");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className={`flex cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-line-strong p-3 text-[11px] font-bold text-primary ${
          busy ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {busy ? "업로드 중…" : fileName ? "PDF 다시 선택" : "+ PDF 업로드"}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={onPick}
          disabled={busy}
          className="hidden"
        />
      </label>
      {fileName && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2 text-[10px] text-text-2">
          <span className="truncate">업로드됨 · {fileName}</span>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 font-bold text-text-3 underline underline-offset-2"
          >
            삭제
          </button>
        </div>
      )}
      {error && <div className="text-[10px] font-bold text-danger">{error}</div>}
    </div>
  );
}

/* ── 2단계 · 첫 상품 ── */
function StepProduct({
  draft,
  set,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
}) {
  const passed = GATE_CHECKS.filter((g) => g.ok(draft)).length;
  const total = GATE_CHECKS.length + GATE_UNCHECKED.length;

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="text-[13px] font-extrabold text-ink">
        2단계 · 첫 리포트 정보
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        {/* 예전에는 defaultValue 로 "관양동 구축 리모델링 실전 가이드"가 박혀 있어
            아무것도 입력하지 않아도 제목이 채워진 것처럼 보였다. */}
        <input
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="리포트 제목 입력 (필수)"
          aria-label="리포트 제목"
          className="rounded-[10px] border border-line-strong px-3.5 py-2.5 font-bold text-ink outline-none placeholder:font-normal placeholder:text-text-3 focus:border-primary"
        />
        <input
          value={draft.toc}
          onChange={(e) => set({ toc: e.target.value })}
          placeholder="목차 입력 (필수) — 쉼표로 구분, 최소 5개 항목…"
          aria-label="목차"
          className="rounded-[10px] border border-line-strong px-3.5 py-2.5 text-ink outline-none placeholder:text-text-3 focus:border-primary"
        />
        <div className="grid gap-1.5 sm:grid-cols-2">
          <PdfUpload
            fileName={draft.fileName}
            onUploaded={(name, url) => set({ fileName: name, fileUrl: url })}
            onClear={() => set({ fileName: "", fileUrl: "" })}
          />
          {/* "+ 미리보기 3p 지정"은 아무 동작도 없는 점선 버튼이었다.
              페이지 지정 UI 를 붙일 수단이 없어, 실제로 값을 받는 숫자 입력으로 바꿨다. */}
          <label className="flex items-center gap-2 rounded-[10px] border border-line-strong px-3.5 py-2.5 text-[11px] text-text-2">
            <span className="shrink-0">무료 공개 페이지 수</span>
            <input
              type="number"
              min={0}
              max={50}
              value={draft.previewPages}
              onChange={(e) => set({ previewPages: e.target.value })}
              placeholder="예: 3"
              aria-label="무료 공개 페이지 수"
              className="w-full min-w-0 bg-transparent text-right font-bold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-text-3"
            />
            <span className="shrink-0">p</span>
          </label>
        </div>
      </div>
      {/* 발행 게이트 검사 */}
      <div className="flex flex-col gap-1.5 rounded-xl bg-bg px-3.5 py-3">
        <div className="text-[11px] font-extrabold text-ink">
          발행 게이트 검사 (11요소) — 이 화면에서 확인 가능 {passed}/
          {GATE_CHECKS.length}
        </div>
        <div className="flex flex-wrap gap-1 text-[10px]">
          {GATE_CHECKS.map((g) => {
            const ok = g.ok(draft);
            return (
              <span
                key={g.label}
                className={`rounded-[5px] px-1.5 py-[3px] font-bold ${
                  ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                }`}
              >
                {ok ? "✓" : "✕"} {g.label}
              </span>
            );
          })}
          {GATE_UNCHECKED.map((label) => (
            <span
              key={label}
              className="rounded-[5px] bg-line-strong/60 px-1.5 py-[3px] font-bold text-text-3"
            >
              — {label}
            </span>
          ))}
        </div>
        <div className="text-[10px] text-text-3">
          회색 {GATE_UNCHECKED.length}개 항목은 아직 입력란이 없어 검사하지
          않아요 (충족으로도, 미충족으로도 세지 않습니다). 전체 {total}요소
          검사는 발행 기능과 함께 열려요.
        </div>
      </div>
    </div>
  );
}

/* ── 3단계 · 미리보기 ── */
function StepPreview({ draft }: { draft: Draft }) {
  const previewPages = Number(draft.previewPages);
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,390px)_1fr]">
      {/* 구매자에게 보이는 상세 미리보기 */}
      <div className="card mx-auto flex w-full max-w-[390px] flex-col gap-2.5 rounded-3xl bg-bg p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-extrabold text-ink">
            {draft.title.trim() || "제목 미입력"}
          </span>
          <span className="shrink-0 rounded-md bg-primary chip-pad text-[10px] font-extrabold text-white">
            유료 리포트
          </span>
        </div>
        {/* 예전에는 여기에 "출처 국토부 실거래 · KB시세 / 기준일·표본 2026.7.19 · 거래 24건"이
            실제 출처 표기와 똑같은 스타일로 찍혀 있었다. 판매자가 그런 값을 입력한 적이 없어
            전부 지어낸 수치였다. 입력란이 생기기 전까지는 표시하지 않는다. */}
        <div className="card flex flex-col gap-1.5 p-3.5 text-[11px] text-text-1">
          <div className="flex justify-between">
            <span className="text-text-3">미리보기</span>
            <b>
              {previewPages > 0
                ? `${previewPages}페이지 무료 공개`
                : "페이지 수 미지정"}
            </b>
          </div>
          <div className="flex justify-between">
            <span className="text-text-3">본문 PDF</span>
            <b>{draft.fileName ? "첨부됨" : "미첨부"}</b>
          </div>
        </div>
        <div className="flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-line to-line-strong text-[11px] font-bold text-[#33415e]">
          미리보기 썸네일 영역 (자리표시)
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
          출처 · 기준일 · 표본 수는 발행 시 판매자가 직접 기입해야 하는
          항목이에요. 아직 입력란이 없어 미리보기에 표시되지 않습니다.
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
  draft,
  set,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
}) {
  /* 예전에는 판매가 입력란 없이 9,900원 / -495원 / 9,405원 과
     "입점 프로모션 D-62"가 상수로 박혀 있었다(D-62 는 영원히 D-62).
     지금은 입력한 판매가에서 실제로 계산하고, 부여된 적 없는 프로모션 요율 대신
     신규 판매자 기본 요율만 쓴다. */
  const price = Number(draft.price);
  const valid = Number.isFinite(price) && price >= MIN_PRICE;
  const fee = valid ? Math.max(Math.round(price * BASE_FEE_RATE), MIN_FEE) : 0;
  const payout = valid ? price - fee : 0;
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col gap-4">
        {/* 가격 미리 계산 */}
        <div className="card flex flex-col gap-1.5 p-4">
          <div className="text-[13px] font-extrabold text-ink">
            가격 미리 계산
          </div>
          <label className="flex items-center justify-between gap-2 rounded-lg border border-line-strong px-3 py-2 text-[11px] text-text-1 focus-within:border-primary">
            <span>판매가</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={MIN_PRICE}
                step={100}
                value={draft.price}
                onChange={(e) => set({ price: e.target.value })}
                placeholder="예: 9900"
                aria-label="판매가 (원)"
                className="w-24 bg-transparent text-right font-bold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-text-3"
              />
              <b>원</b>
            </span>
          </label>
          {valid ? (
            <>
              <div className="flex justify-between rounded-lg bg-bg px-3 py-2 text-[11px] text-text-1">
                <span>수수료 12% (일반 크리에이터 기준 · 최소 500원)</span>
                <b className="tabular-nums text-danger">-{won(fee)}</b>
              </div>
              <div className="flex justify-between px-3 pt-1 text-xs font-extrabold text-ink">
                <span>내 정산액</span>
                <span className="tabular-nums">{won(payout)}</span>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-bg px-3 py-2 text-[11px] text-text-3">
              판매가를 {won(MIN_PRICE)} 이상으로 입력하면 수수료와 정산액을
              계산해 드려요
            </div>
          )}
          <div className="text-[10px] text-text-3">
            리포트 최저가 3,000원 · 상담 최저가 10,000원 · 최소 수수료 건당
            500원 (수수료율과 큰 쪽 적용) · 정산 주기 D+14 · 인증·전문가 요율은
            심사 통과 후 적용돼요
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
                    ? "rounded-b-lg bg-success-soft"
                    : "border-b border-line"
                }`}
              >
                <span className="flex-[1.7] font-bold">
                  {t.type}{" "}
                  {t.badge === "인증" && (
                    <span className="rounded-[5px] bg-primary-soft chip-pad-tight text-[10px] font-extrabold text-primary">
                      인증
                    </span>
                  )}
                  {t.badge === "✦ 전문가" && (
                    <span className="rounded-[5px] bg-ink chip-pad-tight text-[10px] font-extrabold text-[#f2c94c]">
                      ✦ 전문가
                    </span>
                  )}
                </span>
                <span
                  className={`flex-1 text-right font-extrabold ${
                    "promo" in t && t.promo
                      ? "text-success"
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
        {/* 파이오니어 플랜 (16d) — 예전 제목은 "선착순 30명", 본문에는 "남은 자리 14"였다.
            신청자 수를 집계하는 곳이 없어 지어낸 희소성이었다. 유료 구독 상품이라 더 위험해 삭제. */}
        <AIPanel title="파이오니어 전문가 플랜">
          <div className="flex flex-col gap-1.5">
            <div className="text-lg font-extrabold tabular-nums text-white">
              월 19,000원{" "}
              <span className="text-[10px] font-semibold text-ai-muted">
                6개월 가격 유지 · 통합 수수료 7%
              </span>
            </div>
            <div>
              전문가 전용 AI 초안 월 100회 · 광고 상품 20% 할인 · PRO 개인
              기능 포함
            </div>
            <div className="text-[10px] text-ai-muted">
              6개월 후 정가 월 29,000원 전환 · 전환 30일 전 알림 · 동의 없인
              자동 인상 없음 (미동의 시 인증 판매자 10%로 전환) · 신청 후 자격
              심사 통과 시 개시 — 결제만으로 개시 불가 · 신청 접수는 준비 중
            </div>
          </div>
        </AIPanel>

        {/* 저작권 보증 서약 */}
        <AIPanel title="저작권 보증 서약">
          게시 전 필수 동의. 표절 확정 시 정산 보류 + 상품 내림 + 배지 회수.
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-bold text-white">
            <input
              type="checkbox"
              checked={draft.agreed}
              onChange={(e) => set({ agreed: e.target.checked })}
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
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  /* 예전 헤더는 아무 저장 코드도 없이 "임시 저장됨 · 언제든 이어서"라고 적어 뒀고,
     새로고침 한 번이면 4단계 입력이 전부 사라졌다. 실제로 localStorage 에 저장한다. */
  const [loaded, setLoaded] = useState(false);
  const [restored, setRestored] = useState(false);

  /* 복원은 SSR 불일치를 피하려 effect 에서 1회만 */
  useEffect(() => {
    try {
      const saved = parseDraft(window.localStorage.getItem(DRAFT_KEY));
      if (saved) {
        setDraft(saved);
        setRestored(true);
      }
    } catch {
      /* 프라이빗 모드 등 접근 불가 — 기본값으로 진행 */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      // 실제로 저장이 끝난 뒤에만 "임시 저장됨"이라고 말한다
      if (JSON.stringify(draft) !== JSON.stringify(EMPTY_DRAFT)) setRestored(true);
    } catch {
      /* 저장 실패 시에도 입력은 계속 가능 — 아래 안내에 저장 범위를 명시했다 */
    }
  }, [draft, loaded]);

  const set = (patch: Partial<Draft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* 무시 */
    }
    setDraft(EMPTY_DRAFT);
    setRestored(false);
  };

  const step = draft.step;
  const isLast = step === STEPS.length - 1;

  return (
    <PageShell breadcrumb="마이 › 판매 시작하기" wide>
      {/* 위저드 헤더 바 */}
      <div className="glass rise-in mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 md:px-5">
        <span className="text-sm font-extrabold text-ink">판매 시작하기</span>
        <StepDots current={step} />
        <span className="ml-auto flex items-center gap-2 text-[11px] text-text-3">
          {restored ? "이 브라우저에 임시 저장됨" : "입력하면 이 브라우저에 임시 저장돼요"}
          <button
            type="button"
            onClick={clearDraft}
            className="font-bold underline underline-offset-2"
          >
            지우기
          </button>
        </span>
      </div>

      {/* 정직한 상태 고지 (감사 P1-5) — 심사 접수 미오픈 안내 */}
      <div
        role="status"
        className="rise-in mb-4 rounded-xl border border-[#f2c94c]/60 bg-[#fdf3dd] px-4 py-3 text-xs font-bold leading-relaxed text-[#946200]"
      >
        파트너 심사 접수는 준비 중입니다 — 아래 절차는 미리보기이며 실제 제출은
        아직 열리지 않았습니다. 입력한 내용은 서버로 전송되지 않고 이 브라우저에만
        저장돼요(업로드한 PDF 파일은 제외). 문의:{" "}
        <Link href="/support" className="underline underline-offset-2">
          고객센터
        </Link>
      </div>

      <div className="rise-in-2">
        {step === 0 && (
          <StepVerify
            sellerType={draft.sellerType}
            onSelectType={(k) => set({ sellerType: k })}
          />
        )}
        {step === 1 && <StepProduct draft={draft} set={set} />}
        {step === 2 && <StepPreview draft={draft} />}
        {step === 3 && <StepPrice draft={draft} set={set} />}
      </div>

      {/* 하단 내비게이션 */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => set({ step: Math.max(0, step - 1) })}
          className="btn-secondary flex-1 rounded-[10px] px-4 py-3 text-xs disabled:opacity-40"
        >
          이전
        </button>
        {isLast ? (
          /* 예전에는 "심사 신청" 버튼이 setSubmitted(true) 로 로컬 상태만 뒤집었다.
             제출 API 가 없어 4단계 입력이 조용히 버려지는 구조였다.
             접수 라우트가 생기기 전까지는 비활성 + 준비 중 라벨로 둔다. */
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="btn-primary flex-[2] cursor-not-allowed rounded-[10px] bg-[#c9d4e5] px-4 py-3 text-[13px] shadow-none"
          >
            입점 신청 접수 준비 중
          </button>
        ) : (
          <button
            type="button"
            onClick={() => set({ step: Math.min(STEPS.length - 1, step + 1) })}
            className="btn-primary flex-[2] rounded-[10px] px-4 py-3 text-[13px]"
          >
            다음
          </button>
        )}
      </div>
      <div className="mt-2 text-center text-[10px] text-text-3">
        입력값은 이 브라우저에만 임시 저장돼요 · 다른 기기에서는 이어서 작성할 수
        없습니다
      </div>
    </PageShell>
  );
}
