"use client";

import { useMemo, useState } from "react";
import { CardFrameView } from "./CardFrameView";
import { CARD_THEMES, getCardTheme } from "@/lib/notes/card-themes";
import { MIN_FRAMES, MAX_FRAMES } from "@/lib/notes/card-config";
import type { FrameContent } from "@/lib/notes/card-frames";

/**
 * 나만의 카드 스튜디오 — 테마 10종 선택 + 프레임(장) 선택(최소 5, 표지 고정) +
 * 라이브 미리보기 캐러셀 + 저장. 소유자만 편집, 비소유자는 캐러셀만.
 *
 * 서버가 넘겨준 것: 이 노트에서 채울 수 있는 프레임들의 완성 콘텐츠(available)와
 * 저장된/자동 구성. 클라이언트는 토글·순서·테마만 다루고 콘텐츠는 서버 build()
 * 결과를 그대로 쓴다(콘텐츠 로직 이원화 방지).
 */

export type AvailableFrame = {
  id: string;
  label: string;
  category: string;
  content: FrameContent;
};

export function NoteCardStudio({
  noteId,
  available,
  initialThemeId,
  initialFrameIds,
  editable,
}: {
  noteId: string;
  available: AvailableFrame[];
  initialThemeId: string;
  initialFrameIds: string[];
  editable: boolean;
}) {
  const byId = useMemo(() => new Map(available.map((f) => [f.id, f])), [available]);
  const [themeId, setThemeId] = useState(initialThemeId);
  // 표지는 항상 첫 장 고정. 선택 순서 = 장 순서.
  const [selected, setSelected] = useState<string[]>(() => {
    const s = initialFrameIds.filter((id) => byId.has(id));
    return s[0] === "cover" ? s : ["cover", ...s.filter((x) => x !== "cover")];
  });
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const theme = getCardTheme(themeId);
  const frames = selected.map((id) => byId.get(id)).filter((f): f is AvailableFrame => Boolean(f));
  const activeFrame = frames[Math.min(active, frames.length - 1)];

  function toggle(id: string) {
    if (id === "cover") return; // 표지 고정
    setSelected((cur) => {
      if (cur.includes(id)) {
        if (cur.length <= MIN_FRAMES) {
          setMsg(`최소 ${MIN_FRAMES}장이 필요해요`);
          return cur;
        }
        setMsg(null);
        return cur.filter((x) => x !== id);
      }
      if (cur.length >= MAX_FRAMES) {
        setMsg(`최대 ${MAX_FRAMES}장까지 담을 수 있어요`);
        return cur;
      }
      setMsg(null);
      return [...cur, id];
    });
  }

  async function save() {
    setSaving(true);
    setSaved("idle");
    try {
      const res = await fetch(`/api/notes/${noteId}/card-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, frameIds: selected }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        config?: { themeId: string; frameIds: string[] };
        error?: string;
      };
      if (res.ok && j.ok && j.config) {
        setSelected(j.config.frameIds.filter((id) => byId.has(id)));
        setThemeId(j.config.themeId);
        setSaved("ok");
        setMsg("카드를 저장했어요");
      } else {
        setSaved("err");
        setMsg(j.error ?? "저장에 실패했어요");
      }
    } catch {
      setSaved("err");
      setMsg("네트워크 오류로 저장하지 못했어요");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      {/* 미리보기 캐러셀 */}
      <div className="mx-auto w-full max-w-[320px] shrink-0 md:mx-0">
        {activeFrame ? (
          <CardFrameView content={activeFrame.content} theme={theme} index={active} total={frames.length} />
        ) : (
          <div className="aspect-[4/5] w-full rounded-[18px] bg-[rgba(0,0,0,.05)]" />
        )}
        {/* 장 네비게이션 (점) */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {frames.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`${i + 1}번째 장 (${f.label})`}
              className={`h-2 rounded-full transition-all ${
                i === active ? "w-5 bg-primary" : "w-2 bg-[rgba(0,0,0,.18)]"
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-center t-sub text-text-3">
          {frames.length}장 · {activeFrame?.label ?? ""}
        </p>
      </div>

      {editable ? (
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* 테마 10종 */}
          <div>
            <div className="mb-2 t-sub font-extrabold text-ink">카드 색상 테마</div>
            <div className="flex flex-wrap gap-2">
              {CARD_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setThemeId(t.id)}
                  aria-label={t.label}
                  title={t.label}
                  className={`flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold transition-all ${
                    themeId === t.id ? "border-primary ring-2 ring-primary/30" : "border-line"
                  }`}
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-black/10"
                    style={{ background: t.bg }}
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 프레임(장) 선택 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="t-sub font-extrabold text-ink">
                카드에 담을 장 (최소 {MIN_FRAMES}장)
              </span>
              <span className="t-sub text-text-3">{selected.length}장 선택</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {available.map((f) => {
                const on = selected.includes(f.id);
                const locked = f.id === "cover";
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggle(f.id)}
                    disabled={locked}
                    className={`flex items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-left text-[12px] font-bold transition-all ${
                      on
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-line bg-surface text-text-2"
                    } ${locked ? "opacity-70" : ""}`}
                  >
                    <span className="t-body">{on ? "✓" : "+"}</span>
                    <span className="min-w-0 truncate">{f.label}</span>
                    {locked && <span className="ml-auto t-caption text-text-3">고정</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="btn-primary btn-sm rounded-[10px] px-4 py-2 t-body font-bold disabled:opacity-60"
            >
              {saving ? "저장 중…" : "카드 저장"}
            </button>
            {msg && (
              <span className={`text-[12px] font-bold ${saved === "err" ? "text-danger" : "text-text-2"}`}>
                {msg}
              </span>
            )}
          </div>
          <p className="t-sub text-text-3">
            표지는 항상 첫 장이에요. 담은 장의 내용은 임장노트에서 기록한 값으로 자동으로 채워지고,
            데이터가 없는 장은 목록에 나오지 않아요.
          </p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="t-body text-text-2">
            작성자가 만든 {frames.length}장짜리 임장 카드예요. 점을 눌러 넘겨 보세요.
          </p>
        </div>
      )}
    </div>
  );
}
