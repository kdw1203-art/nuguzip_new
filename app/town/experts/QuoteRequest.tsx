"use client";

/**
 * 전문가 견적 요청 플로우 (숨고 벤치마크 — docs/benchmark-proposals.md A4)
 * 카테고리(임장 동행/세무/대출/인테리어) + 지역 + 내용 → POST /api/market-requests
 * 성공 시 "전문가가 확인하면 알림으로 알려드려요" · 내 요청 목록은 GET으로 표시
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = ["임장 동행", "세무", "대출", "인테리어"] as const;
type Category = (typeof CATEGORIES)[number];

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

export function QuoteRequestBanner() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // 내 요청 목록 — 모달 열 때 조회 (비로그인 401은 조용히 무시)
  const [myRequests, setMyRequests] = useState<MyRequest[] | null>(null);
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
        router.push(`/login?callbackUrl=${encodeURIComponent("/town/experts")}`);
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
    <>
      {/* 배너 CTA */}
      <div className="rise-in-1 card mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] px-[22px] py-4">
        <div>
          <div className="text-[15px] font-extrabold text-ink">
            어떤 전문가가 필요한지 모르겠다면
          </div>
          <p className="mt-0.5 text-[12px] text-text-3">
            임장 동행·세무·대출·인테리어 — 필요한 내용을 남기면 전문가가 확인해요
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setStatus("idle");
            setError(null);
          }}
          className="btn-primary btn-cta rounded-xl px-[22px] py-[11px] text-[13px]"
        >
          견적 요청
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(16,24,40,.4)] backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="전문가 견적 요청"
        >
          <div className="max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
            {status === "done" ? (
              <div className="flex flex-col items-center gap-2.5 py-4 text-center">
                <div className="text-[15px] font-extrabold text-ink">
                  견적 요청이 접수됐어요
                </div>
                <p className="text-xs leading-[1.6] text-text-2">
                  전문가가 확인하면 알림으로 알려드려요.
                </p>
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="btn-primary mt-1 rounded-xl px-6 py-2.5 text-[13px]"
                >
                  확인
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-ink">전문가 견적 요청</span>
                  <button
                    type="button"
                    aria-label="닫기"
                    onClick={() => setOpen(false)}
                    className="text-[15px] text-text-3"
                  >
                    ✕
                  </button>
                </div>

                {/* 카테고리 */}
                <div>
                  <div className="mb-1.5 text-[11px] font-bold text-text-2">카테고리</div>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        className={`chip px-3.5 py-2 text-[12px] font-bold ${
                          category === c
                            ? "chip-active"
                            : "border border-line bg-bg text-text-2"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 지역 */}
                <div>
                  <div className="mb-1.5 text-[11px] font-bold text-text-2">지역</div>
                  <div className="flex gap-2">
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      maxLength={40}
                      placeholder="시/도 (예: 경기도)"
                      className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                    />
                    <input
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      maxLength={60}
                      placeholder="시·군·구 (예: 안양시 동안구)"
                      className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                    />
                  </div>
                </div>

                {/* 내용 */}
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="필요한 내용을 구체적으로 적어주세요 (10자 이상). 예: 관양동 구축 84㎡ 임장에 동행해 주실 분을 찾아요."
                  className="w-full resize-none rounded-xl border border-line bg-bg p-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                />
                {error && (
                  <div className="text-[11px] font-semibold text-danger">{error}</div>
                )}
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={status === "sending"}
                  className="btn-primary rounded-xl p-3 text-[13px] disabled:opacity-60"
                >
                  {status === "sending" ? "요청 중…" : "견적 요청하기"}
                </button>
                <p className="text-[10px] leading-[1.5] text-text-3">
                  시간당 3회까지 요청 가능 · 개인정보(전화번호·계좌)는 적지 마세요 ·
                  중개 의뢰가 아닌 정보 상담 요청입니다
                </p>

                {/* 내 요청 목록 */}
                {myRequests !== null && (
                  <div className="border-t border-line pt-3">
                    <div className="mb-1.5 text-[11px] font-bold text-text-2">내 요청</div>
                    {myRequests.length === 0 ? (
                      <p className="py-2 text-[12px] text-text-3">
                        아직 보낸 견적 요청이 없어요.
                      </p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-line">
                        {myRequests.slice(0, 5).map((r) => (
                          <li key={r.id} className="flex items-center gap-2 py-2">
                            <span
                              className={`shrink-0 rounded-[5px] px-[7px] py-px text-[10px] font-extrabold ${
                                r.status === "open"
                                  ? "bg-primary-soft text-primary"
                                  : "bg-[#f2f4f8] text-text-3"
                              }`}
                            >
                              {r.status === "open" ? "대기 중" : "마감"}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-ink">
                              {r.title}
                            </span>
                            <span className="shrink-0 text-[10px] text-text-3">
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
          </div>
        </div>
      )}
    </>
  );
}
