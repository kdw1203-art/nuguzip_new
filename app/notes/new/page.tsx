"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* 시안 6b(노트 작성 기본) + 6r(작성 확장판 — 선택·필터·고려사항)
   저장: POST /api/inspection/notes (구 코드베이스 임장노트 작성 엔드포인트)
   #45(11a) 임시저장: 입력 변경 시 localStorage(nz_note_draft) 1초 디바운스 자동 저장,
   재방문 시 상단 복구 배너(이어서 쓰기 / 삭제) 표시 */

const LEVELS = ["좋음", "보통", "아쉬움"] as const;
type Level = (typeof LEVELS)[number];

const CHECK_DEFAULTS: Record<string, Level> = {
  채광: "좋음",
  소음: "보통",
  주차: "아쉬움",
  교통: "좋음",
  경사: "보통",
};

const VISIT_GROUPS: { label: string; options: string[] }[] = [
  { label: "유형", options: ["아파트", "빌라", "오피스텔"] },
  { label: "시간대", options: ["오전", "오후", "저녁", "주말"] },
  { label: "목적", options: ["실거주", "투자", "갈아타기"] },
];

const TAGS: { label: string; tone: "pos" | "neg" }[] = [
  { label: "초품아", tone: "pos" },
  { label: "남향 위주", tone: "pos" },
  { label: "역세권", tone: "pos" },
  { label: "커뮤니티 시설", tone: "pos" },
  { label: "이중주차", tone: "neg" },
  { label: "노후 배관", tone: "neg" },
];

const TODOS: { text: string; level: "중요" | "보통" }[] = [
  { text: "겨울철 저층 채광 재확인", level: "중요" },
  { text: "관리비 내역·배관 교체 이력 문의", level: "보통" },
];

const LEVEL_SCORE: Record<Level, number> = { 좋음: 5, 보통: 3, 아쉬움: 1 };

const APT_NAME = "공작아파트 302동 84A";
const REGION = "안양 관양동";

/* ===== #45 임시저장 (localStorage) ===== */

const DRAFT_KEY = "nz_note_draft";

type NoteDraft = {
  v: 1;
  savedAt: string;
  checks: Record<string, Level>;
  visit: Record<string, string>;
  tags: string[];
  doneTodos: string[];
  satisfaction: number;
  memo: string;
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parseDraft(raw: string | null): NoteDraft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || o.v !== 1) return null;
    if (
      typeof o.savedAt !== "string" ||
      typeof o.memo !== "string" ||
      typeof o.satisfaction !== "number" ||
      !o.checks ||
      typeof o.checks !== "object" ||
      !o.visit ||
      typeof o.visit !== "object" ||
      !isStringArray(o.tags) ||
      !isStringArray(o.doneTodos)
    ) {
      return null;
    }
    const checks: Record<string, Level> = {};
    for (const [k, val] of Object.entries(o.checks as Record<string, unknown>)) {
      if (typeof val === "string" && (LEVELS as readonly string[]).includes(val)) {
        checks[k] = val as Level;
      }
    }
    const visit: Record<string, string> = {};
    for (const [k, val] of Object.entries(o.visit as Record<string, unknown>)) {
      if (typeof val === "string") visit[k] = val;
    }
    return {
      v: 1,
      savedAt: o.savedAt,
      checks,
      visit,
      tags: o.tags,
      doneTodos: o.doneTodos,
      satisfaction: o.satisfaction,
      memo: o.memo,
    };
  } catch {
    return null;
  }
}

export default function NoteNewPage() {
  const router = useRouter();
  /* 연결성: /complex/[id] → /notes/new?apt=단지명 프리필
     (useSearchParams 대신 window 조회 — Suspense 경계 불필요, search-client와 동일 패턴) */
  const [aptName, setAptName] = useState(APT_NAME);
  useEffect(() => {
    try {
      const apt = new URLSearchParams(window.location.search).get("apt")?.trim();
      if (apt) setAptName(apt.slice(0, 60));
    } catch {
      /* URL 파싱 실패 — 기본 단지명 유지 */
    }
  }, []);
  const [checks, setChecks] = useState<Record<string, Level>>(CHECK_DEFAULTS);
  const [visit, setVisit] = useState<Record<string, string>>({
    유형: "아파트",
    시간대: "오후",
    목적: "실거주",
  });
  const [tags, setTags] = useState<string[]>(["초품아", "남향 위주", "이중주차"]);
  const [doneTodos, setDoneTodos] = useState<string[]>([]);
  const [satisfaction, setSatisfaction] = useState(7.5);
  const [memo, setMemo] = useState(
    "남향이라 오후 채광 좋음. 단지 뒤 도로 소음 약간 있음"
  );
  const [savedDraft, setSavedDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* #45 복구 배너용 드래프트 스냅샷 — 마운트 시 1회 읽고, 배너에서 복원/삭제 */
  const [pendingDraft, setPendingDraft] = useState<NoteDraft | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      setPendingDraft(parseDraft(window.localStorage.getItem(DRAFT_KEY)));
    } catch {
      /* 프라이빗 모드 등 접근 불가 — 배너 없이 진행 */
    }
  }, []);

  const buildDraft = (): NoteDraft => ({
    v: 1,
    savedAt: new Date().toISOString(),
    checks,
    visit,
    tags,
    doneTodos,
    satisfaction,
    memo,
  });

  const writeDraft = () => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraft()));
      setSavedDraft(true);
    } catch {
      /* 저장 불가 환경 — 조용히 무시 */
    }
  };

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* no-op */
    }
  };

  /* 입력 변경 시 1초 디바운스 자동 저장 (첫 렌더는 제외) */
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            v: 1,
            savedAt: new Date().toISOString(),
            checks,
            visit,
            tags,
            doneTodos,
            satisfaction,
            memo,
          } satisfies NoteDraft),
        );
        setSavedDraft(true);
      } catch {
        /* no-op */
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [checks, visit, tags, doneTodos, satisfaction, memo]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setChecks({ ...CHECK_DEFAULTS, ...pendingDraft.checks });
    setVisit((prev) => ({ ...prev, ...pendingDraft.visit }));
    setTags(pendingDraft.tags);
    setDoneTodos(pendingDraft.doneTodos);
    setSatisfaction(pendingDraft.satisfaction);
    setMemo(pendingDraft.memo);
    setPendingDraft(null);
  };

  const discardDraft = () => {
    clearDraft();
    setPendingDraft(null);
  };

  const draftSavedLabel = (() => {
    if (!pendingDraft) return null;
    const t = Date.parse(pendingDraft.savedAt);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} 저장됨`;
  })();

  const toggleTag = (label: string) =>
    setTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]
    );
  const toggleTodo = (text: string) =>
    setDoneTodos((prev) =>
      prev.includes(text) ? prev.filter((t) => t !== text) : [...prev, text]
    );

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setNeedLogin(false);
    setSaveError(null);
    const lv = (k: string): number => LEVEL_SCORE[checks[k] ?? "보통"];
    const posTags = TAGS.filter((t) => t.tone === "pos" && tags.includes(t.label));
    const negTags = TAGS.filter((t) => t.tone === "neg" && tags.includes(t.label));
    try {
      const res = await fetch("/api/inspection/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${aptName} 임장 기록`,
          region: REGION,
          aptName,
          visitDate: new Date().toISOString().slice(0, 10),
          transportation: visit["시간대"] ?? null,
          summary: memo.trim() || undefined,
          scores: {
            location: lv("경사"),
            school: Math.max(1, Math.round(satisfaction / 2)),
            transport: lv("교통"),
            facility: Math.round((lv("채광") + lv("소음") + lv("주차")) / 3),
            future: Math.max(1, Math.round(satisfaction / 2)),
          },
          checklist: TODOS.map((t) => ({
            label: t.text,
            done: doneTodos.includes(t.text),
          })),
          sections: {
            memo: memo.trim() || undefined,
            pros: posTags.map((t) => t.label).join(" · ") || undefined,
            cons: negTags.map((t) => t.label).join(" · ") || undefined,
          },
          isPublic: true,
        }),
      });
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      const json: { note?: { id: string }; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !json.note?.id) {
        setSaveError(json.error ?? "저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      clearDraft(); // 정식 저장 완료 — 임시저장본 제거
      router.push(`/notes/${json.note.id}`);
    } catch {
      setSaveError("네트워크 오류로 저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-5 pb-10">
      {/* 상단 바 */}
      <div className="glass sticky top-3.5 z-40 mt-3.5 flex items-center justify-between rounded-2xl px-4 py-3">
        <Link href="/notes" aria-label="닫기" className="text-base text-text-1">
          ✕
        </Link>
        <div className="flex flex-col items-center">
          <div className="text-[15px] font-extrabold text-ink">임장노트</div>
          <div className="text-[10px] text-text-3">2/3 단계 · 현장 기록</div>
        </div>
        <button
          type="button"
          onClick={writeDraft}
          className="text-[13px] font-bold text-primary"
        >
          {savedDraft ? "저장됨 ✓" : "임시저장"}
        </button>
      </div>

      {/* 진행 바 66% */}
      <div className="relative mt-2.5 h-1 rounded-sm bg-[#e9edf3]">
        <div className="absolute left-0 top-0 h-1 w-[66%] rounded-sm bg-primary" />
      </div>

      <div className="mt-3.5 flex flex-col gap-3">
        {/* #45 임시저장 복구 배너 */}
        {pendingDraft && (
          <div className="rise-in flex items-center gap-2.5 rounded-[14px] border border-[rgba(29,79,216,.2)] bg-[rgba(29,79,216,.06)] px-4 py-3">
            <span className="text-base">📝</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-ink">
                작성 중이던 노트가 있어요
              </div>
              {draftSavedLabel && (
                <div className="text-[10px] text-text-3">{draftSavedLabel}</div>
              )}
            </div>
            <button
              type="button"
              onClick={restoreDraft}
              className="shrink-0 rounded-[9px] bg-primary px-3 py-2 text-[11px] font-bold text-white"
            >
              이어서 쓰기
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="shrink-0 rounded-[9px] border border-[#e2e7ee] bg-surface px-3 py-2 text-[11px] font-bold text-text-2"
            >
              삭제
            </button>
          </div>
        )}

        {/* 로그인 없이 작성 안내 */}
        <div className="rise-in rounded-[14px] border border-[rgba(29,79,216,.15)] bg-[rgba(29,79,216,.08)] px-4 py-3 text-center text-xs font-semibold text-primary">
          로그인 없이 작성할 수 있어요 — 저장할 때만 로그인이 필요해요
        </div>

        {/* 위치 카드 */}
        <div className="rise-in-1 card flex items-center gap-2 rounded-[14px] px-3.5 py-3">
          <span className="text-sm">📍</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-ink">{aptName}</div>
            <div className="text-[11px] text-text-3">현재 위치 자동 인식 · 수정</div>
          </div>
          <span className="text-[13px] text-[#c3cad6]">›</span>
        </div>

        {/* 방문 정보 */}
        <div className="rise-in-2 card flex flex-col gap-2.5 p-4">
          <div className="text-[13px] font-extrabold text-ink">방문 정보</div>
          {VISIT_GROUPS.map((g) => (
            <div key={g.label} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-text-2">{g.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map((opt) => {
                  const active = visit[g.label] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setVisit((prev) => ({ ...prev, [g.label]: opt }))
                      }
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        active
                          ? "border-[1.5px] border-primary bg-[rgba(29,79,216,.1)] font-bold text-primary"
                          : "border border-[#e2e7ee] bg-surface text-text-2"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 현장 체크 — 세그먼트 평가 */}
        <div className="rise-in-3 card flex flex-col gap-2.5 p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-extrabold text-ink">
              현장 체크{" "}
              <span className="text-xs font-medium text-text-3">
                탭 한 번으로 기록
              </span>
            </div>
            <button type="button" className="text-[11px] font-bold text-primary">
              항목 편집
            </button>
          </div>
          {Object.keys(CHECK_DEFAULTS).map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <span className="w-12 shrink-0 text-[13px] font-semibold text-text-1">
                {item}
              </span>
              <div className="flex gap-1.5">
                {LEVELS.map((lv) => {
                  const active = checks[item] === lv;
                  return (
                    <button
                      key={lv}
                      type="button"
                      onClick={() =>
                        setChecks((prev) => ({ ...prev, [item]: lv }))
                      }
                      className={`flex h-9 items-center justify-center rounded-[10px] px-3 text-xs ${
                        active
                          ? "border-[1.5px] border-primary bg-[rgba(29,79,216,.1)] font-bold text-primary"
                          : "border border-[#e2e7ee] bg-surface font-semibold text-text-2"
                      }`}
                    >
                      {lv}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="flex items-center justify-center rounded-xl border-[1.5px] border-dashed border-[#c9d4e5] bg-bg px-3 py-2.5 text-xs font-semibold text-text-3"
          >
            ＋ 항목 추가
          </button>

          {/* 종합 만족도 */}
          <div className="mt-0.5 flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-text-2">종합 만족도</span>
              <span className="font-extrabold text-primary">
                {satisfaction.toFixed(1)} / 10
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={satisfaction}
              onChange={(e) => setSatisfaction(Number(e.target.value))}
              className="w-full accent-[#1d4fd8]"
              aria-label="종합 만족도"
            />
          </div>
        </div>

        {/* 눈에 띈 점 태그 */}
        <div className="rise-in-4 card flex flex-col gap-2.5 p-4">
          <div className="text-[13px] font-extrabold text-ink">
            눈에 띈 점{" "}
            <span className="text-[11px] font-medium text-text-3">
              탭해서 태그 추가
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((t) => {
              const active = tags.includes(t.label);
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => toggleTag(t.label)}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    active
                      ? t.tone === "neg"
                        ? "bg-danger-soft font-bold text-danger"
                        : "bg-[rgba(29,79,216,.1)] font-bold text-primary"
                      : "border border-[#e2e7ee] bg-surface text-text-2"
                  }`}
                >
                  {active ? "✓ " : ""}
                  {t.label}
                </button>
              );
            })}
            <button
              type="button"
              className="rounded-full bg-[#f2f4f8] px-3 py-1.5 text-xs text-text-3"
            >
              ＋ 직접 입력
            </button>
          </div>
        </div>

        {/* 고려사항 체크리스트 */}
        <div className="rise-in-5 card flex flex-col gap-2.5 p-4">
          <div className="text-[13px] font-extrabold text-ink">
            고려사항{" "}
            <span className="text-[11px] font-medium text-text-3">
              결정 전 꼭 확인할 것
            </span>
          </div>
          {TODOS.map((todo) => {
            const done = doneTodos.includes(todo.text);
            return (
              <button
                key={todo.text}
                type="button"
                onClick={() => toggleTodo(todo.text)}
                className="flex items-center gap-2.5 rounded-xl bg-bg px-3 py-[11px] text-left"
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px] ${
                    done
                      ? "bg-primary text-white"
                      : "border-[1.5px] border-[#c9d4e5] bg-surface"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                <span
                  className={`flex-1 text-[13px] ${
                    done ? "text-text-3 line-through" : "text-text-1"
                  }`}
                >
                  {todo.text}
                </span>
                <span
                  className={`rounded-full px-2 py-[3px] text-[10px] font-bold ${
                    todo.level === "중요"
                      ? "bg-danger-soft text-danger"
                      : "bg-[#f2f4f8] text-text-2"
                  }`}
                >
                  {todo.level}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border-[1.5px] border-dashed border-[#c9d4e5] px-3 py-[11px] text-[13px] text-text-3"
          >
            ＋ 고려사항 추가 (음성 입력 가능)
          </button>
        </div>

        {/* 메모 */}
        <div className="rise-in-6 card flex flex-col gap-2.5 p-4">
          <div className="text-sm font-extrabold text-ink">
            메모{" "}
            <span className="text-xs font-medium text-text-3">
              음성으로도 남길 수 있어요
            </span>
          </div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            className="min-h-16 w-full resize-none rounded-xl bg-bg p-3.5 text-sm leading-[1.55] text-text-1 outline-none placeholder:text-text-3"
            placeholder="현장에서 본 것을 그대로 적어보세요"
            aria-label="메모"
          />

          {/* 사진 업로드 플레이스홀더 */}
          <div className="flex gap-2 overflow-x-auto">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex h-[62px] w-[84px] shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef] font-mono text-[10px] text-text-3"
              >
                현장 사진
              </div>
            ))}
            <button
              type="button"
              className="flex h-[62px] w-[84px] shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[#c9d4e5] text-[11px] font-bold text-text-3"
            >
              ＋ 추가
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-[10px] bg-bg p-[11px] text-center text-[13px] font-bold text-text-1"
            >
              📷 사진 4
            </button>
            <button
              type="button"
              className="flex-1 rounded-[10px] bg-bg p-[11px] text-center text-[13px] font-bold text-text-1"
            >
              🎙 음성 메모
            </button>
          </div>
        </div>
      </div>

      {/* 하단 CTA */}
      <div className="mt-4 flex flex-col gap-2">
        {needLogin && (
          <div className="rounded-[14px] border border-[rgba(29,79,216,.2)] bg-[rgba(29,79,216,.08)] px-4 py-3 text-center text-[13px] text-primary">
            저장하려면 로그인이 필요해요 — 작성한 내용은 유지돼요.{" "}
            <Link href="/login" className="font-extrabold underline underline-offset-2">
              로그인하기 ›
            </Link>
          </div>
        )}
        {saveError && (
          <div className="rounded-[14px] border border-[rgba(214,69,69,.2)] bg-danger-soft px-4 py-3 text-center text-[13px] font-semibold text-danger">
            {saveError}
          </div>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary rounded-2xl p-[15px] text-center text-base disabled:opacity-60"
          style={{ boxShadow: "0 10px 26px rgba(29,79,216,.35)" }}
        >
          {saving ? "저장 중…" : "기록 완료 → AI 정리 받기"}
        </button>
        <div className="text-center text-xs text-text-3">
          저장할 때만 로그인 · 체크 항목은 다음 임장에도 유지
        </div>
      </div>
    </div>
  );
}
