import type { DataMode } from "@/components/source-meta";

export type NormalizedEvidenceRef = {
  planId?: string;
  title?: string;
  mode?: string;
  fetchedAt?: string;
  summary?: string;
  source?: string;
};

/** API·compare·노트 등 서로 다른 evidence_ref 키를 UI용으로 통일 */
export function normalizeEvidenceRef(ref: Record<string, unknown>): NormalizedEvidenceRef {
  const title =
    typeof ref.title === "string"
      ? ref.title
      : typeof ref.metric === "string"
        ? ref.metric
        : undefined;
  const summary =
    typeof ref.summary === "string"
      ? ref.summary
      : typeof ref.value === "string" || typeof ref.value === "number"
        ? String(ref.value)
        : undefined;
  const fetchedAt =
    typeof ref.fetchedAt === "string"
      ? ref.fetchedAt
      : typeof ref.asOf === "string"
        ? ref.asOf
        : typeof ref.date === "string"
          ? ref.date
          : undefined;

  return {
    planId: typeof ref.planId === "string" ? ref.planId : undefined,
    title,
    mode: typeof ref.mode === "string" ? ref.mode : undefined,
    fetchedAt,
    summary,
    source: typeof ref.source === "string" ? ref.source : undefined,
  };
}

function toDataMode(mode: string | undefined): DataMode {
  if (mode === "live") return "live";
  if (mode === "partial") return "partial";
  if (mode === "cached") return "cached";
  return "sample";
}

/** 근거 카드 목록에서 화면 상단에 쓸 대표 데이터 준비 상태 */
export function aggregateEvidenceMode(refs: Array<Record<string, unknown>>): DataMode {
  if (!refs.length) return "sample";
  const modes = refs.map((r) => toDataMode(normalizeEvidenceRef(r).mode));
  const liveCount = modes.filter((m) => m === "live").length;
  if (liveCount === modes.length) return "live";
  if (liveCount > 0) return "partial";
  if (modes.some((m) => m === "partial" || m === "cached")) return "partial";
  return "sample";
}

export function latestEvidenceDate(refs: Array<Record<string, unknown>>): string | null {
  let latest: string | null = null;
  for (const ref of refs) {
    const { fetchedAt } = normalizeEvidenceRef(ref);
    if (!fetchedAt) continue;
    const d = fetchedAt.slice(0, 10);
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

export const DATA_MODE_KO: Record<DataMode, { label: string; hint: string }> = {
  live: {
    label: "실데이터 반영",
    hint: "공공·시장 스냅샷이 이번 분석에 포함되었습니다.",
  },
  partial: {
    label: "일부 연동",
    hint: "실데이터와 샘플·캐시가 섞여 있습니다. 중요 항목은 공식 자료로 확인하세요.",
  },
  sample: {
    label: "샘플·데모",
    hint: "공공데이터가 아직 연결되지 않았거나 이번 입력에 근거가 없습니다.",
  },
  cached: {
    label: "캐시 스냅샷",
    hint: "최근 적재된 스냅샷을 사용했습니다. 최신성은 아래 기준일을 확인하세요.",
  },
};
