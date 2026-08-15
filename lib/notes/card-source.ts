import "server-only";
import type { InspectionNote } from "@/lib/inspection/store-db";
import type { NoteCardSource } from "@/lib/notes/card-frames";

/**
 * InspectionNote(DB 모델) → NoteCardSource(카드 프레임 입력) 어댑터. **한 곳에서만.**
 *
 * 프레임은 노트 스키마를 몰라야 한다(card-frames.ts) — 노트 컬럼이 바뀌면 이 파일만
 * 고친다. 사실 우선: 없는 값은 null/빈 배열로 두고 지어내지 않는다 → 해당 프레임이
 * available 에서 자동으로 빠진다.
 */

const AXES: { key: keyof InspectionNote["scores"]; label: string }[] = [
  { key: "location", label: "입지" },
  { key: "school", label: "학군" },
  { key: "transport", label: "교통" },
  { key: "facility", label: "시설" },
  { key: "future", label: "미래가치" },
];

/** 여러 줄/구분자를 항목 배열로 — 장단점·리스크 문장을 리스트 장으로. */
function splitItems(s: string | null | undefined, max = 5): string[] {
  return (s ?? "")
    .split(/\r?\n|·|,|、|\/|;/)
    .map((x) => x.trim().replace(/^[-•*]\s*/, ""))
    .filter((x) => x.length > 0)
    .slice(0, max);
}

export function toCardSource(note: InspectionNote): NoteCardSource {
  const visitLabel = note.visitDate
    ? `${note.visitDate.slice(0, 7).replace("-", ".")} 방문`
    : null;

  const scores = AXES.map(({ key, label }) => {
    const v = Number(note.scores?.[key] ?? 0);
    return { label, value: v > 0 ? v : null }; // 0 = 미입력(사실 우선)
  });

  /* 체크리스트 — 노트마다 성격이 다르다. 어떤 노트는 done 플래그가 있는 yes/no
     항목이고, 어떤 노트는 "현장에서 확인할 것" 리마인더 문자열이다(실측: 은마
     노트는 후자 6건, done 없음). 둘 다 담되, done 이 있으면 "좋음"으로, 없으면
     rating 을 비워 리마인더 리스트로 그린다. 라벨은 카드 폭에 맞춰 48자로 자른다. */
  const checks = (note.checklist ?? [])
    .filter((c) => c.label?.trim())
    .slice(0, 6)
    .map((c) => ({
      label: c.label.trim().length > 48 ? `${c.label.trim().slice(0, 47)}…` : c.label.trim(),
      rating: c.done ? "좋음" : "",
    }));

  const pros = splitItems(note.sections?.pros);
  const cons = splitItems(note.sections?.cons);

  return {
    title: note.title || "임장 기록",
    aptName: note.aptName ?? null,
    region: note.region ?? null,
    visitLabel,
    // 별도 verdict 컬럼은 모델에 없다 — 메모(sections.memo)가 있으면 판정 장으로.
    verdict: (note.sections?.memo ?? "").trim() || null,
    intent: note.metadata?.intent ?? null,
    budgetLabel: null,
    summary: (note.summary ?? "").trim() || null,
    risks: null,
    weather: note.weather ?? null,
    transportation: note.transportation ?? null,
    scores,
    checks,
    pros,
    cons,
    tags: [],
    hasLocation: Boolean(note.metadata?.lat && note.metadata?.lng),
  };
}
