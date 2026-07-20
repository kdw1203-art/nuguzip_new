"use client";

/**
 * 거주민 후기 섹션 (호갱노노 "이야기" 벤치마크 — docs/benchmark-proposals.md D4 계열)
 * - GET /api/complex-reviews?complexId= 로 목록·평균 표시 (빈 상태 정직)
 * - 로그인 시 작성: 항목별 별점(1~5) + 한줄 후기 → POST /api/complex-reviews (5회/시간 제한)
 * - 비로그인 작성 시도 → /login 이동 (401)
 * - 신고: 기존 ReportButton 재사용 (postId = "complex-review:<id>")
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ReportButton } from "../components/ReportButton";

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
      className="font-bold text-[#e8a13a]"
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
            className={`text-[18px] leading-none transition-colors ${
              n <= value ? "text-[#e8a13a]" : "text-line hover:text-[#e8a13a]/50"
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
  const router = useRouter();
  const pathname = usePathname();
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
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

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
        }),
      });
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(pathname ?? "/")}`);
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
      await load();
    } catch {
      setError("후기 등록에 실패했어요. 네트워크를 확인해 주세요.");
      setSubmitState("idle");
    }
  };

  return (
    <div className="card rounded-[18px] px-[18px] py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-ink">거주민 후기</h2>
        {!formOpen && (
          <button
            type="button"
            onClick={() => {
              setFormOpen(true);
              setSubmitState("idle");
              setError(null);
            }}
            className="btn-primary rounded-[10px] px-3.5 py-2 text-[12px]"
          >
            후기 쓰기
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-text-3">
        직접 살아봤거나 임장에서 확인한 내용만 남겨주세요 · 같은 단지 재작성 시 기존 후기가
        갱신돼요
      </p>

      {submitState === "done" && (
        <div className="mt-2 rounded-[10px] bg-primary-soft px-3 py-2 text-[12px] font-bold text-primary">
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
            className="w-full resize-none rounded-xl border border-line bg-surface p-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-text-3 focus:border-primary"
          />
          {error && <div className="text-[11px] font-semibold text-danger">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitState === "sending"}
              className="btn-primary flex-1 rounded-xl p-2.5 text-[13px] disabled:opacity-60"
            >
              {submitState === "sending" ? "등록 중…" : "후기 등록"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setError(null);
              }}
              className="btn-secondary rounded-xl px-4 py-2.5 text-[13px]"
            >
              취소
            </button>
          </div>
          <p className="text-[10px] leading-[1.5] text-text-3">
            개인 특정·비방 내용은 삭제될 수 있어요 · 시간당 5회까지 등록 가능
          </p>
        </div>
      )}

      {/* 평균 요약 */}
      {summary && summary.count > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[14px] border border-line bg-bg px-3.5 py-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-extrabold text-ink">
              {summary.overall.toFixed(1)}
            </span>
            <Stars value={summary.overall} size={13} />
            <span className="text-[11px] text-text-3">후기 {summary.count}개</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-2">
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
        <div className="mt-3 py-6 text-center text-[12px] text-text-3">
          후기를 불러오는 중…
        </div>
      )}
      {loadState === "error" && (
        <div className="mt-3 py-6 text-center text-[12px] text-text-3">
          후기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </div>
      )}
      {loadState === "ready" && reviews.length === 0 && (
        <div className="mt-3 flex flex-col items-center gap-1 py-6 text-center">
          <div className="text-[13px] font-extrabold text-ink">
            아직 등록된 거주민 후기가 없어요
          </div>
          <div className="text-[12px] text-text-3">
            이 단지를 다녀오셨다면 첫 후기를 남겨주세요
          </div>
        </div>
      )}
      {loadState === "ready" && reviews.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-extrabold text-ink">{r.author}</span>
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
                <span className="text-[10px] text-text-3">{formatDate(r.createdAt)}</span>
                <ReportButton postId={`complex-review:${r.id}`} className="ml-auto" />
              </div>
              <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] text-text-3">
                {CATEGORIES.map((c) => (
                  <span key={c.key}>
                    {c.label} {r[c.key]}
                  </span>
                ))}
              </div>
              {r.comment && (
                <p className="text-[13px] leading-[1.6] text-text-1">{r.comment}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
