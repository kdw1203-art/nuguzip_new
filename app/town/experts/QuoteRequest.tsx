"use client";

import { ActionButton } from "@/app/components/ui/ActionButton";

/**
 * 전문가 견적 요청 플로우 (숨고 벤치마크 — docs/benchmark-proposals.md A4)
 * 카테고리(세무/절세·금융/대출·임장 동행·인테리어) + 지역 + 내용 → POST /api/market-requests
 * 로그인 필요 · 시간당 3회 rate-limit(서버). 성공 시 "전문가가 확인하면 알림으로 알려드려요"
 *
 * - QuoteRequestModal: 외부에서 open/onClose 로 제어 (전문가 상세에서 재사용)
 * - QuoteRequestBanner: 목록 상단 배너 + 자체 트리거
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";
import { QUOTE_CATEGORIES, findSpecialty } from "@/lib/experts/taxonomy";

/* [953] 카테고리는 분류 체계(taxonomy) 의 quotable 분야 — 목록 필터·프로필 분야와 같은 라벨 */
const CATEGORIES = QUOTE_CATEGORIES;
type Category = string;

type MyRequest = {
  id: string;
  requestType: string;
  city: string;
  district: string;
  title: string;
  description: string;
  status: "open" | "closed";
  createdAt: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function QuoteRequestModal({
  open,
  onClose,
  presetCategory = null,
  headline = "전문가 견적 요청",
}: {
  open: boolean;
  onClose: () => void;
  presetCategory?: Category | null;
  headline?: string;
}) {
  const { promptSignup } = useSoftSignup();
  const [category, setCategory] = useState<Category | null>(presetCategory);
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<MyRequest[] | null>(null);

  useEffect(() => {
    if (open) setCategory((prev) => prev ?? presetCategory);
  }, [open, presetCategory]);

  // 내 요청 목록 — 모달 열 때 조회 (비로그인 401은 조용히 무시)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/market-requests", { cache: "no-store" })
      .then(async (res) => {
        if (!alive || !res.ok) return;
        const data = (await res.json()) as { items?: MyRequest[] };
        if (alive) setMyRequests(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, status]);

  const submit = async () => {
    if (!category) {
      setError("어떤 도움이 필요한지 카테고리를 선택해 주세요.");
      return;
    }
    if (!city.trim() || !district.trim()) {
      setError("지역(시/도, 시·군·구)을 입력해 주세요.");
      return;
    }
    if (content.trim().length < 10) {
      setError("요청 내용은 10자 이상 입력해 주세요.");
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/market-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          city: city.trim(),
          district: district.trim(),
          content: content.trim(),
        }),
      });
      if (res.status === 401) {
        // 입력한 요청 내용을 유지한 채 안내만 띄운다. status 를 idle 로 되돌려야 재시도가 된다.
        setStatus("idle");
        promptSignup({
          action: "market_request_create",
          title: "견적 요청을 보낼까요?",
          benefit:
            "요청은 계정으로 접수돼요. 가입하면 전문가들이 보낸 견적을 한 곳에서 비교하고, 내 요청 목록에서 진행 상황을 볼 수 있습니다.",
          callbackUrl: "/town/experts",
        });
        return;
      }
      if (res.status === 429) {
        setError("요청이 많아요. 잠시 후(시간당 3회) 다시 시도해 주세요.");
        setStatus("idle");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "견적 요청에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setStatus("idle");
        return;
      }
      setStatus("done");
      setContent("");
    } catch {
      setError("견적 요청에 실패했어요. 네트워크를 확인해 주세요.");
      setStatus("idle");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="전문가 견적 요청"
      maxWidth={440}
      dismissOnBackdrop={status !== "sending"}
    >
      {status === "done" ? (
        <div className="flex flex-col items-center gap-2.5 py-4 text-center">
          <div className="t-section text-ink">견적 요청이 접수됐어요</div>
          <p className="t-sub text-text-2">
            인증 전문가가 제안을 보내면 알림과 함께{" "}
            <Link href="/my/consultations#requests" className="font-bold text-primary">
              마이 › 상담함
            </Link>
            에 모여요. 여러 제안을 비교하고 프로필로 이어가세요.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="btn-primary mt-1 rounded-xl px-6 py-2.5 t-body"
          >
            확인
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ModalHeader title={headline} onClose={onClose} />

          <div>
            <div className="mb-1.5 t-sub font-bold text-text-2">카테고리</div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  className={`chip px-3.5 py-2 t-sub font-bold ${
                    category === c ? "chip-active" : "border border-line bg-bg text-text-2"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {category && findSpecialty(category) && (
              <p className="mt-1.5 t-caption text-text-3">{findSpecialty(category)!.desc}</p>
            )}
          </div>

          <div>
            <div className="mb-1.5 t-sub font-bold text-text-2">지역</div>
            <div className="flex gap-2">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={40}
                placeholder="시/도 (예: 경기도)"
                className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
              />
              <input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                maxLength={60}
                placeholder="시·군·구 (예: 안양시 동안구)"
                className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
              />
            </div>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="필요한 내용을 구체적으로 적어주세요 (10자 이상). 예: 관양동 구축 84㎡ 임장에 동행해 주실 분을 찾아요."
            className="w-full resize-none rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
          />
          {error && <div className="t-sub font-semibold text-danger">{error}</div>}
          <ActionButton
            state={status === "sending" ? "busy" : error ? "error" : "idle"}
            onClick={() => void submit()}
            busyLabel="요청 중"
            errorLabel="다시 확인해 주세요"
            className="rounded-xl p-3 t-body"
          >
            견적 요청하기
          </ActionButton>
          <p className="t-caption text-text-3">
            시간당 3회까지 요청 가능 · 개인정보(전화번호·계좌)는 적지 마세요 · 중개
            의뢰가 아닌 정보 상담 요청입니다
          </p>

          {myRequests !== null && (
            <div className="border-t border-line pt-3">
              <div className="mb-1.5 flex items-center justify-between t-sub font-bold text-text-2">
                <span>내 요청</span>
                <Link href="/my/consultations#requests" className="font-bold text-primary no-underline">
                  받은 제안 보기 ›
                </Link>
              </div>
              {myRequests.length === 0 ? (
                <p className="py-2 t-sub text-text-3">아직 보낸 견적 요청이 없어요.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {myRequests.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center gap-2 py-2">
                      <span
                        className={`shrink-0 rounded-md chip-pad-tight t-caption font-extrabold ${
                          r.status === "open"
                            ? "bg-primary-soft text-primary"
                            : "bg-bg text-text-3"
                        }`}
                      >
                        {r.status === "open" ? "대기 중" : "마감"}
                      </span>
                      <span className="min-w-0 flex-1 truncate t-sub font-bold text-ink">
                        {r.title}
                      </span>
                      <span className="shrink-0 t-caption text-text-3">
                        {formatDate(r.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function QuoteRequestBanner() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="rise-in-1 card mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-[22px] py-4">
        <div>
          <div className="t-section text-ink">
            어떤 전문가가 필요한지 모르겠다면
          </div>
          <p className="mt-0.5 t-sub text-text-3">
            {CATEGORIES.join("·")} — 필요한 내용을 남기면 인증 전문가가 제안을 보내요 (요청당 전문가 1건)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-primary btn-cta rounded-xl px-[22px] py-[11px] t-body"
        >
          견적 요청
        </button>
      </div>

      <QuoteRequestModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** 상세 페이지 등에서 쓰는 단일 버튼 트리거 — 배너 없이 모달만 */
export function QuoteRequestLink({
  className = "btn-secondary rounded-xl px-4 py-2.5 t-body",
  label = "견적 요청",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      <QuoteRequestModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
