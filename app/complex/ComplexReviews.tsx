"use client";

/**
 * 거주민 후기 섹션 (호갱노노 "이야기" 벤치마크 — docs/benchmark-proposals.md D4 계열)
 * - GET /api/complex-reviews?complexId= 로 목록·평균 표시 (빈 상태 정직)
 * - 로그인 시 작성: 항목별 별점(1~5) + 한줄 후기 → POST /api/complex-reviews (5회/시간 제한)
 * - 비로그인 작성 시도(401) → A3 소프트 가입 프롬프트 (즉시 리다이렉트 대신 그 자리에서 설명)
 * - 신고: 기존 ReportButton 재사용 (postId = "complex-review:<id>")
 */
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ReportButton } from "../components/ReportButton";
import { Icon } from "@/app/components/Icon";
import { CharCount } from "@/app/components/ui/CharCount";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";

type ReviewItem = {
  id: string;
  author: string;
  noiseScore: number;
  parkingScore: number;
  mgmtScore: number;
  neighborScore: number;
  transportScore: number;
  comment: string | null;
  createdAt: string;
  helpfulCount?: number;
  isResident?: boolean;
  isVisitVerified?: boolean;
  residentPeriod?: string | null;
};

type Summary = {
  count: number;
  avgNoise: number;
  avgParking: number;
  avgMgmt: number;
  avgNeighbor: number;
  avgTransport: number;
  overall: number;
};

const CATEGORIES = [
  { key: "noiseScore", label: "소음", avgKey: "avgNoise" },
  { key: "parkingScore", label: "주차", avgKey: "avgParking" },
  { key: "mgmtScore", label: "관리", avgKey: "avgMgmt" },
  { key: "neighborScore", label: "이웃", avgKey: "avgNeighbor" },
  { key: "transportScore", label: "교통", avgKey: "avgTransport" },
] as const;

type ScoreKey = (typeof CATEGORIES)[number]["key"];

function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span
      className="font-bold text-brand-red"
      style={{ fontSize: size }}
      aria-label={`별점 ${value.toFixed(1)}점`}
    >
      {"★".repeat(Math.round(value))}
      <span className="text-line">{"★".repeat(5 - Math.round(value))}</span>
    </span>
  );
}

function StarInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="w-[42px] shrink-0 text-xs font-bold text-text-2">{label}</span>
      <div className="flex gap-0.5" role="radiogroup" aria-label={`${label} 별점`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}점`}
            onClick={() => onChange(n)}
            className={`text-[19px] leading-none transition-colors ${
              n <= value ? "text-brand-red" : "text-line hover:text-brand-red/50"
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function ComplexReviews({
  complexId,
  complexName,
}: {
  complexId: string;
  complexName: string;
}) {
  const pathname = usePathname();
  const { promptSignup } = useSoftSignup();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  const [formOpen, setFormOpen] = useState(false);
  const [scores, setScores] = useState<Record<ScoreKey, number>>({
    noiseScore: 0,
    parkingScore: 0,
    mgmtScore: 0,
    neighborScore: 0,
    transportScore: 0,
  });
  const [comment, setComment] = useState("");
  const [isResident, setIsResident] = useState(false);
  const [isVisitVerified, setIsVisitVerified] = useState(false);
  const [residentPeriod, setResidentPeriod] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // 도움돼요 — 서버 authoritative count 오버라이드 + 투표 완료 표시(중복 방지)
  const [helpfulOverride, setHelpfulOverride] = useState<Record<string, number>>({});
  const [votedIds, setVotedIds] = useState<Record<string, boolean>>({});
  const [helpfulBusy, setHelpfulBusy] = useState<Record<string, boolean>>({});

  const voteHelpful = async (reviewId: string) => {
    if (votedIds[reviewId] || helpfulBusy[reviewId]) return;
    setHelpfulBusy((m) => ({ ...m, [reviewId]: true }));
    try {
      const res = await fetch("/api/complex-reviews/helpful", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId }),
      });
      if (res.status === 401) {
        promptSignup({
          action: "review_helpful_vote",
          title: "도움된 후기에 표시할까요?",
          benefit:
            "가입하면 후기마다 한 번씩 '도움돼요'를 남길 수 있어요. 도움 표시가 많은 후기가 위로 올라가서, 다음 사람이 실제로 쓸모 있는 이야기를 먼저 봅니다.",
          callbackUrl: pathname ?? "/",
        });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { count?: number; already?: boolean };
      if (!res.ok) return;
      if (typeof data.count === "number") {
        setHelpfulOverride((m) => ({ ...m, [reviewId]: data.count as number }));
      }
      setVotedIds((m) => ({ ...m, [reviewId]: true }));
    } catch {
      // 네트워크 오류 시 조용히 무시 — 재시도 가능하도록 상태 유지
    } finally {
      setHelpfulBusy((m) => ({ ...m, [reviewId]: false }));
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/complex-reviews?complexId=${encodeURIComponent(complexId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { reviews?: ReviewItem[]; summary?: Summary };
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      setSummary(data.summary ?? null);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [complexId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (CATEGORIES.some((c) => scores[c.key] < 1)) {
      setError("모든 항목의 별점을 선택해 주세요.");
      return;
    }
    setSubmitState("sending");
    setError(null);
    try {
      const res = await fetch("/api/complex-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complexId,
          complexName,
          ...scores,
          comment: comment.trim() || null,
          isResident,
          isVisitVerified,
          residentPeriod: residentPeriod.trim() || null,
        }),
      });
      if (res.status === 401) {
        // 예전엔 여기서 곧바로 이동해서 "전송 중" 상태로 남아도 상관없었지만,
        // 이제는 프롬프트를 닫으면 이 화면에 그대로 머문다. idle 로 되돌리지 않으면
        // 등록 버튼이 영영 비활성 상태로 굳는다.
        setSubmitState("idle");
        promptSignup({
          action: "complex_review_create",
          title: "후기를 남기려면 로그인이 필요해요",
          benefit:
            "후기는 로그인한 계정으로만 남길 수 있어요. 같은 사람이 반복해서 올리는 걸 막기 위해서입니다. 등록하면 30P가 적립돼요.",
          callbackUrl: pathname ?? "/",
        });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "후기 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setSubmitState("idle");
        return;
      }
      setSubmitState("done");
      setFormOpen(false);
      setComment("");
      setIsResident(false);
      setIsVisitVerified(false);
      setResidentPeriod("");
      await load();
    } catch {
      setError("후기 등록에 실패했어요. 네트워크를 확인해 주세요.");
      setSubmitState("idle");
    }
  };

  return (
    <div className="card rounded-[18px] px-[18px] py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-section text-ink">거주민 후기</h2>
        {!formOpen && (
          <button
            type="button"
            onClick={() => {
              setFormOpen(true);
              setSubmitState("idle");
              setError(null);
            }}
            className="btn-primary rounded-[10px] px-3.5 py-2 t-sub"
          >
            후기 쓰기
          </button>
        )}
      </div>
      <p className="mt-1 t-sub text-text-3">
        직접 살아봤거나 임장에서 확인한 내용만 남겨주세요 · 같은 단지 재작성 시 기존 후기가
        갱신돼요 · 실거주·방문 후기가 먼저 보여요
      </p>

      {submitState === "done" && (
        <div className="mt-2 rounded-[10px] bg-primary-soft px-3 py-2 t-sub font-bold text-primary">
          후기가 등록됐어요. 이웃에게 큰 도움이 됩니다.
        </div>
      )}

      {/* 작성 폼 */}
      {formOpen && (
        <div className="mt-3 flex flex-col gap-2.5 rounded-[14px] border border-line bg-bg p-3.5">
          {CATEGORIES.map((c) => (
            <StarInput
              key={c.key}
              label={c.label}
              value={scores[c.key]}
              onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))}
            />
          ))}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="한줄 후기 (선택 · 500자 이내) — 예: 저녁 8시 이후 주차 자리가 부족해요"
            className="w-full resize-none rounded-xl border border-line bg-surface p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
          />
          {/* [966] 글자 수 — maxLength 와 같은 상한 */}
          <div className="-mt-1.5 flex justify-end">
            <CharCount value={comment} max={500} />
          </div>

          {/* 신뢰 신호 — 실거주/방문 인증 (선택) */}
          <div className="flex flex-col gap-2">
            <span className="t-sub font-bold text-text-2">신뢰 정보 (선택)</span>
            <div className="flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 t-sub text-text-1">
                <input
                  type="checkbox"
                  checked={isResident}
                  onChange={(e) => setIsResident(e.target.checked)}
                  className="accent-primary"
                />
                실거주 (자가/세입자)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 t-sub text-text-1">
                <input
                  type="checkbox"
                  checked={isVisitVerified}
                  onChange={(e) => setIsVisitVerified(e.target.checked)}
                  className="accent-primary"
                />
                방문 (임장)
              </label>
            </div>
            <input
              type="text"
              value={residentPeriod}
              onChange={(e) => setResidentPeriod(e.target.value)}
              maxLength={60}
              placeholder="거주/방문 시기 (선택) — 예: 2023~2024, 2024년 3월 방문"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 t-sub text-ink outline-none placeholder:text-text-3 focus:border-primary"
            />
          </div>

          {error && <div className="t-sub font-semibold text-danger">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitState === "sending"}
              className="btn-primary flex-1 rounded-xl p-2.5 t-body disabled:opacity-60"
            >
              {submitState === "sending" ? "등록 중…" : "후기 등록"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setError(null);
              }}
              className="btn-secondary rounded-xl px-4 py-2.5 t-body"
            >
              취소
            </button>
          </div>
          <p className="t-caption text-text-3">
            개인 특정·비방 내용은 삭제될 수 있어요 · 시간당 5회까지 등록 가능
          </p>
        </div>
      )}

      {/* 평균 요약 */}
      {summary && summary.count > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[14px] border border-line bg-bg px-3.5 py-3">
          <div className="flex items-baseline gap-1.5">
            <span className="t-title text-ink">
              {summary.overall.toFixed(1)}
            </span>
            <Stars value={summary.overall} size={13} />
            <span className="t-sub text-text-3">후기 {summary.count}개</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 t-sub text-text-2">
            {CATEGORIES.map((c) => (
              <span key={c.key}>
                {c.label}{" "}
                <strong className="text-ink">
                  {(summary[c.avgKey as keyof Summary] as number).toFixed(1)}
                </strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 목록 */}
      {loadState === "loading" && (
        <div className="mt-3 py-6 text-center t-sub text-text-3">
          후기를 불러오는 중…
        </div>
      )}
      {loadState === "error" && (
        <div className="mt-3 py-6 text-center t-sub text-text-3">
          후기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </div>
      )}
      {loadState === "ready" && reviews.length === 0 && (
        <div className="mt-3 flex flex-col items-center gap-1 py-6 text-center">
          <div className="t-body font-extrabold text-ink">
            아직 등록된 거주민 후기가 없어요
          </div>
          <div className="t-sub text-text-3">
            이 단지를 다녀오셨다면 첫 후기를 남겨주세요
          </div>
        </div>
      )}
      {loadState === "ready" && reviews.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="t-sub font-extrabold text-ink">{r.author}</span>
                <Stars
                  value={
                    (r.noiseScore +
                      r.parkingScore +
                      r.mgmtScore +
                      r.neighborScore +
                      r.transportScore) /
                    5
                  }
                />
                <span className="t-caption text-text-3">{formatDate(r.createdAt)}</span>
                <ReportButton postId={`complex-review:${r.id}`} className="ml-auto" />
              </div>

              {/* 신뢰 배지 — 실거주 / 방문 / 시기 */}
              {(r.isResident || r.isVisitVerified || r.residentPeriod) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.isResident && (
                    <span
                      className="chip chip-pad t-caption"
                      style={{ background: "var(--success-soft)", color: "var(--success)" }}
                    >
                      실거주
                    </span>
                  )}
                  {r.isVisitVerified && (
                    <span className="chip bg-primary-soft chip-pad t-caption text-primary">
                      방문
                    </span>
                  )}
                  {r.residentPeriod && (
                    <span className="t-caption text-text-3">{r.residentPeriod}</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 t-caption text-text-3">
                {CATEGORIES.map((c) => (
                  <span key={c.key}>
                    {c.label} {r[c.key]}
                  </span>
                ))}
              </div>
              {r.comment && (
                <p className="t-body text-text-1">{r.comment}</p>
              )}

              {/* 도움돼요 투표 */}
              <div className="mt-0.5 flex items-center">
                <button
                  type="button"
                  onClick={() => void voteHelpful(r.id)}
                  disabled={votedIds[r.id] || helpfulBusy[r.id]}
                  aria-pressed={votedIds[r.id] ?? false}
                  className={`press chip inline-flex items-center gap-1 border border-line px-2.5 py-1 text-[12px] ${
                    votedIds[r.id]
                      ? "bg-primary-soft text-primary"
                      : "bg-surface text-text-2 hover:text-primary"
                  } disabled:opacity-70`}
                >
                  <Icon name="👍" size={13} />
                  도움돼요 {helpfulOverride[r.id] ?? r.helpfulCount ?? 0}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
